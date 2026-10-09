const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = fs.existsSync(path.join(__dirname, '..', 'extension', 'manifest.json'))
  ? path.join(__dirname, '..', 'extension')
  : path.join(__dirname, '..');
const wanakana = require(path.join(root, 'lib', 'wanakana.min.js'));
const YomitanDeinflector = require(path.join(root, 'lib', 'yomitan-deinflector.js'));
const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');

// Execute production functions. The DOM and network are test doubles; no API
// credentials, browser profile, local server, or external service is used.
function createContentHarness(config = {}, parser = undefined) {
  const elements = new Map();
  class Element {
    constructor() {
      this.style = { setProperty(name, value) { this[name] = value; } };
      this.children = [];
      this.listeners = {};
      this.value = '';
      this.dataset = {};
      this.attributes = {};
      this.offsetParent = {};
      const classes = new Set();
      this.classList = {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
        toggle(name, force = !classes.has(name)) {
          if (force) classes.add(name); else classes.delete(name);
          return force;
        },
      };
      this._html = '';
      this._text = '';
    }
    set id(value) { this._id = value; elements.set(value, this); }
    get id() { return this._id; }
    set className(value) { this.classList.add(...value.split(/\s+/).filter(Boolean)); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    set innerHTML(value) {
      this._html = value;
      this._text = value.replace(/<[^>]*>/g, '');
      this.children = [];
      for (const match of value.matchAll(/id="([^"]+)"/g)) {
        const child = new Element();
        child.id = match[1];
        this.appendChild(child);
      }
    }
    get innerHTML() { return this._html; }
    set textContent(value) { this._text = value; this._html = value; }
    get textContent() { return this._text; }
    get firstChild() { return this.children[0] || null; }
    get nextElementSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null; }
    appendChild(child) { child.remove(); child.parentElement = this; this.children.push(child); return child; }
    insertBefore(child, anchor) {
      if (!anchor) return this.appendChild(child);
      child.remove();
      child.parentElement = this;
      this.children.splice(this.children.indexOf(anchor), 0, child);
      return child;
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    querySelectorAll(selector) {
      const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
      return descendants.filter(child => selector === '*' || (selector.startsWith('#') ? child.id === selector.slice(1) : selector.startsWith('.') && child.classList.contains(selector.slice(1))));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    contains(element) { return this === element || this.children.some(child => child.contains(element)); }
    getBoundingClientRect() { return { top:470, bottom:510, left:0, right:900, width:40, height:40 }; }
    scrollIntoView() {}
    focus() {}
    remove() {
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter(c => c !== this);
      }
      this.parentElement = null;
    }
  }
  const body = new Element();
  const player = new Element();
  player.getBoundingClientRect = () => ({ top:0, bottom:510, left:0, right:900, width:900, height:510 });
  const nativeBar = new Element();
  nativeBar.className = 'ytp-chrome-bottom';
  const nativeControls = new Element();
  nativeControls.className = 'ytp-right-controls';
  const nativeCC = new Element();
  nativeCC.className = 'ytp-button ytp-subtitles-button';
  nativeControls.appendChild(nativeCC);
  nativeBar.appendChild(nativeControls);
  player.appendChild(nativeBar);
  const secondary = new Element();
  const calls = [];
  const pending = [];
  const sandbox = {
    console,
    LinguaPlayParser: parser,
    window: { wanakana, location: { search: '', href: '' }, addEventListener() {} },
    document: {
      body,
      documentElement: new Element(),
      getElementById: id => elements.get(id) || null,
      querySelector: selector => selector === '#movie_player' ? player : selector === '#secondary-inner' ? secondary : null,
      querySelectorAll: () => [],
      createElement: () => new Element(),
      addEventListener() {},
    },
    chrome: { storage: { local: {
      get: (_keys, callback) => callback(config),
      set: () => {},
    } } },
    MutationObserver: class { observe() {} disconnect() {} },
    AbortSignal,
    URLSearchParams,
    setInterval() {},
    setTimeout() {},
    fetch(url, options) {
      calls.push({ url, options });
      if (url.includes('translate.googleapis.com')) {
        return Promise.resolve({ ok: true, json: async () => [[['translation']]] });
      }
      return new Promise(resolve => pending.push(resolve));
    },
  };
  // Expose functions from their real closure without changing the source file.
  const instrumented = content
    .replace('    setupLiveCaptionHooking();\n  }',
      '    globalThis.chatApi = { sendSenseiQuestion, callSenseiLlmApi };\n    setupLiveCaptionHooking();\n  }')
    .replace(/\}\)\(\);\s*$/, `globalThis.contentApi = {
      getWordReading, generateSentenceRomaji, handleTokenClick, injectUI, renderSentenceTokens, onTimeUpdate, checkAndInitVideo,
      setPlayback(video, cues) { activeVideoEl = video; subtitleTimeline = cues; currentSubIndex = -1; }
    };})();`);
  vm.runInNewContext(instrumented, sandbox, { filename: 'content.js' });
  sandbox.contentApi.injectUI();
  return { ...sandbox.contentApi, ...sandbox.chatApi, sandbox, elements, calls, pending };
}

function clickVisibility(h) {
  let stopped = false;
  h.elements.get('linguaplay-visibility-toggle').listeners.click({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true, 'Visibility clicks must not reach the video player');
}

function parsingHarness() {
  const requests = new Map();
  const h = createContentHarness({}, { create: options => require(path.join(root, 'js', 'japanese-parser.js')).create({
    ...options, transport: text => new Promise(resolve => requests.set(text, resolve)),
  }) });
  const token = (surface, reading, baseForm = surface, start = 0, pos = '名詞') => ({ surface, reading, baseForm, pos, start, end: start + surface.length });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  return { h, requests, token, tick };
}

test('the production overlay and drawer use parsed readings, grouped inflections and lemmas', async () => {
  const { h, requests, token, tick } = parsingHarness();
  h.renderSentenceTokens('来ない');
  await tick();
  requests.get('来ない')({ tokens: [token('来ない', 'コナイ', '来る', 0, '動詞')] });
  await tick();
  const button = h.elements.get('linguaplay-yt-tokens').children[0];
  assert.equal(button.dataset.word, '来ない');
  assert.equal(button.dataset.baseform, '来る');
  assert.equal(button.querySelector('.linguaplay-token-reading').textContent, 'こない');
  button.listeners.click({ stopPropagation() {} });
  await tick();
  assert.equal(h.elements.get('lp-active-romaji').textContent, 'こない (konai)');
  assert.equal(h.elements.get('lp-active-pos').textContent, '(Base: 来る)');
  assert.ok(h.elements.get('lp-sentence-romaji').innerHTML.includes('konai'));
  assert.ok(h.elements.get('lp-chat-sentence-romaji').innerHTML.includes('konai'));
});

test('parsing completed after hide and drawer close preserves visibility and current context', async () => {
  const { h, requests, token, tick } = parsingHarness();
  h.renderSentenceTokens('学校');
  h.handleTokenClick({ surface: '学校', baseForm: '学校', start: 2 }, '  学校  ');
  h.elements.get('lp-dismiss-btn').listeners.click();
  clickVisibility(h);
  await tick();
  requests.get('学校')({ tokens: [token('学校', 'ガッコウ')] });
  await tick();
  assert.equal(h.elements.get('lp-active-romaji').textContent, 'がっこう (gakkou)', 'Leading whitespace must not break clicked offsets');
  assert.equal(h.elements.get('linguaplay-yt-drawer').classList.contains('hidden'), true);
  assert.equal(h.sandbox.document.documentElement.classList.contains('linguaplay-subtitles-hidden'), true);
  clickVisibility(h);
  assert.equal(h.elements.get('linguaplay-yt-drawer').classList.contains('hidden'), true);
});

test('late parser results cannot replace a newer caption, cleared overlay or selected word', async () => {
  const { h, requests, token, tick } = parsingHarness();
  h.renderSentenceTokens('学校');
  h.handleTokenClick({ surface: '学校', baseForm: '学校' }, '学校');
  h.renderSentenceTokens('来ない');
  h.handleTokenClick({ surface: '来ない', baseForm: '来ない' }, '来ない');
  await tick();
  requests.get('学校')({ tokens: [token('学校', 'ガッコウ')] });
  await tick();
  assert.equal(h.elements.get('lp-active-word').textContent, '来ない');
  assert.ok(h.elements.get('linguaplay-yt-tokens').children.some(el => el.dataset.word === '来'));
  h.renderSentenceTokens('');
  requests.get('来ない')({ tokens: [token('来ない', 'コナイ', '来る', 0, '動詞')] });
  await tick();
  assert.equal(h.elements.get('linguaplay-yt-tokens').children.length, 0);
  assert.equal(h.elements.get('lp-active-romaji').textContent, 'こない (konai)');
});

test('YouTube startup follows playback, including already-playing and replacement videos', async () => {
  const h = createContentHarness();
  const messages = [];
  h.sandbox.chrome.runtime = { sendMessage(message, callback) { messages.push(message); callback?.({ success: true }); } };
  h.sandbox.window.location.search = '?v=playback-test';
  h.sandbox.fetch = async () => ({ ok: true, text: async () => 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n猫\n' });
  const originalSelector = h.sandbox.document.querySelector;
  const createVideo = paused => ({ paused, ended: false, currentTime: 0, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; }, removeEventListener(name, fn) { if (this.listeners[name] === fn) delete this.listeners[name]; } });
  let video = createVideo(true);
  h.sandbox.document.querySelector = selector => selector === 'video' ? video : originalSelector(selector);
  await h.checkAndInitVideo();
  assert.equal(messages.length, 0, 'Opening a paused video does not start the server');
  video.paused = false;
  video.listeners.playing();
  assert.equal(messages.length, 1);
  await h.checkAndInitVideo();
  assert.equal(messages.length, 1, 'Periodic checks do not launch again for the same playing element');
  const previous = video;
  video = createVideo(false);
  await h.checkAndInitVideo();
  assert.equal(messages.length, 2, 'Playback already in progress is detected when binding');
  assert.equal(previous.listeners.playing, undefined);
  video.ended = true;
  video.listeners.playing();
  assert.equal(messages.length, 2);
});

test('visibility toggles independently of toolbar, readings and drawer state', () => {
  const h = createContentHarness({ linguaplay_reading_mode: 'romaji' });
  const button = h.elements.get('linguaplay-visibility-toggle');
  const drawer = h.elements.get('linguaplay-yt-drawer');
  const widget = h.elements.get('linguaplay-yt-widget');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(drawer.classList.contains('hidden'), true);
  clickVisibility(h);
  assert.equal(h.sandbox.document.documentElement.classList.contains('linguaplay-subtitles-hidden'), true);
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.title, 'Show subtitles and translation');
  assert.equal(widget.classList.contains('collapsed'), true);
  h.elements.get('linguaplay-toggle-trigger').listeners.click({ stopPropagation() {} });
  assert.equal(widget.classList.contains('collapsed'), false);
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  clickVisibility(h);
  assert.equal(button.title, 'Hide subtitles and translation');
  assert.equal(drawer.classList.contains('hidden'), true, 'An explicitly closed drawer stays closed');
  h.renderSentenceTokens('猫');
  assert.ok(h.elements.get('linguaplay-yt-tokens').children[0].querySelector('.linguaplay-token-reading').textContent.includes('neko'));
});

test('subtitle tracking continues while hidden and restoration uses the current time', () => {
  const h = createContentHarness();
  const video = { currentTime: 1 };
  h.setPlayback(video, [{ start: 0, end: 2, text: '猫' }, { start: 3, end: 5, text: '犬' }]);
  h.onTimeUpdate();
  clickVisibility(h);
  video.currentTime = 4;
  h.onTimeUpdate();
  assert.equal(h.elements.get('linguaplay-yt-tokens').children[0].querySelector('.linguaplay-jp-text').textContent, '犬');
  assert.equal(h.sandbox.document.documentElement.classList.contains('linguaplay-subtitles-hidden'), true);
  video.currentTime = 6; // Seek without a timeupdate before restoring.
  clickVisibility(h);
  assert.equal(h.elements.get('linguaplay-yt-tokens-overlay').classList.contains('active'), false);
  assert.equal(h.elements.get('linguaplay-yt-tokens').children.length, 0);
});

test('a completed translation while hidden is retained for the previously open drawer', async () => {
  const h = createContentHarness();
  h.handleTokenClick({ surface: '猫', baseForm: '猫' }, '猫がいる');
  clickVisibility(h);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.elements.get('lp-sentence-en').textContent, 'translation');
  assert.equal(h.sandbox.document.documentElement.classList.contains('linguaplay-subtitles-hidden'), true);
  assert.equal(h.elements.get('linguaplay-yt-drawer').classList.contains('hidden'), false);
  clickVisibility(h);
  assert.equal(h.elements.get('linguaplay-yt-drawer').classList.contains('hidden'), false);
  h.elements.get('lp-dismiss-btn').listeners.click();
  clickVisibility(h);
  clickVisibility(h);
  assert.equal(h.elements.get('linguaplay-yt-drawer').classList.contains('hidden'), true);
});

test('visibility controls isolate pointer and keyboard events without preventing button activation', () => {
  const h = createContentHarness();
  for (const name of ['keydown', 'keyup', 'pointerdown', 'pointerup']) {
    let stopped = false;
    h.elements.get('linguaplay-yt-controls').listeners[name]({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true, name);
  }
});

test('native controls are placed before CC and reattached without duplicate buttons', () => {
  const h = createContentHarness();
  const player = h.sandbox.document.querySelector('#movie_player');
  const group = h.elements.get('linguaplay-yt-controls');
  const right = player.querySelector('.ytp-right-controls');
  assert.equal(right.firstChild, group);
  assert.equal(group.children[0].id, 'linguaplay-visibility-toggle');
  assert.equal(group.children[1].id, 'linguaplay-sub-status');
  assert.equal(group.children[2].id, 'linguaplay-toggle-trigger');
  h.injectUI();
  h.injectUI();
  assert.equal(right.children.filter(child => child === group).length, 1);
  right.remove();
  h.injectUI();
  assert.equal(group.parentElement, null);
  const replacement = h.sandbox.document.createElement('div');
  replacement.className = 'ytp-right-controls';
  const gear = h.sandbox.document.createElement('button');
  gear.className = 'ytp-button';
  replacement.appendChild(gear);
  player.appendChild(replacement);
  h.injectUI();
  assert.equal(replacement.firstChild, group, 'Without CC, use the first native control');
  assert.equal(group.nextElementSibling, gear);
});

test('the settings control toggles the toolbar and its accessible expanded state', () => {
  const h = createContentHarness();
  const settings = h.elements.get('linguaplay-toggle-trigger');
  const widget = h.elements.get('linguaplay-yt-widget');
  for (const expanded of [true, false, true]) {
    settings.listeners.click({ stopPropagation() {} });
    assert.equal(settings.getAttribute('aria-expanded'), String(expanded));
    assert.equal(widget.classList.contains('collapsed'), !expanded);
  }
  h.elements.get('linguaplay-collapse-btn').listeners.click({ stopPropagation() {} });
  assert.equal(settings.getAttribute('aria-expanded'), 'false');
});

test('a fresh page session resets subtitle visibility', () => {
  const h = createContentHarness();
  clickVisibility(h);
  const nextPage = createContentHarness();
  assert.equal(nextPage.elements.get('linguaplay-visibility-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(nextPage.sandbox.document.documentElement.classList.contains('linguaplay-subtitles-hidden'), false);
});

test('live subtitle readings retain the irregular 来る stem', () => {
  const h = createContentHarness();
  for (const [word, expected] of [['来た', 'きた'], ['来て', 'きて'], ['来ない', 'こない'], ['来ます', 'きます']]) {
    assert.equal(h.getWordReading(word).furigana, expected, word);
  }
});

test('control: ordinary subtitle words still use the production reading engine', () => {
  const h = createContentHarness();
  assert.equal(h.getWordReading('食べました').furigana, 'たべました');
  assert.equal(h.generateSentenceRomaji('僕を走らせる魔法だ', ''), 'boku o hashiraseru mahou da');
});

test('行った retains its previously supported 行く reading', () => {
  const h = createContentHarness();
  assert.equal(h.getWordReading('行った').furigana, 'いった');
  assert.equal(h.generateSentenceRomaji('東京へ行った', ''), 'toukyou e itta');
});

for (const [surface, base] of [['飲んだ', '飲む'], ['泳ぎました', '泳ぐ'], ['遊ぼう', '遊ぶ']]) {
  test(`deinflection resolves ${surface} to ${base}`, () => {
    const terms = new YomitanDeinflector().deinflect(surface).map(result => result.term);
    assert.ok(terms.includes(base), `Expected ${base}; actual candidates: ${terms.join(', ')}`);
    assert.ok(terms.every(term => !term.includes('\ufffd')), 'Candidates must not contain replacement characters');
  });
}

test('an unset provider continues to use the working local server', async () => {
  const h = createContentHarness();
  h.elements.get('lp-active-word').textContent = '猫';
  h.elements.get('lp-active-romaji').textContent = 'neko';
  await h.elements.get('lp-ai-btn').listeners.click();
  assert.ok(h.calls.some(call => call.url === 'http://127.0.0.1:8000/api/ai/analyze'),
    `Expected local analysis request; got ${JSON.stringify(h.calls)}`);
});

test('control: an explicit local provider dispatches to the local server', async () => {
  const h = createContentHarness({ linguaplay_ai_provider: 'antigravity' });
  h.elements.get('lp-active-word').textContent = '猫';
  await h.elements.get('lp-ai-btn').listeners.click();
  assert.equal(h.calls[0]?.url, 'http://127.0.0.1:8000/api/ai/analyze');
});

test('local analysis can finish after the former four-second deadline', async () => {
  const h = createContentHarness();
  // Scale seconds to milliseconds while preserving the response/deadline order.
  h.sandbox.AbortSignal = { timeout: milliseconds => AbortSignal.timeout(milliseconds / 1000) };
  h.sandbox.fetch = (_url, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ ok: true, json: async () => ({ status: 'success', data: { contextual_meaning: 'cat' } }) }), 35);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
  const result = await h.callSenseiLlmApi({ messages: [], isJson: true, config: {}, word: '猫', romaji: 'neko', sentence: '猫がいる' });
  assert.equal(JSON.parse(result).contextual_meaning, 'cat');
});

test('local analysis reports the actual backend error', async () => {
  const h = createContentHarness();
  h.sandbox.fetch = async () => ({ ok: false, status: 504, json: async () => ({ status: 'error', message: 'Antigravity CLI execution timed out.' }) });
  await assert.rejects(h.callSenseiLlmApi({ messages: [], isJson: true, config: {}, word: '猫', sentence: '猫がいる' }), /Antigravity CLI execution timed out/);
});

test('a chat response for a previous word cannot enter the new conversation', async () => {
  const h = createContentHarness({ linguaplay_ai_provider: 'deepseek', linguaplay_deepseek_key: 'fake-test-key' });
  h.handleTokenClick({ surface: '猫', baseForm: '猫' }, '猫がいる');
  await h.sendSenseiQuestion('Explain 猫');
  assert.equal(h.pending.length, 1, 'The first production chat request must be in flight');

  h.handleTokenClick({ surface: '犬', baseForm: '犬' }, '犬がいる');
  h.pending.shift()({ ok: true, json: async () => ({ choices: [{ message: { content: 'Old answer about 猫' } }] }) });
  await new Promise(resolve => setImmediate(resolve));

  const messages = h.elements.get('lp-chat-messages').children.map(child => child.textContent);
  await h.sendSenseiQuestion('Explain 犬');
  const nextBody = JSON.parse(h.calls.filter(call => call.url.includes('api.deepseek.com')).at(-1).options.body);
  assert.deepEqual({
    displayedMessages: messages,
    previousRepliesSentToApi: nextBody.messages.filter(message => message.content.includes('Old answer about 猫')),
  }, { displayedMessages: [], previousRepliesSentToApi: [] },
  'The new conversation must neither display nor send the previous word\'s late reply');
});

test('control: the configured DeepSeek chat uses the actual API builder', async () => {
  const h = createContentHarness({ linguaplay_ai_provider: 'deepseek', linguaplay_deepseek_key: 'fake-test-key' });
  h.handleTokenClick({ surface: '猫', baseForm: '猫' }, '猫がいる');
  await h.sendSenseiQuestion('Explain 猫');
  const request = h.calls.find(call => call.url.includes('api.deepseek.com'));
  assert.equal(request.url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer fake-test-key');
  const body = JSON.parse(request.options.body);
  assert.ok(body.messages[0].content.includes('猫がいる'));
  h.pending.shift()({ ok: true, json: async () => ({ choices: [{ message: { content: 'A current answer' } }] }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(h.elements.get('lp-chat-messages').children.some(child => child.textContent === 'A current answer'));
});

test('chat rejects overlapping sends without losing a draft and sends ordered history afterward', async () => {
  const h = createContentHarness({ linguaplay_ai_provider: 'deepseek', linguaplay_deepseek_key: 'fake-test-key' });
  assert.equal(h.sendSenseiQuestion('Question one'), true);
  assert.equal(h.elements.get('lp-chat-send-btn').disabled, true);
  assert.equal(h.sendSenseiQuestion('Question two'), false);
  const input = h.elements.get('lp-chat-input');
  input.value = 'Question two';
  input.listeners.keydown({ key: 'Enter' });
  assert.equal(input.value, 'Question two');
  assert.equal(h.pending.length, 1);
  h.pending[0]({ ok: true, json: async () => ({ choices: [{ message: { content: 'Answer one' } }] }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.elements.get('lp-chat-send-btn').disabled, false);
  input.listeners.keydown({ key: 'Enter' });
  assert.equal(input.value, '');
  const request = JSON.parse(h.calls.at(-1).options.body);
  assert.deepEqual(request.messages.slice(1), [
    { role: 'user', content: 'Question one' },
    { role: 'assistant', content: 'Answer one' },
    { role: 'user', content: 'Question two' },
  ]);
});

test('an old word response does not unlock a new word request', async () => {
  const h = createContentHarness({ linguaplay_ai_provider: 'deepseek', linguaplay_deepseek_key: 'fake-test-key' });
  h.handleTokenClick({ surface: '猫', baseForm: '猫' }, '猫がいる');
  h.sendSenseiQuestion('Explain 猫');
  h.handleTokenClick({ surface: '犬', baseForm: '犬' }, '犬がいる');
  assert.equal(h.elements.get('lp-chat-send-btn').disabled, false);
  h.sendSenseiQuestion('Explain 犬');
  h.pending[0]({ ok: true, json: async () => ({ choices: [{ message: { content: 'Old cat answer' } }] }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.elements.get('lp-chat-send-btn').disabled, true);
  assert.equal(h.elements.get('lp-chat-messages').getAttribute('aria-busy'), 'true');
  h.pending[1]({ ok: true, json: async () => ({ choices: [{ message: { content: 'Dog answer' } }] }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.elements.get('lp-chat-send-btn').disabled, false);
});

test('chat failures unlock retry and do not send an unanswered duplicate in history', async () => {
  const h = createContentHarness({ linguaplay_ai_provider: 'antigravity' });
  h.sendSenseiQuestion('Retry this question');
  h.pending[0]({ ok: false, status: 504, json: async () => ({ status: 'error', message: 'Model timed out' }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.elements.get('lp-chat-send-btn').disabled, false);
  assert.ok(h.elements.get('lp-chat-messages').children.some(child => child.textContent.includes('Model timed out')));
  h.sendSenseiQuestion('Retry this question');
  const messages = JSON.parse(h.calls.at(-1).options.body).messages;
  assert.equal(messages.filter(message => message.role === 'user').length, 1);
});

test('IME confirmation does not submit an unfinished Japanese question', () => {
  const h = createContentHarness();
  const input = h.elements.get('lp-chat-input');
  input.value = '日本語';
  input.listeners.keydown({ key: 'Enter', isComposing: true });
  assert.equal(input.value, '日本語');
  assert.equal(h.pending.length, 0);
});

function createStandaloneHarness(provider) {
  const calls = [];
  const settings = {
    linguaplay_ai_provider: provider,
    linguaplay_deepseek_key: 'fake-deepseek-key',
    linguaplay_opencode_url: 'http://127.0.0.1:11434/v1',
    linguaplay_opencode_model: 'test-local-model',
  };
  const sandbox = {
    console, AbortController, URL,
    chrome: { storage: { local: {
      get(keys, callback) {
        const result = Object.fromEntries(keys.filter(key => key in settings).map(key => [key, settings[key]]));
        if (callback) callback(result);
        return Promise.resolve(result);
      },
      set(values) { Object.assign(settings, values); },
    } } },
    fetch: async (url, options) => {
      calls.push({ url, options });
      throw new Error('Test network stub');
    },
  };
  const source = fs.readFileSync(path.join(root, 'js', 'ai.js'), 'utf8')
    .replace(/^import .*;$/m, '')
    .replace(/export /g, '');
  vm.runInNewContext(source + '\nglobalThis.aiApi = { requestAIAnalysis, getSavedApiKey, saveApiKey, setAIProvider, getAIProvider };', sandbox, { filename: 'js/ai.js' });
  return { calls, sandbox, ...sandbox.aiApi, analyze: sandbox.aiApi.requestAIAnalysis };
}

test('standalone providers save and retrieve their own keys', async () => {
  const h = createStandaloneHarness('gemini');
  for (const provider of ['deepseek', 'opencode']) {
    assert.equal(h.setAIProvider(provider), provider);
    h.saveApiKey(`test-${provider}`);
    assert.equal(await h.getSavedApiKey(), `test-${provider}`);
  }
  assert.equal(await h.getSavedApiKey('deepseek'), 'test-deepseek');
});

test('standalone custom provider parses a JSON response without requiring a key', async () => {
  const h = createStandaloneHarness('opencode');
  const results = [];
  const errors = [];
  h.sandbox.fetch = async (url, options) => {
    h.calls.push({ url, options });
    return { ok: true, json: async () => ({ choices: [{ message: { content: '```json\n{"contextual_meaning":"cat"}\n```' } }] }) };
  };
  await h.analyze({ word: '猫', sentence: '猫がいる', onSuccess: result => results.push(result), onError: error => errors.push(error) });
  assert.deepEqual(errors, []);
  assert.equal(results[0].contextual_meaning, 'cat');
  assert.equal(h.calls[0].options.headers.Authorization, undefined);
  assert.equal(JSON.parse(h.calls[0].options.body).model, 'test-local-model');
});

test('content custom-provider requests use the worker instead of page fetch', async () => {
  const h = createContentHarness({ linguaplay_ai_provider: 'opencode' });
  let sent;
  h.sandbox.chrome.runtime = {
    sendMessage(request, callback) {
      sent = request;
      callback({ success: true, content: 'Worker answer' });
    }
  };
  const answer = await h.callSenseiLlmApi({ messages: [{ role: 'user', content: 'Explain 猫' }], isJson: false, config: { linguaplay_ai_provider: 'opencode' } });
  assert.equal(answer, 'Worker answer');
  assert.equal(sent.action, 'CALL_CUSTOM_AI');
  assert.equal(sent.messages[0].content, 'Explain 猫');
  assert.equal(sent.url, undefined, 'The page must not choose the privileged fetch URL');
  assert.equal(h.calls.length, 0, 'No page-origin network request should occur');
});

function createBackgroundHarness({ url = 'http://127.0.0.1:11434/v1/', allowed = true } = {}) {
  const calls = [];
  const sandbox = {
    console, URL, AbortSignal,
    chrome: {
      runtime: { id: 'test-extension', onInstalled: { addListener() {} }, onMessage: { addListener(callback) { sandbox.listener = callback; } } },
      storage: { local: { get: async () => ({ linguaplay_opencode_url: url, linguaplay_opencode_model: 'local-test-model', linguaplay_opencode_key: 'fake-test-key' }) } },
      permissions: { contains: async () => allowed }
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'Worker answer' } }] }) };
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), sandbox);
  return {
    calls,
    request(message, sender = { id: 'test-extension' }) {
      return new Promise(resolve => assert.equal(sandbox.listener({ action: 'CALL_CUSTOM_AI', ...message }, sender, resolve), true));
    }
  };
}

test('worker builds a request from saved endpoint and credentials', async () => {
  const h = createBackgroundHarness();
  const response = await h.request({ messages: [{ role: 'user', content: 'Explain 猫' }], isJson: true, url: 'https://ignored.invalid' });
  assert.equal(response.content, 'Worker answer');
  assert.equal(h.calls[0].url, 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(h.calls[0].options.headers.Authorization, 'Bearer fake-test-key');
  assert.equal(h.calls[0].options.headers.Origin, undefined);
  const body = JSON.parse(h.calls[0].options.body);
  assert.equal(body.model, 'local-test-model');
  assert.equal(body.response_format.type, 'json_object');
});

test('worker rejects unauthorized origins and invalid requests without fetching', async () => {
  const messages = [{ role: 'user', content: 'Explain 猫' }];
  for (const [options, message, sender] of [
    [{ allowed: false }, { messages }, undefined],
    [{ url: 'file:///etc/passwd' }, { messages }, undefined],
    [{}, { messages: [{ role: 'user', content: 12 }] }, undefined],
    [{}, { messages }, { id: 'other-extension' }]
  ]) {
    const h = createBackgroundHarness(options);
    const response = await h.request(message, sender);
    assert.equal(response.success, false);
    assert.equal(h.calls.length, 0);
  }
});

test('the source rule table and browser deinflector remain identical', () => {
  const sourceRules = JSON.parse(fs.readFileSync(path.join(root, 'lib', 'deinflect-rules.json'), 'utf8'));
  assert.deepEqual(YomitanDeinflector.RULES, sourceRules);
  assert.ok(!JSON.stringify(sourceRules).includes('\ufffd'));
});

function createOptionsHarness(config = {}, { allowed = true, granted = true } = {}) {
  const elements = new Map();
  for (const match of fs.readFileSync(path.join(root, 'options.html'), 'utf8').matchAll(/id="([^"]+)"/g)) {
    elements.set(match[1], { value: '', style: {}, classList: { add() {}, remove() {} }, listeners: {}, addEventListener(event, callback) { this.listeners[event] = callback; } });
  }
  const saved = [];
  const requested = [];
  const sandbox = {
    URL, AbortSignal, setTimeout() {},
    document: { getElementById: id => elements.get(id), addEventListener(_event, callback) { sandbox.ready = callback; } },
    chrome: {
      storage: { local: {
        get: (_keys, callback) => callback(config),
        set(values, callback) { saved.push(values); callback?.(); }
      } },
      permissions: { contains: async () => allowed, request: async request => { requested.push(request); return granted; } }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'options.js'), 'utf8'), sandbox);
  sandbox.ready();
  return { elements, saved, requested };
}

test('Options defaults agree with the content provider selection', () => {
  assert.equal(createOptionsHarness().elements.get('ai-provider').value, 'antigravity');
  assert.equal(createOptionsHarness({ linguaplay_gemini_key: 'fake-test-key' }).elements.get('ai-provider').value, 'gemini');
});

test('Options defaults auto-start on and saves an explicit opt-out', async () => {
  const h = createOptionsHarness();
  assert.equal(h.elements.get('auto-start-server').checked, true);
  h.elements.get('auto-start-server').checked = false;
  await h.elements.get('save-settings-btn').listeners.click();
  assert.equal(h.saved[0].linguaplay_auto_start_server, false);
  assert.equal(createOptionsHarness({ linguaplay_auto_start_server: false }).elements.get('auto-start-server').checked, false);
});

test('saving a remote custom endpoint requests access only to its host', async () => {
  const h = createOptionsHarness({}, { allowed: false });
  h.elements.get('ai-provider').value = 'opencode';
  h.elements.get('opencode-url').value = 'https://custom.example/v1';
  await h.elements.get('save-settings-btn').listeners.click();
  assert.equal(h.requested[0].origins[0], 'https://custom.example/*');
  assert.equal(h.saved[0].linguaplay_opencode_url, 'https://custom.example/v1');
});

test('denied endpoint access does not replace existing settings', async () => {
  const h = createOptionsHarness({}, { allowed: false, granted: false });
  h.elements.get('ai-provider').value = 'opencode';
  h.elements.get('opencode-url').value = 'https://custom.example/v1';
  await h.elements.get('save-settings-btn').listeners.click();
  assert.equal(h.saved.length, 0);
  assert.ok(h.elements.get('opencode-status-text').textContent.includes('not allowed'));
});

test('standalone custom endpoint explains an empty 403 response', async () => {
  const h = createStandaloneHarness('opencode');
  const errors = [];
  h.sandbox.fetch = async () => ({ ok: false, status: 403, json: async () => { throw new SyntaxError('Empty response'); } });
  await h.analyze({ word: '猫', onSuccess() {}, onError: error => errors.push(error) });
  assert.ok(errors[0].includes('403'));
  assert.ok(errors[0].includes('OLLAMA_ORIGINS'));
});

test('standalone OpenRouter honors the model saved in Options', async () => {
  const h = createStandaloneHarness('openrouter');
  h.sandbox.chrome.storage.local.set({ linguaplay_openrouter_key: 'fake-test-key', linguaplay_openrouter_model: 'test/custom-model' });
  await h.analyze({ word: '猫', onSuccess() {}, onError() {} });
  assert.equal(JSON.parse(h.calls[0].options.body).model, 'test/custom-model');
});

for (const [provider, expectedUrl] of [['deepseek', 'https://api.deepseek.com/v1/chat/completions'], ['opencode', 'http://127.0.0.1:11434/v1/chat/completions']]) {
  test(`the standalone player dispatches the saved ${provider} setting`, async () => {
    const h = createStandaloneHarness(provider);
    const errors = [];
    await h.analyze({ word: '猫', sentence: '猫がいる', onSuccess() {}, onError: error => errors.push(error) });
    assert.equal(h.calls[0]?.url, expectedUrl, `Provider errors: ${errors.join(', ')}`);
  });
}
