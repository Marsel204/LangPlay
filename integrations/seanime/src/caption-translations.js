// Translation stays independent of the playback clock and word-study selection.
export function createCaptionTranslations({ services, onChange = () => {} }) {
  const entries = new Map(), pending = new Map();
  let context = '', epoch = 0, enabled = false, active = [], wanted = [], working = 0;
  let interests = new Set();
  const valid = text => typeof text === 'string' && text.trim() && text.length <= 4096;
  const notify = () => Promise.resolve().then(onChange).catch(() => {});
  function pump() {
    if (!enabled) return;
    for (const sentence of wanted) {
      if (working >= 2) break;
      if (entries.has(sentence) || pending.get(sentence)?.epoch === epoch) continue;
      const job = { epoch };
      const current = () => enabled && job.epoch === epoch && interests.has(sentence);
      pending.set(sentence, job); working++;
      Promise.resolve().then(() => services.translate({ sentence, isCurrent: current,
        prefetch: !active.some(cue => cue.text === sentence) }))
        .then(value => {
          if (!current()) return;
          if (typeof value?.translation !== 'string' || !value.translation.trim() || value.translation.length > 8000) {
            throw new Error('No usable English translation returned.');
          }
          entries.set(sentence, { state: 'ready', translation: value.translation.trim() });
        }).catch(error => {
          if (current()) entries.set(sentence, { state: 'error', translation: '', message: String(error.message || error).slice(0, 2000) });
        }).finally(() => {
          working--;
          if (pending.get(sentence) === job) pending.delete(sentence);
          while (entries.size > 128) entries.delete(entries.keys().next().value);
          if (current() && active.some(cue => cue.text === sentence)) notify();
          pump();
        });
    }
  }
  function update(view, nearby = [], requested = false) {
    const playback = view?.playback;
    const identified = playback && ['clientId', 'playbackId', 'videoIdentity'].every(key => typeof playback[key] === 'string' && playback[key]);
    const next = identified && view?.source?.sourceId
      ? JSON.stringify([playback.clientId, playback.playbackId, playback.videoIdentity, view.source.sourceId, view.source.offsetMs || 0]) : '';
    const nextEnabled = !!(requested && next);
    if (context !== next || enabled !== nextEnabled) { context = next; enabled = nextEnabled; epoch++; entries.clear(); }
    active = enabled ? view.activeCues || [] : [];
    const visible = new Set(active.map(cue => cue.text));
    const upcoming = [...new Set(nearby.map(cue => cue.text))].filter(text => !visible.has(text) && valid(text)).slice(0, 3);
    wanted = enabled ? [...new Set([...visible, ...upcoming])].filter(valid).slice(0, 8) : [];
    interests = new Set(wanted);
    pump();
  }
  return { update,
    view: () => Object.fromEntries(active.map(cue => [cue.id, entries.get(cue.text) ||
      { state: valid(cue.text) ? 'loading' : 'error', translation: '' }])),
    retry() { for (const cue of active) if (entries.get(cue.text)?.state === 'error') entries.delete(cue.text); pump(); notify(); },
    cancel() { update(null); },
  };
}
