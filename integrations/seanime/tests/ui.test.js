import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
const browser = await build({ entryPoints: [new URL('../src/ui.js', import.meta.url).pathname], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020' });
function fixture() {
  const nodes = new Map(), listeners = {}, sent = [];
  const node = () => ({ value: '', hidden: false, textContent: '', setAttribute() {}, replaceChildren() {}, append() {}, focus() {}, select() {} });
  const get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  vm.runInNewContext(browser.outputFiles[0].text, {
    document: { getElementById: get, createElement: node, activeElement: null, addEventListener() {} },
    setTimeout: () => 1, clearTimeout() {},
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, Blob: class {},
    webview: { on: (event, callback) => { listeners[event] = callback; }, send(event, message) {
      sent.push(message);
      if (message.op !== 'refresh') listeners['learning:response']({ id: message.id, result: message.op === 'export' ? { tsv: 'surface\tmeaning\n誰\twho', count: 1 } : { ok: true } });
    } },
  });
  const state = { activeCues: [], preferences: { readingMode: 'plain' }, source: { sourceId: 'Japanese.srt', cueCount: 10, offsetMs: 0 },
    drawerOpen: false, selected: null, playback: { title: 'Generated fixture' }, positionMs: 1000, explanation: '', reply: '' };
  const render = () => listeners['learning:state'](JSON.stringify(state));
  render(); return { get, sent, render };
}
test('Incoming clock updates preserve an edited delay until explicit Apply', async () => {
  const ui = fixture(); ui.get('offset').value = '1000'; ui.get('offset').oninput(); ui.render();
  assert.equal(ui.get('offset').value, '1000');
  await ui.get('apply-offset').onclick();
  assert.equal(ui.sent.find(m => m.op === 'offset').data.offsetMs, 1000);
});
test('TSV export remains copyable when the host sandbox blocks downloads', async () => {
  const ui = fixture(); await ui.get('export').onclick();
  assert.equal(ui.get('cards-tsv').value, 'surface\tmeaning\n誰\twho');
  assert.equal(ui.get('card-export').hidden, false);
});
