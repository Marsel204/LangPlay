import { createHost } from './host.js';
import { validateMessage } from './bridge.js';
import { createLearningController } from './learning-controller.js';
import { createServices } from './services.js';
import { createStorage } from './storage.js';
import { createCards } from './cards.js';
import { createPlayerSurface } from './player-surface.js';
import { createAutoSubtitles } from './auto-subtitles.js';

export function start(ctx) {
  const host = createHost(ctx.videoCore), storage = createStorage($storage), cards = createCards(storage);
  const saved = storage.read('preferences', {});
  let preferences = { readingMode: ['plain', 'furigana', 'romaji'].includes(saved?.readingMode) ? saved.readingMode : 'plain', autoSubtitles: saved?.autoSubtitles !== false };
  const services = createServices({ fetch: (url, options) => ctx.fetch(url, options), save: context => cards.save(context) });
  const controller = createLearningController({ host, services });
  const panel = ctx.newWebview({ slot: 'fixed', hidden: true, autoHeight: true, fullWidth: true,
    style: 'left:auto;top:auto;right:12px;bottom:12px;width:min(540px,94vw)',
    maxWidth: '94vw', maxHeight: '88vh', zIndex: 200, window: { draggable: false, frameless: true } });
  const tray = ctx.newTray({ iconUrl: '', withContent: false });
  tray.onClick(() => panel.show());
  let ticking = false, surface = null, terminated = false, terminatedIdentity = null, localSequence = 0, automatic = null;
  let manualSourceSequence = 0, pendingDiscontinuity = false;
  const parsing = new Set();
  // Visible lines must survive eviction from the bounded general parser cache.
  const activeReadings = new Map();
  const send = (event, value) => panel.channel.send(event, JSON.stringify(value));
  async function publish(waitForSurface = true) {
    const view = controller.view();
    const association = host.snapshot()?.association;
    const associations = storage.read('sources', {});
    const tokens = {};
    const activeTexts = new Set(view.activeCues.map(cue => cue.text));
    for (const text of activeReadings.keys()) if (!activeTexts.has(text)) activeReadings.delete(text);
    for (const cue of view.activeCues) {
      const cached = activeReadings.get(cue.text) || services.cached(cue.text);
      if (cached) { activeReadings.set(cue.text, cached); tokens[cue.id] = cached; }
    }
    const state = { ...view, tokens, preferences, autoSubtitles: automatic?.status() || {state:'idle',message:''},
      association: association && associations[association] || null };
    if (!panel.isHidden()) send('learning:state', state);
    const playbackIdentity = host.snapshot()?.videoIdentity;
    if (terminated && playbackIdentity && playbackIdentity !== terminatedIdentity) terminated = false;
    if (surface && !terminated) {
      const work = surface.update(state);
      if (waitForSurface) await work; else work.catch(() => {});
    }
  }
  async function tick(discontinuity = false) {
    pendingDiscontinuity = pendingDiscontinuity || discontinuity;
    if (ticking) return;
    ticking = true;
    const seeked = pendingDiscontinuity;
    pendingDiscontinuity = false;
    try {
      await controller.refresh({ discontinuity: seeked });
      if (!terminated) automatic?.update(preferences.autoSubtitles).catch(() => {});
      if (!panel.isHidden() || surface?.available) {
        await publish(false);
        for (const cue of controller.readingCues()) {
          if (parsing.size >= 4) break;
          if (!activeReadings.has(cue.text) && !services.cached(cue.text) && !parsing.has(cue.text)) {
            parsing.add(cue.text);
            services.parse(cue.text).then(tokens => {
              // A cold line (for example just after a seek) should gain its
              // readings immediately, without another 250 ms polling delay.
              if (controller.view().activeCues.some(active => active.text === cue.text)) {
                activeReadings.set(cue.text, tokens);
                return publish(false);
              }
            }).catch(() => {}).finally(() => parsing.delete(cue.text));
          }
        }
      }
    } finally { ticking = false; if (pendingDiscontinuity) await tick(); }
  }
  async function perform(op, data) {
      let result = { ok: true };
      if (op === 'refresh') await controller.refresh();
      else if (op === 'saved-list' || op === 'saved-open') result = await services.savedSubtitles({ action: op === 'saved-list' ? 'list' : 'open' });
      else if (op === 'import' || op === 'saved-import') {
        const choice = ++manualSourceSequence, before = host.snapshot();
        if (!before) throw new Error('Start an episode before loading a subtitle.');
        if (data.expectedPlayback && ['clientId', 'playbackId', 'videoIdentity'].some(key => data.expectedPlayback[key] !== before[key])) {
          throw new Error('Episode changed. Choose the subtitle for the current episode.');
        }
        const isCurrent = () => choice === manualSourceSequence;
        automatic?.cancel();
        let subtitle = data;
        if (op === 'saved-import') {
          subtitle = { ...await services.savedSubtitles({ action: 'read', name: data.name, encoding: data.encoding }), offsetMs: data.offsetMs };
          const after = host.snapshot();
          if (!after || ['clientId', 'playbackId', 'videoIdentity'].some(key => before[key] !== after[key])) throw new Error('Episode changed. Choose the subtitle for the current episode.');
        }
        if (!isCurrent()) throw new Error('A newer subtitle choice superseded this import.');
        await controller.loadSubtitle(subtitle, { expectedPlayback: before, isCurrent });
        if (!isCurrent()) throw new Error('A newer subtitle choice superseded this import.');
        const association = host.snapshot()?.association;
        if (association) {
          const sources = storage.read('sources', {});
          sources[association] = { sourceId: subtitle.sourceId, offsetMs: subtitle.offsetMs || 0 };
          const entries = Object.entries(sources).slice(-100);
          storage.write('sources', Object.fromEntries(entries));
        }
      } else if (op === 'offset') {
        controller.setOffset(data.offsetMs);
        const association = host.snapshot()?.association, sources = storage.read('sources', {});
        if (association && sources[association]) { sources[association].offsetMs = data.offsetMs; storage.write('sources', sources); }
      } else if (op === 'select') {
        const work = controller.select(data); await publish(); await work;
      } else if (op === 'close') controller.close();
      else if (op === 'resume') await controller.resume();
      else if (op === 'explain') result = await controller.explain();
      else if (op === 'translate') { const work = controller.translate(); await publish(); await work; }
      else if (op === 'chat') result = await controller.chat(data.question);
      else if (op === 'save') result = await controller.save();
      else if (op === 'export') result = { tsv: cards.tsv(), count: cards.list().length };
      else if (op === 'preferences') {
        preferences = {readingMode:data.readingMode ?? preferences.readingMode, autoSubtitles:data.autoSubtitles ?? preferences.autoSubtitles};
        storage.write('preferences', preferences); automatic?.update(preferences.autoSubtitles).catch(() => {});
      }
      else if (op === 'auto-retry') automatic?.retry().catch(() => {});
      else if (op === 'hide') { controller.close(); panel.hide(); }
      await publish();
      return result;
  }
  automatic = createAutoSubtitles({host,controller,services,storage,onChange:() => publish(false)});
  surface = createPlayerSurface({ ctx, validateVideo: video => host.matchesVideo(video), openPanel: () => panel.show(), act: async (op, data) => {
    const message = validateMessage({ v: 1, id: ++localSequence, op, data });
    return perform(message.op, message.data);
  } });
  panel.channel.on('learning:request', async raw => {
    let message;
    try {
      message = validateMessage(raw);
      const result = await perform(message.op, message.data);
      send('learning:response', { id: message.id, result });
    } catch (error) {
      send('learning:response', { id: message?.id ?? raw?.id, error: String(error.message || error) });
    }
    await publish();
  });
  ctx.videoCore.addEventListener('video-seeked', () => tick(true));
  ctx.videoCore.addEventListener('video-loaded', () => { terminated = false; return tick(); });
  ctx.videoCore.addEventListener('video-fullscreen', event => surface.fullscreen(event));
  ctx.videoCore.addEventListener('video-terminated', async () => { terminatedIdentity = host.snapshot()?.videoIdentity; terminated = true; automatic.cancel(); await surface.clear(); await tick(); });
  ctx.setInterval(() => tick().catch(() => {}), 250);
  panel.setContent(() => __LANGPLAY_UI_HTML__);
}
