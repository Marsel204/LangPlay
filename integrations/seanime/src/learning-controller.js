import { createLearningSession } from './core/session.js';
import { parseSubtitles } from './core/subtitles.js';
import { isSentenceWord } from './sentence-reading.js';

function romanizeSentence(tokens) {
  return tokens.map(token => {
    if (!token.surface.trim()) return token.surface;
    if (token.pos === '補助記号' || token.pos === '記号' || /^[\s、。…？！!?「」『』（）()<>＜＞〈〉《》【】“”‘’,.:;ー—―～♪♫]+$/.test(token.surface)) return token.surface;
    return ` ${token.romaji || token.surface}`;
  }).join('').replace(/ +/g,' ').replace(/ *\n */g,'\n').trim();
}

export function createLearningController({ host, services, now } = {}) {
  // Seanime's status has no playback-rate or observation timestamp. Use its
  // authoritative position instead of inventing elapsed playback between polls.
  const session = createLearningSession({ now, maxExtrapolationMs: 0 });
  let playback = null, source = null, drawerOpen = false, reading = '', romaji = '', meaning = '', error = '';
  let baseForm = '', explanation = '', reply = '', busy = false;
  let sentenceRomaji = '', sentenceTranslation = '', translationError = '', translationBusy = false;
  let sentenceTokens = [];
  const reset = () => {
    drawerOpen = false; reading = romaji = meaning = baseForm = error = explanation = reply = '';
    sentenceRomaji = sentenceTranslation = translationError = ''; busy = translationBusy = false;
    sentenceTokens = [];
  };
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
  async function loadSubtitle(value, {expectedPlayback, expectedSource, isCurrent = () => true} = {}) {
    await refresh();
    if (!isCurrent() || expectedPlayback && (!playback || ['clientId','playbackId','videoIdentity'].some(key => expectedPlayback[key] !== playback[key])) ||
        expectedSource !== undefined && source !== expectedSource) throw new Error('Playback, subtitle source or request changed; load rejected.');
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
      if (!current(selected)) return view();
      void translateSelection(selected);
      // The clicked surface can be looked up before a cold parse completes.
      // Cached cue tokens let all sentence definitions start immediately too.
      const initial = Promise.resolve().then(() => services.lookup({ surface: selected.surface, isCurrent: () => current(selected) })).catch(() => ({ meaning: '' }));
      initial.then(found => { if (current(selected) && !baseForm) meaning = found?.meaning || ''; });
      const cached = services.cached?.(selected.sentence);
      if (cached?.length) enrichSentence(selected, cached);
      const parsed = await services.parse(selected.sentence);
      if (!current(selected)) return view();
      const tokens = Array.isArray(parsed) ? parsed : parsed?.tokens;
      if (!tokens) throw new Error('Companion parser unavailable. Captured text is still usable.');
      sentenceRomaji = romanizeSentence(tokens);
      if (!cached?.length) enrichSentence(selected, tokens);
      const token = tokens.find(t => t.start === selected.span.start && t.end === selected.span.end);
      reading = token?.reading || '';
      romaji = token?.romaji || '';
      baseForm = token?.baseForm || token?.base_form || selected.surface;
      const found = baseForm === selected.surface ? await initial : await services.lookup({ surface: selected.surface, baseForm, isCurrent: () => current(selected) });
      if (current(selected)) meaning = found?.meaning || 'No definition available. Try selecting the word again or use Explain sentence.';
    } catch (e) { if (current(selected)) error = String(e.message || e); }
    finally { if (current(selected)) busy = false; }
    return view();
  }
  function enrichSentence(selected, tokens) {
    sentenceRomaji = romanizeSentence(tokens);
    const records = tokens.map(({ surface, romaji, pos }) => ({ surface, romaji, pos, meaning: '', meaningBusy: isSentenceWord({surface, pos}) }));
    sentenceTokens = records;
    tokens.forEach((token, index) => {
      if (!records[index].meaningBusy) return;
      Promise.resolve().then(() => current(selected) ? services.lookup({ surface: token.surface, baseForm: token.baseForm || token.base_form, isCurrent: () => current(selected) }) : null)
        .then(found => { if (current(selected) && sentenceTokens === records) records[index].meaning = found?.meaning || ''; })
        .catch(() => {})
        .finally(() => { if (current(selected) && sentenceTokens === records) records[index].meaningBusy = false; });
    });
  }
  async function translateSelection(selected) {
    if (!selected || !current(selected) || !services.translate) return;
    translationBusy = true; translationError = '';
    try {
      const result = await services.translate({ ...selected, isCurrent: () => current(selected) });
      if (current(selected)) sentenceTranslation = result.translation;
    } catch (e) { if (current(selected)) translationError = String(e.message || e); }
    finally { if (current(selected)) translationBusy = false; }
  }
  async function action(name, extra = {}) {
    await refresh();
    const selected = session.selected();
    if (!selected || !current(selected)) throw new Error('Playback or selection changed. Select a word again.');
    const context = Object.freeze({ ...selected, reading, romaji, baseForm, meaning, ...extra });
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
    return { activeCues: session.active(), drawerOpen, selected: session.selected(), reading, romaji, baseForm, meaning,
      sentenceRomaji, sentenceTokens, sentenceTranslation, translationError, translationBusy,
      error, explanation, reply, busy, source, positionMs: session.position(),
      playback: playback ? { clientId: playback.clientId, playbackId: playback.playbackId, videoIdentity: playback.videoIdentity,
        title: playback.title, episode: playback.episode, paused: playback.paused } : null };
  }
  return Object.freeze({ refresh, loadSubtitle, select, resume, view, readingCues: () => session.readingCues(),
    close() { drawerOpen = false; return view(); },
    setOffset(value) {
      const selected = session.selected();
      session.setOffset(value); if (source) source.offsetMs = value;
      if (selected !== session.selected()) reset();
      return view();
    },
    explain: () => action('explain'), save: () => action('save'),
    async translate() { await refresh(); await translateSelection(session.selected()); return view(); },
    chat: question => action('chat', { question }),
  });
}
