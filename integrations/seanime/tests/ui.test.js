import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const browser = await build({ entryPoints: [fileURLToPath(new URL('../src/ui.js', import.meta.url))], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020' });
function fixture({ saved = false } = {}) {
  const nodes = new Map(), listeners = {}, sent = [];
  const node = () => ({ value: '', hidden: false, textContent: '', children: [], setAttribute() {}, addEventListener() {}, replaceChildren() { this.children = []; this.value = ''; }, append(child) { this.children.push(child); if (!this.value) this.value = child.value; }, focus() {}, select() {} });
  const get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  vm.runInNewContext(browser.outputFiles[0].text, {
    document: { getElementById: get, createElement: node, activeElement: null, addEventListener() {} },
    setTimeout: () => 1, clearTimeout() {},
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, Blob: class {},
    webview: { on: (event, callback) => { listeners[event] = callback; }, send(event, message) {
      sent.push(message);
      if (message.op !== 'refresh') listeners['learning:response']({ id: message.id, result: message.op === 'export' ? { tsv: 'surface\tmeaning\n誰\twho', count: 1 } : message.op === 'saved-list' ? { folder: '/saved/subtitles', files: [{ name: 'Other.srt' }, { name: 'Japanese.srt' }] } : { ok: true } });
    } },
  });
  const state = { activeCues: [], preferences: { readingMode: 'plain' }, source: { sourceId: 'Japanese.srt', cueCount: 10, offsetMs: 0 },
    drawerOpen: false, selected: null, playback: { title: 'Generated fixture' }, positionMs: 1000, explanation: '', reply: '' };
  if (saved) { state.source = null; state.association = { sourceId: 'Japanese.srt' }; }
  const render = () => listeners['learning:state'](JSON.stringify(state));
  render(); return { get, sent, render, state };
}
test('tray subtitle settings offer a saved background percentage with a transparent endpoint', async () => {
  const ui = fixture(); assert.equal(ui.get('caption-opacity').value, 18);
  ui.get('caption-opacity').value = '0'; await ui.get('caption-opacity').oninput();
  assert.equal(ui.get('caption-opacity-value').textContent, '0% (Transparent)');
  assert.equal(ui.sent.at(-1).data.captionOpacity, 0);
  ui.state.preferences.captionOpacity = 100; ui.render();
  assert.equal(ui.get('caption-opacity').value, 100);
  assert.equal(ui.get('caption-opacity-value').textContent, '100% (Solid)');
});

test('the tray offers sentence meanings and shows English below the matching Japanese cue', async () => {
  const ui = fixture();
  assert.equal(ui.get('translation-mode').value, 'off');
  ui.get('translation-mode').value = 'english'; await ui.get('translation-mode').onchange();
  assert.equal(ui.sent.at(-1).data.showTranslation, true);
  ui.state.preferences.showTranslation = true;
  ui.state.activeCues = [{ id: 'line', text: '日本語' }];
  ui.state.tokens = { line: [{ surface: '日本語', start: 0, end: 3 }] };
  ui.state.captionTranslations = { line: { state: 'ready', translation: 'Japanese language.' } };
  ui.render();
  const line = ui.get('caption').children[0];
  assert.equal(line.children.at(-1).textContent, 'Japanese language.');
  ui.state.preferences.showTranslation = false; ui.render();
  assert.equal(line.children.at(-1).hidden, true);
});
test('Incoming clock updates preserve an edited delay until explicit Apply', async () => {
  const ui = fixture(); ui.get('offset').value = '1000'; ui.get('offset').oninput(); ui.render();
  assert.equal(ui.get('offset').value, '1000');
  await ui.get('apply-offset').onclick();
  assert.equal(ui.sent.find(m => m.op === 'offset').data.offsetMs, 1000);
});
test('Restart offers the associated saved file and requires an explicit load', async () => {
  const ui = fixture({ saved: true });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(ui.get('saved-subtitle').value, 'Japanese.srt');
  assert.equal(ui.get('saved-folder').textContent, '/saved/subtitles');
  assert.equal(ui.sent.some(message => message.op === 'saved-import'), false);
  ui.get('encoding').value = 'auto'; ui.get('offset').value = '100';
  await ui.get('load-saved').onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(ui.sent.find(message => message.op === 'saved-import').data)), { name: 'Japanese.srt', encoding: 'auto', offsetMs: 100 });
  assert.equal(ui.get('setup').hidden, true);
});
test('TSV export remains copyable when the host sandbox blocks downloads', async () => {
  const ui = fixture(); await ui.get('export').onclick();
  assert.equal(ui.get('cards-tsv').value, 'surface\tmeaning\n誰\twho');
  assert.equal(ui.get('card-export').hidden, false);
});

test('tray study displays sentence romaji, English and an actionable translation error',async()=>{
  const ui=fixture();
  Object.assign(ui.state,{drawerOpen:true,selected:{surface:'猫',sentence:'猫がいる'},sentenceRomaji:'neko ga iru',sentenceTranslation:'A cat is here.'});ui.render();
  assert.equal(ui.get('sentence-romaji').textContent,'neko ga iru');
  assert.equal(ui.get('sentence-translation').textContent,'A cat is here.');
  assert.equal(ui.get('sentence-translation').hidden,false);
  Object.assign(ui.state,{sentenceTranslation:'',translationError:'Check your AI provider.'});ui.render();
  assert.equal(ui.get('translation-retry').hidden,false);
  await ui.get('translation-retry').onclick();assert.equal(ui.sent.at(-1).op,'translate');
});
