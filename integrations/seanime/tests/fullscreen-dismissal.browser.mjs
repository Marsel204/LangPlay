import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

// Run separately with npm run test:fullscreen; requires Chromium, or set
// LANGPLAY_TEST_CHROMIUM to a Chrome/Chromium executable. No server or npm
// browser dependency is needed: CDP uses the child process's private pipes.
async function browser() {
  const candidates = [process.env.LANGPLAY_TEST_CHROMIUM, '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
  let executable;
  for (const candidate of candidates) {
    if (await access(candidate).then(() => true, () => false)) { executable = candidate; break; }
  }
  assert.ok(executable, 'Install Chromium or set LANGPLAY_TEST_CHROMIUM');
  const profile = await mkdtemp(path.join(tmpdir(), 'langplay-fullscreen-'));
  const child = spawn(executable, ['--headless', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--remote-debugging-pipe', `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const waiting = new Map();
  let serial = 0, buffer = Buffer.alloc(0);
  child.on('error', error => { for (const pending of waiting.values()) pending.reject(error); });
  child.on('exit', () => { for (const pending of waiting.values()) pending.reject(new Error('Chromium exited')); });
  child.stdio[4].on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    let end;
    while ((end = buffer.indexOf(0)) >= 0) {
      const message = JSON.parse(buffer.subarray(0, end).toString());
      buffer = buffer.subarray(end + 1);
      const pending = waiting.get(message.id);
      if (!pending) continue;
      waiting.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++serial;
    waiting.set(id, { resolve, reject });
    child.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
  return { send, async close() {
    await send('Browser.close').catch(() => {});
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    await rm(profile, { recursive: true, force: true });
  } };
}

function mountFixture({ meanings = false, fullscreen = true, study = true } = {}) {
  document.body.innerHTML = `<div id="fixture-parent"><div id="fixture-player"></div></div>`;
  document.body.style.cssText = 'margin:0;background:#30343b';
  const parent = document.getElementById('fixture-parent'), player = document.getElementById('fixture-player');
  parent.setAttribute('data-vc-element', 'inline-container'); parent.className = fullscreen ? 'fixed inset-0' : '';
  player.style.cssText = 'position:relative;width:100vw;height:100vh';
  // Seanime's MediaCoreTopSectionView is a full-width hit target at z-index
  // 999, top 32px in desktop fullscreen. Its empty right side overlaps Close.
  const toolbar = document.createElement('div');
  toolbar.id = 'host-title-controls';
  toolbar.style.cssText = 'position:absolute;top:32px;left:0;width:100%;height:64px;z-index:999;transform:translateZ(0)';
  toolbar.textContent = 'Karakai Jouzu no Takagi-san Movie'; player.append(toolbar);
  const wrappers = new WeakMap(); let serial = 0;
  function wrap(element) {
    if (!element) return null;
    if (wrappers.has(element)) return wrappers.get(element);
    if (!element.id) element.id = `fixture-${++serial}`;
    const wrapper = {
      element, id: element.id, attributes: Object.fromEntries([...element.attributes].map(a => [a.name, a.value])),
      setAttribute: (name, value) => element.setAttribute(name, value), removeAttribute: name => element.removeAttribute(name),
      getAttribute: async name => element.getAttribute(name), setText: value => { element.textContent = value; },
      setStyle: (name, value) => element.style.setProperty(name, value), removeStyle: name => element.style.removeProperty(name),
      getStyle: async name => element.style.getPropertyValue(name),
      getProperty: async name => element[name], setProperty: (name, value) => { element[name] = value; },
      append: child => element.append(child.element), after: child => element.after(child.element), remove: () => element.remove(),
      getParent: async () => wrap(element.parentElement), getChildren: async () => [...element.children].map(wrap),
      queryOne: async selector => wrap(element.querySelector(selector)),
      addEventListener(name, handler) {
        const listener = event => Promise.resolve(handler(event)).catch(error => window.fixtureErrors.push(error.message));
        element.addEventListener(name, listener); return () => element.removeEventListener(name, listener);
      },
    };
    wrappers.set(element, wrapper); return wrapper;
  }
  window.fixtureErrors = []; window.fixtureActions = [];
  window.surface = Surface.createPlayerSurface({
    ctx: { dom: { queryOne: async () => wrap(player), query: async selector => [...document.querySelectorAll(selector)].map(wrap),
      createElement: async tag => wrap(document.createElement(tag)), viewport: { getSize: () => ({ width: innerWidth }) } } },
    act: async op => { window.fixtureActions.push(op); }, openPanel() {},
  });
  let offset = 0;
  const tokens = [['うっ','u'],[' ',''],['見てた','miteta'],[' ',''],['の','no'],[' ',''],['か','ka'],['…','']]
    .map(([surface, romaji]) => { const start = offset; offset += surface.length; return { surface, romaji, start, end: offset }; });
  window.fixtureState = { playback: { title: 'Takagi-san Movie', episode: '1' }, drawerOpen: study,
    preferences: { readingMode: 'romaji', showTranslation: meanings }, source: { sourceId: 'movie.srt', cueCount: 1 },
    activeCues: meanings ? [{ id: 'line', text: tokens.map(token => token.surface).join('') }] : [], tokens: {line:tokens},
    captionTranslations: { line: { state: 'ready', translation: 'You were watching me…?' } },
    selected: { surface: '蛍', sentence: 'ほら 蛍 の…', span: { start: 3, end: 4 } } };
  return window.surface.update(window.fixtureState);
}

test('player captions and fullscreen study remain usable', { timeout: 30000 }, async t => {
  const result = await build({ entryPoints: ['src/player-surface.js'], bundle: true, write: false,
    format: 'iife', globalName: 'Surface', loader: { '.css': 'text' } });
  const chrome = await browser();
  try {
    const { targetId } = await chrome.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await chrome.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => chrome.send(method, params, sessionId);
    const evaluate = async expression => {
      const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
      return response.result.value;
    };
    for (const [width, input] of [[1280, 'pointer'], [1280, 'Enter'], [1280, 'Escape'], [390, 'pointer']]) {
      await t.test(`${width}px ${input}`, async () => {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false });
        await evaluate(result.outputFiles[0].text + '\n(' + mountFixture.toString() + ')()');
        if (input === 'pointer') {
          const point = await evaluate(`(() => {
            const close = document.querySelector('[data-langplay="close"]');
            const box = close.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
            const hit = document.elementFromPoint(x, y);
            return { x, y, target: hit?.getAttribute('data-langplay'), blocker: hit?.id };
          })()`);
          assert.equal(point.target, 'close', `Close is covered by ${point.blocker}`);
          await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
          await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
        } else {
          await evaluate(`document.querySelector('[data-langplay="close"]').focus()`);
          await send('Input.dispatchKeyEvent', { type: 'keyDown', key: input, code: input,
            windowsVirtualKeyCode: input === 'Enter' ? 13 : 27, ...(input === 'Enter' ? { text: '\r' } : {}) });
          await send('Input.dispatchKeyEvent', { type: 'keyUp', key: input, code: input, windowsVirtualKeyCode: input === 'Enter' ? 13 : 27 });
        }
        const state = await evaluate(`({ hidden: document.querySelector('[data-langplay="drawer"]').hidden,
          reservation: document.querySelector('[data-langplay="captions"]').getAttribute('data-study-open'),
          actions: window.fixtureActions, errors: window.fixtureErrors })`);
        assert.equal(state.hidden, true); assert.equal(state.reservation, 'false');
        assert.deepEqual(state.actions, ['close']); assert.deepEqual(state.errors, []);
      });
    }
    for (const width of [1280, 390]) for (const fullscreen of [false, true]) {
      await t.test(`${width}px ${fullscreen ? 'fullscreen' : 'windowed'} sentence meaning`, async () => {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false });
        await evaluate(result.outputFiles[0].text + '\n(' + mountFixture.toString() + `)({meanings:true,fullscreen:${fullscreen},study:false})`);
        const layout = await evaluate(`(() => {
          const meaning = document.querySelector('[data-langplay="caption-translation"]');
          const words = [...document.querySelectorAll('[data-langplay="token"]')];
          window.originalWord = words[0];
          const box = meaning.getBoundingClientRect();
          return { text: meaning.textContent, below: box.top >= Math.max(...words.map(word => word.getBoundingClientRect().bottom)),
            contained: box.left >= 0 && box.right <= innerWidth && box.bottom < innerHeight,
            smaller: parseFloat(getComputedStyle(meaning).fontSize) < parseFloat(getComputedStyle(words[0]).fontSize),
            overflow: document.documentElement.scrollWidth > innerWidth };
        })()`);
        assert.equal(layout.text, 'You were watching me…?'); assert.equal(layout.below, true);
        assert.equal(layout.contained, true); assert.equal(layout.smaller, true); assert.equal(layout.overflow, false);
        if (process.env.LANGPLAY_BROWSER_CAPTURE_DIR && fullscreen) {
          await mkdir(process.env.LANGPLAY_BROWSER_CAPTURE_DIR, { recursive: true });
          const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          await writeFile(path.join(process.env.LANGPLAY_BROWSER_CAPTURE_DIR, `sentence-meaning-${width}.png`), Buffer.from(data, 'base64'));
        }
        await evaluate(`window.fixtureState.captionTranslations.line.translation = 'Were you watching?'; window.surface.update(window.fixtureState)`);
        assert.equal(await evaluate(`document.querySelector('[data-langplay="token"]') === window.originalWord`), true);
        await evaluate(`window.fixtureState.captionTranslations.line.translation = 'A longer English sentence that should wrap within the Japanese caption without covering the player. '.repeat(8); window.surface.update(window.fixtureState)`);
        const long = await evaluate(`(() => { const node = document.querySelector('[data-langplay="caption-translation"]');
          const box = node.getBoundingClientRect(); return { contained: box.left >= 0 && box.right <= innerWidth,
            clamped: box.height <= parseFloat(getComputedStyle(node).lineHeight) * 3 + 1 }; })()`);
        assert.equal(long.contained, true); assert.equal(long.clamped, true);
        await evaluate(`window.fixtureState.preferences.showTranslation = false; window.surface.update(window.fixtureState)`);
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-langplay="caption-translation"]')).display`), 'none');
        assert.deepEqual(await evaluate('window.fixtureErrors'), []);
      });
    }
  } finally { await chrome.close(); }
});
