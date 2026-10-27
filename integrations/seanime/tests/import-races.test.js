import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({ entryPoints: ['src/learning-plugin.js'], bundle: true, write: false,
  format: 'iife', globalName: 'Learning', loader: { '.css': 'text' },
  define: { __LANGPLAY_UI_HTML__: '"fixture"' } }).outputFiles[0].text;
const content = '1\n00:00:01,000 --> 00:00:03,000\n猫\n';
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function fixture() {
  const pending = new Map(), handlers = new Map(), values = new Map(), states = [], responses = [], events = new Map(), intervals = [];
  const status = { id: 'episode', clientId: 'client', currentTime: 1.5, duration: 120, paused: false };
  let serial = 0;
  const ctx = {
    videoCore: { getCurrentClientId: () => 'client', getCurrentPlayerType: () => 'web',
      getCurrentPlaybackInfo: () => ({ id: 'episode', media: { id: 1 }, episode: { episodeNumber: 1 } }),
      getPlaybackStatus: () => status, pause() {}, resume() {}, addEventListener: (name, fn) => events.set(name, fn) },
    setInterval: fn => intervals.push(fn), newTray: () => ({ onClick() {} }),
    newWebview: () => ({ isHidden: () => false, setContent() {}, channel: {
      on: (event, fn) => handlers.set(event, fn), send(event, raw) { (event === 'learning:state' ? states : responses).push(JSON.parse(raw)); },
    } }),
    fetch: (url, options) => {
      const body = JSON.parse(options.body);
      if (url.endsWith('/subtitles')) return new Promise(resolve => pending.set(body.name, resolve));
      return Promise.resolve({ ok: true, json: () => ({ status: 'success', translation: 'Cat.', tokens: [
        { surface: body.text, start: 0, end: body.text?.length, reading: 'ネコ', baseForm: '猫', pos: '名詞' },
      ] }) });
    },
  };
  const sandbox = { ctx, $storage: { get: k => values.get(k), set: (k, v) => values.set(k, v) } };
  vm.runInNewContext(source + '\nLearning.start(ctx);', sandbox);
  const act = (op, data) => handlers.get('learning:request')({ v: 1, id: ++serial, op, data });
  return { act, pending, values, states, responses, events, intervals, status };
}

test('file import carrying a previous playback identity is rejected', async () => {
  const h = fixture();
  await h.act('preferences', { autoSubtitles: false });
  await h.act('import', { sourceId: 'good.srt', format: 'srt', content });
  const playback = h.states.at(-1).playback;
  await h.act('import', { sourceId: 'stale.srt', format: 'srt', content, expectedPlayback: { ...playback, playbackId: 'previous-episode' } });
  assert.match(h.responses.at(-1).error, /Episode changed/);
  assert.equal(JSON.parse(h.values.get('learning-v1:sources'))['1:1'].sourceId, 'good.srt');
});

test('a later manual source wins over an older saved-file request and its persisted association', async () => {
  const { act, pending, values, states, responses } = fixture();
  await act('preferences', { autoSubtitles: false });
  const old = act('saved-import', { name: 'old.srt', encoding: 'auto', offsetMs: 0 }); await flush();
  const newer = act('saved-import', { name: 'new.srt', encoding: 'auto', offsetMs: 0 }); await flush();
  pending.get('new.srt')({ ok: true, json: () => ({ status: 'success', sourceId: 'new.srt', format: 'srt', content }) }); await newer;
  pending.get('old.srt')({ ok: true, json: () => ({ status: 'success', sourceId: 'old.srt', format: 'srt', content }) }); await old;
  assert.equal(states.at(-1).source.sourceId, 'new.srt');
  assert.equal(JSON.parse(values.get('learning-v1:sources'))['1:1'].sourceId, 'new.srt');
  assert.ok(responses.some(response => /superseded|changed/i.test(response.error || '')));
});

test('a seek overlapping a routine poll still invalidates the selected context', async () => {
  const h = fixture();
  await h.act('preferences', { autoSubtitles: false });
  await h.act('import', { sourceId: 'sample.srt', format: 'srt', content });
  await h.act('select', { cueId: h.states.at(-1).activeCues[0].id, start: 0, end: 1 });
  const poll = h.intervals[0]();
  h.status.currentTime = 30;
  await h.events.get('video-seeked')();
  await poll;
  await h.intervals[0]();
  assert.equal(h.states.at(-1).positionMs, 30000);
  assert.equal(h.states.at(-1).selected, null);
  assert.equal(h.states.at(-1).drawerOpen, false);
});
