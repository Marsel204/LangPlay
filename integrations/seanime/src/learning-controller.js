import { createLearningSession } from './core/session.js';
import { parseSubtitles } from './core/subtitles.js';

export function createLearningController({ host, services, now } = {}) {
  // Seanime's status has no playback-rate or observation timestamp. Use its
  // authoritative position instead of inventing elapsed playback between polls.
  const session = createLearningSession({ now, maxExtrapolationMs: 0 });
  let playback = null, source = null, drawerOpen = false, reading = '', meaning = '', error = '';
  let baseForm = '', explanation = '', reply = '', busy = false;
  const reset = () => { drawerOpen = false; reading = meaning = baseForm = error = explanation = reply = ''; busy = false; };
  const current = selection => session.isCurrent(selection) && session.selected() === selection;
  async function refresh(options = {}) {
    const next = await host.snapshot();
    const before = playback;
    session.setPlayback(next);
    playback = next;
    if (!next || !before || ['clientId', 'playbackId', 'videoIdentity'].some(k => before[k] !== next[k])) {
      source = null; reset();
    }
    if (next) session.update(next, options);
    if (options.discontinuity) reset();
    return view();
  }
  async function loadSubtitle(value) {
    await refresh();
    if (typeof value?.content !== 'string' || value.content.length > 10 * 1024 * 1024) throw new Error('Subtitle exceeds the 10 MiB text limit.');
    const parsed = parseSubtitles(value.content, value);
    session.setSource({ sourceId: parsed.sourceId, cues: parsed.cues, offsetMs: value.offsetMs });
    source = { sourceId: parsed.sourceId, format: parsed.format, cueCount: parsed.cues.length, offsetMs: value.offsetMs || 0 };
    reset();
    return view();
  }
  async function select(span) {
    const selected = session.select({ ...span, title: playback.title || '', episode: String(playback.episode || '') });
    reset(); drawerOpen = true; busy = true;
    try {
      await host.pause(selected);
      const parsed = await services.parse(selected.sentence);
      if (!current(selected)) return view();
      const tokens = Array.isArray(parsed) ? parsed : parsed?.tokens;
      if (!tokens) throw new Error('Companion parser unavailable. Captured text is still usable.');
      const token = tokens.find(t => t.start === selected.span.start && t.end === selected.span.end);
      reading = token?.reading || '';
      baseForm = token?.baseForm || token?.base_form || selected.surface;
      const found = await services.lookup({ surface: selected.surface, baseForm });
      if (current(selected)) meaning = found?.meaning || 'No entry in the local dictionary.';
    } catch (e) { if (current(selected)) error = String(e.message || e); }
    finally { if (current(selected)) busy = false; }
    return view();
  }
  async function action(name, extra = {}) {
    await refresh();
    const selected = session.selected();
    if (!selected || !current(selected)) throw new Error('Playback or selection changed. Select a word again.');
    const context = Object.freeze({ ...selected, reading, baseForm, meaning, ...extra });
    const result = await services[name](context);
    if (!current(selected)) return null;
    if (name === 'explain') explanation = result.explanation || '';
    if (name === 'chat') reply = result.reply || '';
    return result;
  }
  async function resume() {
    await refresh();
    const selected = session.selected();
    if (!selected || !current(selected)) throw new Error('Playback or selection changed; resume rejected.');
    await host.resume(selected);
    session.clearSelection(); reset();
    return view();
  }
  function view() {
    return { activeCues: session.active(), drawerOpen, selected: session.selected(), reading, baseForm, meaning,
      error, explanation, reply, busy, source, positionMs: session.position(),
      playback: playback ? { title: playback.title, episode: playback.episode, paused: playback.paused } : null };
  }
  return Object.freeze({ refresh, loadSubtitle, select, resume, view,
    close() { drawerOpen = false; return view(); },
    setOffset(value) { session.setOffset(value); if (source) source.offsetMs = value; reset(); return view(); },
    explain: () => action('explain'), save: () => action('save'),
    chat: question => action('chat', { question }),
  });
}
