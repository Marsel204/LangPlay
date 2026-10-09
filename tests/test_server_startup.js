const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = fs.existsSync(path.join(__dirname, '..', 'extension', 'manifest.json'))
  ? path.join(__dirname, '..', 'extension')
  : path.resolve(__dirname, '..');
function worker(config = {}) {
  const nativeCalls = [];
  let listener;
  const sandbox = {
    console, URL, AbortSignal,
    fetch: async () => { throw new Error('Offline'); },
    chrome: {
      storage: { local: { get: async () => config } },
      runtime: {
        id: 'abcdefghijklmnopabcdefghijklmnop',
        onInstalled: { addListener() {} },
        onMessage: { addListener(fn) { listener = fn; } },
        sendNativeMessage(name, message, callback) {
          nativeCalls.push({ name, message });
          callback({ success: true, started: true });
        },
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), sandbox);
  const sender = { id: sandbox.chrome.runtime.id, url: 'https://www.youtube.com/watch?v=test' };
  return { sandbox, config, nativeCalls, sender, request: (overrides = {}) => new Promise(resolve => listener({ action: 'ENSURE_LOCAL_SERVER', port: 9000 }, { ...sender, ...overrides }, resolve)) };
}

test('untrusted origins and other extensions cannot launch a server', async () => {
  const h = worker();
  for (const sender of [{ id: 'other' }, { url: 'https://example.com/watch' }, { url: 'https://youtube.com.example.com/watch' }, { url: 'https://www.youtube.com/' }]) {
    assert.equal((await h.request(sender)).success, false);
  }
  assert.equal(h.nativeCalls.length, 0);
});

test('disabled auto-start and remote endpoints do not launch locally', async () => {
  for (const config of [{ linguaplay_auto_start_server: false }, { linguaplay_server_url: 'https://example.com:8000' }, { linguaplay_server_url: 'http://127.0.0.1:8000/other' }]) {
    const h = worker(config);
    assert.equal((await h.request()).skipped, true);
    assert.equal(h.nativeCalls.length, 0);
  }
});

test('a healthy local server is reused without invoking the launcher', async () => {
  const h = worker();
  h.sandbox.fetch = async () => ({ ok: true, json: async () => ({ status: 'success', antigravity_available: false }) });
  assert.equal((await h.request()).started, false);
  assert.equal(h.nativeCalls.length, 0);
});

test('simultaneous playback requests launch once using the saved port', async () => {
  const h = worker({ linguaplay_server_url: 'http://localhost:8123' });
  const answers = await Promise.all(Array.from({ length: 8 }, () => h.request()));
  assert.ok(answers.every(answer => answer.success && answer.started));
  assert.equal(h.nativeCalls.length, 1);
  assert.equal(h.nativeCalls[0].name, 'com.linguaplay.server');
  assert.equal(h.nativeCalls[0].message.port, 8123);
});

test('missing native host reports setup instructions and avoids repeated launches', async () => {
  const h = worker();
  h.sandbox.chrome.runtime.sendNativeMessage = (_name, _message, callback) => {
    h.nativeCalls.push({});
    h.sandbox.chrome.runtime.lastError = { message: 'Host not found' };
    callback();
    delete h.sandbox.chrome.runtime.lastError;
  };
  assert.match((await h.request()).error, /Install native\/install_host.py/);
  assert.equal((await h.request()).success, false);
  assert.equal(h.nativeCalls.length, 1);
  h.sandbox.fetch = async () => ({ ok: true, json: async () => ({ status: 'success', antigravity_available: true }) });
  assert.equal((await h.request()).success, true, 'A server started manually can recover during the cooldown');
});

test('extension player and Options can request startup', async () => {
  const h = worker();
  for (const page of ['player.html', 'options.html']) {
    assert.equal((await h.request({ url: `chrome-extension://${h.sender.id}/${page}` })).success, true);
  }
});

test('standalone native and iframe players start only upon playback', async () => {
  const messages = [];
  const listeners = {};
  let playerEvents;
  const video = { paused: true, ended: false, addEventListener(name, fn) { listeners[name] = fn; }, pause() {}, load() {}, removeAttribute() {}, classList: { add() {}, remove() {} } };
  const sandbox = {
    console, setInterval() {}, clearInterval() {},
    retryJapaneseParser() {}, refreshTokenParsing() {},
    chrome: { runtime: { sendMessage(message, callback) { messages.push(message); callback({ success: true }); } } },
    window: { location: { origin: 'chrome-extension://test' }, YT: { PlayerState: { PLAYING: 1 }, Player: function (_id, config) { playerEvents = config.events; } } },
    document: { getElementById() { return { classList: { add() {}, remove() {} } }; } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/player-controller.js'), 'utf8').replace(/^import .*;\n/gm, '').replace(/export \{[^}]+\};/g, '').replace(/export /g, '') + '\nglobalThis.api = { initPlayer, loadYouTubeVideo };', sandbox);
  sandbox.api.initPlayer(video, () => {});
  assert.equal(messages.length, 0);
  listeners.playing();
  assert.equal(messages.length, 0);
  video.paused = false;
  listeners.playing();
  assert.equal(messages[0].action, 'ENSURE_LOCAL_SERVER');
  const ready = sandbox.api.loadYouTubeVideo('test');
  await new Promise(resolve => setImmediate(resolve));
  playerEvents.onReady();
  await ready;
  playerEvents.onStateChange({ data: 2 });
  assert.equal(messages.length, 1);
  playerEvents.onStateChange({ data: 1 });
  assert.equal(messages.length, 2);
  listeners.playing();
  assert.equal(messages.length, 2, 'Hidden HTML5 playback does not trigger startup in iframe mode');
});
