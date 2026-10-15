import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { start } from '../src/plugin.js';

test('Probe iframe uses the pinned host browser bridge, distinct from the host-side channel', () => {
  let html;
  start({
    videoCore: { addEventListener() {} },
    newTray() { return { onClick() {} }; },
    newWebview() { return { channel: { on() {} }, setContent(render) { html = render(); } }; },
  });
  const listeners = {}, sent = [], receivers = {};
  const elements = { result: { textContent: '' }, line: { value: '来ない' }, path: { value: '/fixture/episode.ass' } };
  // Pinned plugin-webviews.tsx generates window.webview with direct on/send.
  // There is deliberately no `channel` property in the iframe API.
  const webview = { on(event, receive) { receivers[event] = receive; }, send(event, payload) { sent.push({ event, payload }); } };
  const document = { addEventListener(event, fn) { listeners[event] = fn; }, getElementById(id) { return elements[id]; } };
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  vm.runInNewContext(script, { webview, document });
  listeners.click({ target: { dataset: { op: 'snapshot' } } });
  assert.equal(sent[0].event, 'probe:snapshot');
  listeners.click({ target: { dataset: { op: 'read' } } });
  assert.equal(sent[1].payload.path, '/fixture/episode.ass');
  receivers['probe:result']({ error: 'No active playback' });
  assert.equal(elements.result.textContent, JSON.stringify({ error: 'No active playback' }, null, 2));
  receivers['probe:result'](JSON.stringify({ file: { size: 100 } }));
  assert.equal(elements.result.textContent, JSON.stringify({ file: { size: 100 } }, null, 2));
  let prevented = false;
  listeners.keydown({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(sent[2].event, 'probe:close', 'Escape must never send a resume action');
});

test('Probe replies use JSON strings so the pinned host works without an AniList token', async () => {
  const handlers = {}, sent = [];
  start({
    videoCore: { addEventListener() {}, getPlaybackState() {}, getCurrentPlaybackInfo() {},
      async getTextTracks() {}, getCurrentClientId() { return ''; }, getCurrentPlayerType() { return ''; }, getPlaybackStatus() {} },
    newTray() { return { onClick() {} }; },
    newWebview() { return { channel: { on(event, handler) { handlers[event] = handler; },
      send(event, payload) { sent.push({ event, payload }); } }, setContent() {} }; },
  });
  await handlers['probe:select']({ text: '猫' });
  assert.equal(sent.length, 1);
  assert.equal(typeof sent[0].payload, 'string', 'Host drops object-valued replies when its AniList token is empty');
  assert.equal(JSON.parse(sent[0].payload).error, 'No active identified playback.');
});
