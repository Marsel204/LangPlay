import { createHost } from './host.js';
import { validateMessage } from './bridge.js';
import { createLearningController } from './learning-controller.js';
import { createServices } from './services.js';
import { createStorage } from './storage.js';
import { createCards } from './cards.js';

export function start(ctx) {
  const host = createHost(ctx.videoCore), storage = createStorage($storage), cards = createCards(storage);
  const saved = storage.read('preferences', {});
  let preferences = { readingMode: ['plain', 'furigana', 'romaji'].includes(saved?.readingMode) ? saved.readingMode : 'plain' };
  const services = createServices({ fetch: (url, options) => ctx.fetch(url, options), save: context => cards.save(context) });
  const controller = createLearningController({ host, services });
  const panel = ctx.newWebview({ slot: 'fixed', hidden: true, autoHeight: true, fullWidth: true,
    style: 'left:auto;top:auto;right:12px;bottom:12px;width:min(540px,94vw)',
    maxWidth: '94vw', maxHeight: '88vh', zIndex: 200, window: { draggable: false, frameless: true } });
  const tray = ctx.newTray({ iconUrl: '', withContent: false });
  tray.onClick(() => panel.show());
  let ticking = false;
  const parsing = new Set();
  const send = (event, value) => panel.channel.send(event, JSON.stringify(value));
  function publish() {
    const view = controller.view();
    const association = host.snapshot()?.association;
    const associations = storage.read('sources', {});
    const tokens = {};
    for (const cue of view.activeCues) {
      const cached = services.cached(cue.text);
      if (cached) tokens[cue.id] = cached;
    }
    send('learning:state', { ...view, tokens, preferences,
      association: association && associations[association] || null });
  }
  async function tick(discontinuity = false) {
    if (ticking) return;
    ticking = true;
    try {
      await controller.refresh({ discontinuity });
      if (!panel.isHidden()) {
        publish();
        for (const cue of controller.view().activeCues.slice(0, 8)) {
          if (!services.cached(cue.text) && !parsing.has(cue.text)) {
            parsing.add(cue.text);
            services.parse(cue.text).catch(() => {}).finally(() => parsing.delete(cue.text));
          }
        }
      }
    } finally { ticking = false; }
  }
  panel.channel.on('learning:request', async raw => {
    let message;
    try {
      message = validateMessage(raw);
      const { op, data } = message;
      let result = { ok: true };
      if (op === 'refresh') await controller.refresh();
      else if (op === 'saved-list' || op === 'saved-open') result = await services.savedSubtitles({ action: op === 'saved-list' ? 'list' : 'open' });
      else if (op === 'import' || op === 'saved-import') {
        let subtitle = data;
        if (op === 'saved-import') {
          const before = host.snapshot();
          if (!before) throw new Error('Start an episode before loading a saved subtitle.');
          subtitle = { ...await services.savedSubtitles({ action: 'read', name: data.name, encoding: data.encoding }), offsetMs: data.offsetMs };
          const after = host.snapshot();
          if (!after || ['clientId', 'playbackId', 'videoIdentity'].some(key => before[key] !== after[key])) throw new Error('Episode changed. Choose the subtitle for the current episode.');
        }
        await controller.loadSubtitle(subtitle);
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
        const work = controller.select(data); publish(); await work;
      } else if (op === 'close') controller.close();
      else if (op === 'resume') await controller.resume();
      else if (op === 'explain') result = await controller.explain();
      else if (op === 'chat') result = await controller.chat(data.question);
      else if (op === 'save') result = await controller.save();
      else if (op === 'export') result = { tsv: cards.tsv(), count: cards.list().length };
      else if (op === 'preferences') { preferences = { readingMode: data.readingMode }; storage.write('preferences', preferences); }
      else if (op === 'hide') { controller.close(); panel.hide(); }
      send('learning:response', { id: message.id, result });
    } catch (error) {
      send('learning:response', { id: message?.id ?? raw?.id, error: String(error.message || error) });
    }
    publish();
  });
  ctx.videoCore.addEventListener('video-seeked', () => tick(true));
  ctx.videoCore.addEventListener('video-terminated', () => tick());
  ctx.setInterval(() => tick().catch(() => {}), 250);
  panel.setContent(() => __LANGPLAY_UI_HTML__);
}
