import styles from './player-surface.css';
import { sentenceParts } from './sentence-reading.js';

const clock = ms => { const s = Math.floor(Math.max(0, ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const identity = view => view?.selected ? JSON.stringify([view.selected.clientId, view.selected.playbackId, view.selected.generation, view.selected.cueId, view.selected.span]) : '';

// Keep the caption strip above the native player transport, measured
// from the contained picture so letterboxed video retains the same safe area.
export function captionInset({ width, height, videoWidth, videoHeight }) {
  if (![width, height, videoWidth, videoHeight].every(value => Number.isFinite(value) && value > 0)) return 80;
  const pictureHeight = Math.min(height, width * videoHeight / videoWidth);
  return (height - pictureHeight) / 2 + Math.max(80, pictureHeight * .06);
}

// Use the supported host DOM bridge. Only plugin-owned elements are moved.
export function createPlayerSurface({ ctx, act, openPanel, validateVideo }) {
  const dom = ctx.dom;
  if (!dom?.queryOne || !dom?.createElement) return { update() {}, fullscreen() {}, clear() {}, available: false };
  let player = null, parent = null, css = null, controls = null, captions = null, drawer = null;
  let view = null, fullscreen = false, enabled = true, setupOpen = false, mounted = false;
  let generation = 0, captionKey = '', wordKey = '', renderKey = '', width = 1280;
  let listeners = [], tokenListeners = [], savedFiles = [], listing = false, updateQueued = false;
  let layoutOriginal = null, drawerInPlayer = false, insetKey = '', replacedSource = '';
  let sentenceKey = '', controlAnchor = '', controlLabelKey = '';
  let controlListeners = [];
  const fields = {};
  let pending = Promise.resolve(), needsSweep = true;
  const enqueue = work => { const next = pending.catch(() => {}).then(work); pending = next; return next; };
  const layoutKey = 'data-langplay-original-layout';
  const reads = new Set();
  const read = promise => {
    if (!ctx.setInterval) return promise;
    let entry;
    const timeout = new Promise((_, reject) => { entry = { expires: Date.now() + 2000, reject }; reads.add(entry); });
    return Promise.race([promise, timeout]).finally(() => reads.delete(entry));
  };
  if (ctx.setInterval) ctx.setInterval(() => {
    for (const entry of reads) if (Date.now() >= entry.expires) {
      reads.delete(entry); entry.reject(new Error('Seanime player changed during a DOM request.'));
    }
  }, 250);
  const show = (el, value) => value ? el.removeAttribute('hidden') : el.setAttribute('hidden', '');
  const text = (name, value) => fields[name]?.setText(String(value || ''));
  const notice = message => text('notice', message);

  async function make(tag, name, owner, value) {
    const el = await read(dom.createElement(tag));
    if (name) el.setAttribute('data-langplay', name);
    if (value !== undefined) el.setText(String(value));
    if (owner) owner.append(el);
    return el;
  }
  async function button(owner, name, label, fn, bucket = listeners) {
    // Seanime reserves Enter/Space for transport except on native inputs.
    const el = await make('input', name, owner);
    el.setAttribute('type', 'button'); el.setAttribute('value', label);
    const off = el.addEventListener('click', () => Promise.resolve(fn()).catch(e => notice(e.message)));
    if (typeof off === 'function') bucket.push(off);
    return el;
  }
  async function action(op, data = {}) {
    try { return await act(op, data); }
    catch (error) { notice(error.message); return null; }
  }
  async function restoreLayout() {
    if (!parent || !layoutOriginal) return;
    for (const [key, value] of Object.entries(layoutOriginal)) value ? parent.setStyle(key, value) : parent.removeStyle(key);
    parent.removeAttribute(layoutKey);
    layoutOriginal = null;
  }
  async function placeDrawer() {
    if (!mounted || !drawer || !player || !parent) return;
    const open = !!view?.drawerOpen || setupOpen;
    updateControlLabels();
    show(drawer, open);
    captions.setAttribute('data-mode', fullscreen ? 'fullscreen' : 'windowed');
    captions.setAttribute('data-study-open', String(open));
    if (!open) { await restoreLayout(); return; }
    drawer.setAttribute('data-mode', fullscreen ? 'fullscreen' : 'windowed');
    if (fullscreen) {
      await restoreLayout();
      if (!drawerInPlayer) { player.append(drawer); drawerInPlayer = true; }
    } else {
      if (drawerInPlayer) { parent.append(drawer); drawerInPlayer = false; }
      if (!layoutOriginal) {
        layoutOriginal = {};
        for (const key of ['display', 'grid-template-columns', 'gap', 'align-items']) layoutOriginal[key] = await read(parent.getStyle(key));
        parent.setAttribute(layoutKey, JSON.stringify(layoutOriginal));
      }
      parent.setStyle('display', 'grid');
      parent.setStyle('grid-template-columns', width > 960 ? 'minmax(0,1fr) 340px' : 'minmax(0,1fr)');
      parent.setStyle('gap', '12px');
      parent.setStyle('align-items', 'start');
    }
  }
  async function refreshSaved() {
    if (listing || !mounted) return;
    listing = true;
    const expected = generation;
    notice('Looking for saved subtitles…');
    const value = await action('saved-list');
    listing = false;
    if (expected !== generation || !mounted) return;
    if (!value) return;
    savedFiles = Array.isArray(value.files) ? value.files : [];
    for (const child of await read(fields.saved.getChildren())) child.remove();
    const wanted = view?.source?.sourceId || view?.association?.sourceId;
    const prompt = await make('option', '', fields.saved, savedFiles.length ? 'Choose a matching file…' : 'No saved subtitles yet');
    prompt.setAttribute('value', '');
    for (const file of savedFiles) {
      const option = await make('option', '', fields.saved, file.name);
      option.setAttribute('value', file.name);
    }
    const matched = savedFiles.some(f => f.name === wanted);
    fields.saved.setProperty('value', matched ? wanted : '');
    fields.load.setProperty('disabled', !matched);
    notice(savedFiles.length ? 'Choose the file that matches this episode and release.' : 'Save a matching Japanese subtitle in your subtitle folder, then refresh.');
  }
  async function createControls() {
    for (const off of controlListeners) if (typeof off === 'function') off();
    controlListeners = []; controlLabelKey = '';
    if (controls) controls.remove();
    controls = await make('div', 'controls', player);
    controls.setAttribute('aria-label', 'LangPlay player controls');
    show(controls, false);
    fields.toggle = await button(controls, 'toggle', '', async () => {
      enabled = !enabled; captionKey = '';
      if (!enabled) { setupOpen = false; show(fields.setup, false); await action('close'); }
      await enqueue(async () => { await renderCaptions(); await placeDrawer(); });
    }, controlListeners);
    fields.toggle.setAttribute('aria-label', 'Show Japanese subtitles');
    fields.toggle.setAttribute('title', 'Show or hide Japanese subtitles');
    fields.toggle.setAttribute('aria-pressed', String(enabled));
    fields.subtitles = await button(controls, 'subtitles', 'Auto Sub', async () => {
      setupOpen = !setupOpen;
      show(fields.setup, setupOpen);
      await placeDrawer();
      if (setupOpen) await refreshSaved();
    }, controlListeners);
    fields.subtitles.setAttribute('aria-label', 'Japanese subtitle settings');
    fields.mode = await make('select', 'mode', controls);
    fields.mode.setAttribute('aria-label', 'Subtitle reading');
    fields.mode.setAttribute('title', 'Subtitle reading');
    for (const [value, label] of [['plain', 'Japanese'], ['furigana', 'Furigana'], ['romaji', 'Romaji']]) {
      const option = await make('option', '', fields.mode, label); option.setAttribute('value', value);
    }
    controlListeners.push(fields.mode.addEventListener('change', async () => action('preferences', { readingMode: await read(fields.mode.getProperty('value')) })));
    updateControlLabels();
  }
  function updateControlLabels() {
    if (!controls) return;
    const automatic = view?.preferences?.autoSubtitles !== false;
    const count = Number(view?.source?.cueCount);
    const label = automatic ? 'Auto Sub' : 'Subtitles';
    const key = JSON.stringify([automatic,count,!!view?.source,view?.autoSubtitles?.message,setupOpen,view?.preferences?.readingMode,enabled]);
    if (key === controlLabelKey) return;
    controlLabelKey = key;
    fields.subtitles.setAttribute('value', `${label}${count > 0 ? ` (${count})` : ''}`);
    fields.subtitles.setAttribute('data-ready', String(!!view?.source));
    fields.subtitles.setAttribute('title', view?.autoSubtitles?.message || 'Japanese subtitle settings');
    fields.subtitles.setAttribute('aria-expanded', String(setupOpen));
    fields.mode.setProperty('value', view?.preferences?.readingMode || 'plain');
    fields.mode.setAttribute('title', `Subtitle reading: ${view?.preferences?.readingMode || 'plain'}`);
    fields.toggle.setAttribute('aria-pressed', String(enabled));
  }
  async function placeControls() {
    // The host owns visibility, pointer activity and fullscreen for this row.
    // Insert only our group after its flexible spacer, before native settings.
    const anchor = await read(player.queryOne('[data-vc-element="control-bar-separator"]'));
    if (!anchor?.after) { show(controls, false); controlAnchor = ''; return; }
    const liveControls = await read(player.queryOne('[data-langplay="controls"]'));
    if (!liveControls) { await createControls(); controlAnchor = ''; }
    if (controlAnchor !== anchor.id) { anchor.after(controls); controlAnchor = anchor.id; }
    updateControlLabels();
    show(controls, true);
  }
  async function mount(nextPlayer) {
    await reset();
    await sweep(true);
    const expected = generation;
    const nextParent = await read(nextPlayer.getParent());
    if (!nextParent || expected !== generation) return;
    player = nextPlayer; parent = nextParent;
    if (String(parent.attributes?.['data-vc-element']) === 'inline-container') {
      const classes = String(parent.attributes?.class || '').split(/\s+/);
      fullscreen = classes.includes('fixed') && classes.includes('inset-0');
    }
    css = await make('style', 'styles', player, styles);
    await createControls();
    captions = await make('div', 'captions', player);
    captions.setAttribute('lang', 'ja'); captions.setAttribute('aria-label', 'Interactive Japanese subtitles');
    drawer = await make('section', 'drawer', parent);
    drawer.setAttribute('role', 'region'); drawer.setAttribute('aria-label', 'LangPlay word study');
    const header = await make('header', '', drawer);
    await make('strong', '', header, 'LangPlay');
    await button(header, 'close', 'Close', async () => {
      setupOpen = false; show(fields.setup, false); await action('close'); await placeDrawer();
    });
    fields.setup = await make('div', 'setup', drawer);
    const autoLabel = await make('label', '', fields.setup, 'Japanese subtitle loading');
    fields.autoMode = await make('select', 'auto-mode', fields.setup);
    autoLabel.setAttribute('for', fields.autoMode.id); fields.autoMode.setAttribute('aria-label', 'Japanese subtitle loading');
    for (const [value,label] of [['automatic','Find automatically'],['manual','Choose manually']]) {
      const option = await make('option','',fields.autoMode,label); option.setAttribute('value',value);
    }
    listeners.push(fields.autoMode.addEventListener('change', async () => action('preferences', {autoSubtitles:await read(fields.autoMode.getProperty('value')) === 'automatic'})));
    fields.autoStatus = await make('p','auto-status',fields.setup);
    fields.autoStatus.setAttribute('role','status'); fields.autoStatus.setAttribute('aria-live','polite');
    fields.autoRetry = await button(fields.setup,'auto-retry','Retry automatic search',() => action('auto-retry'));
    const savedLabel = await make('label', '', fields.setup, 'Saved Japanese subtitle');
    fields.saved = await make('select', 'saved', fields.setup); savedLabel.setAttribute('for', fields.saved.id);
    fields.saved.setAttribute('aria-label', 'Saved Japanese subtitle');
    fields.load = await button(fields.setup, 'load', 'Load subtitle', async () => {
      const name = await read(fields.saved.getProperty('value')); if (!name || !savedFiles.some(f => f.name === name)) return;
      fields.load.setProperty('disabled', true);
      const result = await action('saved-import', { name, encoding: 'auto', offsetMs: view?.source?.offsetMs || 0 });
      fields.load.setProperty('disabled', false);
      if (result) { setupOpen = false; show(fields.setup, false); notice('Japanese subtitles ready. Click a word to study.'); await placeDrawer(); }
    });
    fields.load.setProperty('disabled', true);
    listeners.push(fields.saved.addEventListener('change', async () => {
      const name = await read(fields.saved.getProperty('value'));
      fields.load.setProperty('disabled', !savedFiles.some(file => file.name === name));
    }));
    await button(fields.setup, 'refresh', 'Refresh files', refreshSaved);
    await button(fields.setup, 'advanced', 'Import or export', () => {
      if (fullscreen) ctx.videoCore.setFullscreen(false);
      openPanel();
    });
    fields.source = await make('p', 'source', fields.setup);
    show(fields.setup, false);
    fields.study = await make('div', 'study', drawer);
    for (const [tag, name] of [['h2', 'word'], ['p', 'reading'], ['p', 'base'], ['p', 'meaning']]) fields[name] = await make(tag, name, fields.study);
    const sentence = await make('div','sentence-context',fields.study);
    for (const [name,lang,label] of [['sentence','ja','Japanese sentence'],['sentence-romaji','ja-Latn','Sentence romaji'],['sentence-translation','en','English translation']]) {
      fields[name] = await make('p',name,sentence);
      fields[name].setAttribute('lang',lang); fields[name].setAttribute('aria-label',label);
    }
    fields['sentence-translation'].setAttribute('aria-live','polite');
    fields.translationRetry = await button(sentence,'translation-retry','Retry translation',() => action('translate'));
    fields.context = await make('p','context',fields.study);
    fields.word.setAttribute('lang', 'ja'); fields.reading.setAttribute('lang', 'ja'); fields.sentence.setAttribute('lang', 'ja');
    const actions = await make('div', 'actions', fields.study);
    await button(actions, 'save', 'Save card', async () => {
      const value = await action('save'); if (value) notice(value.duplicate ? 'Card already saved locally.' : 'Card saved locally.');
    });
    await button(actions, 'explain', 'Explain sentence', async () => { notice('Asking your configured AI companion…'); const value = await action('explain'); if (value) notice('Explanation ready.'); });
    fields.explanation = await make('p', 'explanation', fields.study);
    const questionLabel = await make('label', '', fields.study, 'Ask about this sentence');
    fields.question = await make('input', 'question', fields.study); questionLabel.setAttribute('for', fields.question.id);
    fields.question.setAttribute('maxlength', '2000'); fields.question.setAttribute('placeholder', 'Why is this form used?');
    await button(fields.study, 'ask', 'Ask', async () => {
      const question = String(await read(fields.question.getProperty('value')) || '').trim();
      if (question) { notice('Asking your configured AI companion…'); const value = await action('chat', { question }); if (value) notice('Answer ready.'); }
    });
    fields.reply = await make('p', 'reply', fields.study);
    await button(fields.study, 'resume', 'Resume watching', () => action('resume'));
    await make('p', 'context', fields.study, 'Close keeps playback paused.');
    fields.notice = await make('p', 'notice', drawer); fields.notice.setAttribute('role', 'status'); fields.notice.setAttribute('aria-live', 'polite');
    listeners.push(drawer.addEventListener('keydown', async event => {
      if (event.key === 'Escape') { setupOpen = false; show(fields.setup, false); await action('close'); await placeDrawer(); }
    }));
    if (expected !== generation) { await reset(); return; }
    mounted = true; captionKey = renderKey = wordKey = '';
  }
  async function renderCaptions() {
    if (!mounted || !captions) return;
    fields.toggle.setAttribute('aria-pressed', String(enabled));
    // Go-backed nested maps enumerate in a different order on each export.
    // Only visible text, spans and readings determine caption DOM identity.
    const key = JSON.stringify([enabled, view?.source?.sourceId, view?.preferences?.readingMode,
      (view?.activeCues || []).map(cue => [cue.id, cue.text,
        (view?.tokens?.[cue.id] || []).map(token => [token.surface, token.start, token.end, token.furigana, token.romaji, token.pos])])]);
    if (key === captionKey) return;
    captionKey = key;
    for (const off of tokenListeners) if (typeof off === 'function') off();
    tokenListeners = [];
    for (const child of await read(captions.getChildren())) child.remove();
    const expected = generation, source = view?.source?.sourceId;
    const cues = view?.activeCues || [];
    show(captions, enabled && cues.length > 0);
    player.setAttribute('data-langplay-caption-active', String(enabled && cues.length > 0));
    if (!enabled) return;
    const rendered = await Promise.all(cues.map(async cue => {
      const line = await make('p');
      const tokens = view.tokens?.[cue.id];
      if (!tokens?.length) { line.setText(cue.text); return line; }
      const words = await Promise.all(tokens.map(async token => {
        if (!token.surface.trim() || token.pos === '補助記号' || token.pos === '記号' || /^[\s、。…？！!?「」『』（）()\[\]｛｝{}〈〉《》【】〔〕“”‘’・：；,.:;ー—―～♪♫☆★※〜･]+$/.test(token.surface)) return make('span', '', null, token.surface);
        const word = await make('button', 'token'); word.setAttribute('type', 'button'); word.setAttribute('lang', 'ja');
        word.setAttribute('aria-label', `Study ${token.surface}`);
        const reading = view.preferences.readingMode === 'furigana' ? token.furigana : view.preferences.readingMode === 'romaji' ? token.romaji : '';
        if (reading && reading !== token.surface) {
          const ruby = await make('ruby', '', word, token.surface); await make('rt', '', ruby, reading);
        } else word.setText(token.surface);
        let lastActivation = 0;
        const activate = async () => {
          if (Date.now() - lastActivation < 300) return;
          lastActivation = Date.now();
          if (expected !== generation || source !== view?.source?.sourceId || !view.activeCues.some(c => c.id === cue.id) || !await matchesClock(player)) return;
          setupOpen = false; show(fields.setup, false); notice('');
          await action('select', { cueId: cue.id, start: token.start, end: token.end });
        };
        tokenListeners.push(word.addEventListener('click', activate));
        tokenListeners.push(word.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') return activate();
        }));
        return word;
      }));
      for (const word of words) line.append(word);
      return line;
    }));
    if (expected !== generation || source !== view?.source?.sourceId || JSON.stringify(view.activeCues.map(c => c.id)) !== JSON.stringify(cues.map(c => c.id))) {
      for (const line of rendered) line.remove();
      captionKey = ''; return;
    }
    for (const line of rendered) captions.append(line);
  }

  async function matchesClock(element) {
    const video = await read(element.queryOne('video'));
    if (!video) return true; // Controls can mount before the host inserts its video.
    if (validateVideo && !await read(validateVideo(video))) return false;
    const position = Number(await read(video.getProperty('currentTime'))) * 1000;
    return Number.isFinite(position) && Math.abs(position - view.positionMs) <= 5000;
  }
  async function renderSentence() {
    const sentence = view.selected?.sentence || '';
    const parts = sentenceParts(sentence, view.sentenceTokens);
    const key = JSON.stringify([sentence, parts]);
    if (key !== sentenceKey) {
      sentenceKey = key;
      for (const child of await read(fields.sentence.getChildren())) child.remove();
      fields.sentence.setText(parts ? '' : sentence);
      fields.sentence.setAttribute('data-reading', parts ? 'aligned' : 'plain');
      if (parts) {
        const words = await Promise.all(parts.map(async part => {
          const word = await make(part.romaji ? 'ruby' : 'span', '', null, part.surface);
          if (part.romaji) await make('rt', '', word, part.romaji);
          if (!part.gloss) return word;
          const group = await make('span', 'sentence-word');
          group.append(word);
          const gloss = await make('span', 'word-gloss', group, part.gloss);
          gloss.setAttribute('lang', 'en');
          if (part.meaning) gloss.setAttribute('title', part.meaning);
          return group;
        }));
        for (const word of words) fields.sentence.append(word);
      }
    }
    text('sentence-romaji', view.sentenceRomaji);
    show(fields['sentence-romaji'], !parts && !!view.sentenceRomaji);
  }
  async function paint() {
    if (!view?.playback) { await reset(); await sweep(); return; }
    const nextPlayer = await read(dom.queryOne('[data-vc-element="container"]'));
    if (!nextPlayer || !await matchesClock(nextPlayer)) { await reset(); await sweep(); return; }
    if (!mounted || nextPlayer.id !== player?.id) {
      try { await mount(nextPlayer); }
      catch (error) { await reset(); await sweep(true); throw error; }
    }
    if (!mounted) return;
    const key = JSON.stringify([view.playback.title, view.playback.episode, view.drawerOpen, view.selected, view.reading, view.romaji, view.meaning, view.baseForm, view.explanation, view.reply, view.error, view.busy, view.source, view.preferences, view.autoSubtitles, view.sentenceRomaji, view.sentenceTranslation, view.translationBusy, view.translationError, view.sentenceTokens?.map(token => [token.surface, token.romaji, token.pos, token.meaning, token.meaningBusy])]);
    if (key !== renderKey) {
      renderKey = key;
      const nextWord = identity(view);
      if (nextWord !== wordKey) { wordKey = nextWord; fields.question.setProperty('value', ''); notice(''); }
      text('word', view.selected?.surface); text('reading', [view.reading, view.romaji].filter(Boolean).join(' · '));
      text('base', view.baseForm && view.baseForm !== view.selected?.surface ? `Dictionary form: ${view.baseForm}` : '');
      text('meaning', view.meaning || (view.busy ? 'Looking up this word…' : 'No local definition yet.'));
      await renderSentence();
      text('sentence-translation',view.sentenceTranslation || (view.translationBusy ? 'Translating with Google…' : view.translationError));
      show(fields['sentence-translation'],!!(view.sentenceTranslation || view.translationBusy || view.translationError));
      show(fields.translationRetry,!!view.translationError && !view.translationBusy);
      text('context', view.selected ? `${view.selected.title} · Episode ${view.selected.episode} · ${clock(view.selected.videoTimeMs)}` : '');
      text('explanation', view.explanation); text('reply', view.reply);
      text('source', `${view.playback.title} · Episode ${view.playback.episode}\n${view.source ? `${view.source.sourceId} · ${view.source.cueCount} cues` : 'Choose a matching Japanese subtitle.'}`);
      fields.mode.setProperty('value', view.preferences.readingMode);
      fields.autoMode.setProperty('value', view.preferences.autoSubtitles === false ? 'manual' : 'automatic');
      fields.autoStatus.setText(view.autoSubtitles?.message || (view.preferences.autoSubtitles === false ? 'Choose a saved Japanese subtitle or import a file.' : 'Japanese subtitles are found automatically when an episode starts.'));
      show(fields.autoRetry, view.autoSubtitles?.state === 'error');
      show(fields.study, !!view.drawerOpen && !!view.selected);
      if (view.error) notice(view.error);
      await placeDrawer();
    }
    await renderCaptions();
    await placeControls();
    // The user wants LangPlay to replace the normal track. Select Off through
    // VideoCore once a learning source is ready, without hiding host DOM or
    // repeatedly overriding a later manual track choice on every clock tick.
    if (!enabled || !view.source) replacedSource = '';
    else if (replacedSource !== view.source.sourceId) {
      ctx.videoCore?.setSubtitleTrack?.(-1);
      ctx.videoCore?.setMediaCaptionTrack?.(-1);
      replacedSource = view.source.sourceId;
    }
    const video = await read(player.queryOne('video'));
    if (video) {
      const [width, height, videoWidth, videoHeight] = await Promise.all(
        ['clientWidth', 'clientHeight', 'videoWidth', 'videoHeight'].map(key => read(video.getProperty(key))));
      const inset = captionInset({ width, height, videoWidth, videoHeight });
      if (String(inset) !== insetKey) {
        insetKey = String(inset); captions.setStyle('--langplay-caption-bottom', `${inset}px`);
      }
    }
  }
  function update(next) {
    view = next;
    if (updateQueued) return pending;
    updateQueued = true;
    return enqueue(async () => { updateQueued = false; await paint(); });
  }
  // Seanime can leave nodes in a former main tab when its DOM manager changes
  // ownership. Recover only our nodes/styles when that tab becomes active again.
  async function sweep(force = false) {
    if (!dom.query || (!force && !needsSweep)) return;
    needsSweep = false;
    for (const node of await read(dom.query(`[${layoutKey}]`))) {
      try {
        const original = JSON.parse(await read(node.getAttribute(layoutKey)));
        for (const key of ['display', 'grid-template-columns', 'gap', 'align-items']) {
          const value = original[key];
          value ? node.setStyle(key, value) : node.removeStyle(key);
        }
      } catch (_) { /* A malformed marker must not break ordinary playback. */ }
      node.removeAttribute(layoutKey);
    }
    for (const node of await read(dom.query('[data-langplay-caption-active]'))) node.removeAttribute('data-langplay-caption-active');
    for (const name of ['controls', 'captions', 'drawer', 'styles']) {
      for (const node of await read(dom.query(`[data-langplay="${name}"]`))) node.remove();
    }
  }
  async function reset() {
    generation++;
    for (const off of [...listeners, ...tokenListeners, ...controlListeners]) if (typeof off === 'function') off();
    listeners = []; tokenListeners = []; controlListeners = []; controlAnchor = '';
    if (player) player.removeAttribute('data-langplay-caption-active');
    await restoreLayout();
    for (const node of [controls, captions, drawer, css]) if (node) node.remove();
    player = parent = controls = captions = drawer = css = null;
    mounted = false; captionKey = renderKey = wordKey = insetKey = replacedSource = sentenceKey = ''; setupOpen = false; drawerInPlayer = false;
  }
  const clear = () => enqueue(async () => { view = null; await reset(); await sweep(true); });
  const changeFullscreen = event => enqueue(async () => { fullscreen = !!event.fullscreen; await placeDrawer(); });
  if (dom.viewport?.getSize) width = dom.viewport.getSize().width;
  if (dom.viewport?.onResize) dom.viewport.onResize(size => { width = size.width; enqueue(placeDrawer).catch(() => {}); });
  if (dom.onMainTabReady) dom.onMainTabReady(() => enqueue(async () => { await reset(); await sweep(true); if (view) await paint(); }).catch(() => {}));
  return { available: true, update, clear, fullscreen: changeFullscreen };
}
