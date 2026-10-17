import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('Production bundle survives isolated callback and only handles scoped messages', async () => {
  execFileSync(process.execPath, ['build.mjs'], { cwd: new URL('..', import.meta.url), stdio: 'pipe' });
  const payload = readFileSync(new URL('../dist/learning-plugin.js', import.meta.url), 'utf8');
  let callback;
  vm.runInNewContext(`${payload}\ninit()`, { $ui: { register(fn) { callback = fn.toString(); } } });
  const handlers = {}, sent = [], values = new Map(); let html, trayClick, shown = 0;
  const ctx = { videoCore: { getCurrentPlaybackInfo() {}, getPlaybackStatus() {}, getCurrentClientId() {}, getCurrentPlayerType() {}, addEventListener() {} },
    setInterval() {}, newTray: () => ({ onClick(fn) { trayClick = fn; } }),
    newWebview: () => ({ channel: { on: (event, fn) => { handlers[event] = fn; }, send: (event, value) => sent.push([event, JSON.parse(value)]) },
      isHidden: () => false, show() { shown++; }, hide() {}, setContent(fn) { html = fn(); } }) };
  vm.runInNewContext(`(${callback})(ctx)`, { ctx, $storage: { get: k => values.get(k), set: (k,v) => values.set(k,v) } });
  assert.match(html, /Learning subtitles/); assert.equal(html.includes('LANGPLAY_ASSETS'), false);
  await handlers['learning:request']({ v: 1, id: 1, op: 'refresh' });
  assert.equal(sent.find(([e]) => e === 'learning:state')[1].playback, null);
  await handlers['learning:request']({ v: 1, id: 2, op: 'fetch' });
  assert.match(sent.find(([e,v]) => e === 'learning:response' && v.id === 2)[1].error, /Invalid/);
  trayClick(); trayClick();
  assert.equal(shown, 2, 'Opening from the tray must recover a remounted window even when the host thinks it is visible');
});
