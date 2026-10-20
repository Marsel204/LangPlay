import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

execFileSync(process.execPath, ['build.mjs'], { cwd: new URL('..', import.meta.url), stdio: 'pipe' });
const payload = readFileSync(new URL('../dist/learning-plugin.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const subtitle = '1\n00:00:01,000 --> 00:00:03,000\n猫\n\n2\n00:00:04,000 --> 00:00:06,000\n犬\n\n3\n00:00:30,000 --> 00:00:32,000\n鳥\n';

function fixture() {
  const requests = [], states = [], pending = [], intervals = [], handlers = new Map();
  const info = { id: 'episode-1', media: { id: 1 }, episode: { episodeNumber: 1 } };
  const status = { id: info.id, clientId: 'client', currentTime: 0, duration: 1200, paused: false };
  const values = new Map();
  const ctx = {
    dom: { queryOne: async () => null, createElement: async () => ({}) },
    videoCore: {
      getCurrentPlaybackInfo: () => info, getPlaybackStatus: () => status,
      getCurrentClientId: () => status.clientId, getCurrentPlayerType: () => 'web', addEventListener() {},
    },
    newTray: () => ({ onClick() {} }),
    newWebview: () => ({
      channel: { on: (event, fn) => handlers.set(event, fn), send: (event, value) => { if (event === 'learning:state') states.push(JSON.parse(value)); } },
      isHidden: () => false, setContent() {},
    }),
    setInterval(fn) { intervals.push(fn); },
    fetch(url, options) {
      assert.match(url, /\/api\/parse$/, 'caption preparation must only use the local parser');
      const { text } = JSON.parse(options.body); requests.push(text);
      return new Promise(resolve => pending.push({ text, resolve }));
    },
  };
  let callback;
  vm.runInNewContext(`${payload}\ninit()`, { $ui: { register(fn) { callback = fn.toString(); } } });
  vm.runInNewContext(`(${callback})(ctx)`, { ctx, $storage: { get: k => values.get(k), set: (k, v) => values.set(k, v) } });
  const act = async (op, data) => { await handlers.get('learning:request')({ v: 1, id: 1, op, data }); await flush(); };
  return { requests, states, status, info, act,
    async load(content = subtitle, offsetMs = 0) { await act('preferences', { readingMode: 'romaji', autoSubtitles: false }); await act('import', { sourceId: 'test.srt', format: 'srt', content, offsetMs }); },
    async tick() { for (const fn of intervals) await fn(); await flush(); },
    async resolve(text) {
      const request = pending.find(item => item.text === text); assert.ok(request, `parser request for ${text} exists`);
      request.resolve({ ok: true, json: () => ({ status: 'success', tokens: [{ surface: text, start: 0, end: text.length, reading: 'ネコ', baseForm: text, pos: '名詞' }] }) });
      await flush();
    },
    latest: () => states.at(-1),
  };
}

test('romaji is prepared before a cue begins, including during a subtitle gap', async () => {
  const h = fixture(); await h.load(); await h.tick();
  assert.ok(h.requests.includes('猫'), 'first line must be parsed before its start');
  assert.ok(h.requests.includes('犬'), 'following line must also be prepared');
  assert.equal(h.requests.includes('鳥'), false, 'do not parse the entire episode');
  await h.resolve('猫'); h.status.currentTime = 1; await h.tick();
  const state = h.latest(), cue = state.activeCues[0];
  assert.equal(state.tokens[cue.id][0].romaji, 'neko', 'readings must exist on the first visible cue update');
  assert.equal(h.requests.filter(text => text === '猫').length, 1, 'reuse parser work');
});

test('newly ready romaji reaches the visible caption without waiting for the next timer', async () => {
  const h = fixture(); h.status.currentTime = 1.5; await h.load(); await h.tick();
  await h.resolve('猫');
  const state = h.latest(), cue = state.activeCues[0];
  assert.equal(state.tokens[cue.id]?.[0]?.romaji, 'neko', 'publish parser completion immediately');
});

test('lookahead follows subtitle delay and a seek to a different part of the episode', async () => {
  const h = fixture(); await h.load(subtitle, 20000); await h.tick();
  assert.equal(h.requests.length, 0, 'a delayed cue outside the preparation window is not due yet');
  h.status.currentTime = 20; await h.tick();
  assert.ok(h.requests.includes('猫'), 'offset is applied exactly once');
  h.status.currentTime = 49; await h.tick();
  assert.ok(h.requests.includes('鳥'), 'seek prepares the upcoming line at the new position');
});

test('caption preparation bounds outstanding requests and does not duplicate them on repeated ticks', async () => {
  const h = fixture();
  const dense = Array.from({ length: 20 }, (_, i) => `${i + 1}\n00:00:01,000 --> 00:00:05,000\n猫${i}\n`).join('\n');
  h.status.currentTime = 1.5; await h.load(dense); await h.tick(); await h.tick();
  assert.ok(h.requests.length > 0 && h.requests.length <= 4, 'no more than four parser requests in flight');
  assert.equal(new Set(h.requests).size, h.requests.length);
});

test('a late reading result cannot restore captions from the previous episode', async () => {
  const h = fixture(); h.status.currentTime = 1.5; await h.load(); await h.tick();
  h.info.id = h.status.id = 'episode-2'; h.info.episode.episodeNumber = 2; await h.tick();
  await h.resolve('猫');
  assert.equal(h.latest().source, null);
  assert.deepEqual(h.latest().activeCues, []);
  assert.deepEqual(h.latest().tokens, {});
});
