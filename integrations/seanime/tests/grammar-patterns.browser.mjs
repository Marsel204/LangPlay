import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { detectGrammarPatterns } from '../src/grammar-patterns.js';

const screenshotPath = process.env.LANGPLAY_GRAMMAR_SCREENSHOT || '';

async function browser() {
  const candidates = [process.env.LANGPLAY_TEST_CHROMIUM, '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
  let executable;
  for (const candidate of candidates) {
    if (await access(candidate).then(() => true, () => false)) { executable = candidate; break; }
  }
  assert.ok(executable, 'Install Chromium or set LANGPLAY_TEST_CHROMIUM');
  const base = process.platform === 'linux' && tmpdir().length > 40 ? '/tmp' : tmpdir();
  const profile = await mkdtemp(path.join(base, 'lp-sea-gram-'));
  const child = spawn(executable, ['--headless', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--window-size=1320,860', '--remote-debugging-pipe', `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], env: { ...process.env, TMPDIR: base } });
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

test('Seanime player Study drawer renders JLPT grammar patterns and highlights matched tokens in Chromium', { timeout: 30000 }, async () => {
  const result = await build({
    entryPoints: ['src/player-surface.js'], bundle: true, write: false,
    format: 'iife', globalName: 'Surface', target: 'es2017', loader: { '.css': 'text' },
  });
  const patterns = detectGrammarPatterns('日本語しか分からない');
  const chrome = await browser();
  try {
    const { targetId } = await chrome.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await chrome.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => chrome.send(method, params, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 1320, height: 860, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expression => {
      const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
      return response.result.value;
    };
    await evaluate(result.outputFiles[0].text);
    const state = await evaluate(`(async () => {
      document.body.innerHTML = '<div id="fixture-parent"><div id="fixture-player"></div></div>';
      document.body.style.cssText = 'margin:0;padding:20px;background:#101218';
      const parent = document.getElementById('fixture-parent'), player = document.getElementById('fixture-player');
      player.style.cssText = 'position:relative;height:620px;background:linear-gradient(135deg,#1b1e2c,#27213c);border-radius:12px;overflow:hidden';
      const wrappers = new WeakMap(); let serial = 0;
      function wrap(element) {
        if (!element) return null;
        if (wrappers.has(element)) return wrappers.get(element);
        if (!element.id) element.id = 'fx-' + (++serial);
        const wrapper = {
          element, id: element.id, attributes: Object.fromEntries([...element.attributes].map(a => [a.name, a.value])),
          setAttribute: (k, v) => element.setAttribute(k, v), removeAttribute: k => element.removeAttribute(k),
          getAttribute: async k => element.getAttribute(k), setText: v => { element.textContent = v; },
          setStyle: (k, v) => element.style.setProperty(k, v), removeStyle: k => element.style.removeProperty(k),
          getStyle: async k => element.style.getPropertyValue(k),
          getProperty: async k => element[k], setProperty: (k, v) => { element[k] = v; },
          append: child => element.append(child.element), after: child => element.after(child.element), remove: () => element.remove(),
          getParent: async () => wrap(element.parentElement), getChildren: async () => [...element.children].map(wrap),
          queryOne: async sel => wrap(element.querySelector(sel)),
          addEventListener(name, handler) { element.addEventListener(name, handler); return () => element.removeEventListener(name, handler); },
        };
        wrappers.set(element, wrapper); return wrapper;
      }
      window.chatActions = [];
      const surface = Surface.createPlayerSurface({
        ctx: { dom: { queryOne: async () => wrap(player), query: async sel => [...document.querySelectorAll(sel)].map(wrap),
          createElement: async tag => wrap(document.createElement(tag)), viewport: { getSize: () => ({ width: 1320 }) } } },
        act: async (op, data) => { window.chatActions.push([op, data]); return { reply: 'Explanation' }; },
        openPanel() {},
      });
      const tokens = [
        { surface: '日本語', start: 0, end: 3, furigana: 'にほんご', romaji: 'nihongo', pos: '名詞', meaning: 'Japanese (language)', meaningBusy: false },
        { surface: 'しか', start: 3, end: 5, furigana: 'しか', romaji: 'shika', pos: '助詞', meaning: 'only', meaningBusy: false },
        { surface: '分からない', start: 5, end: 10, furigana: 'わからない', romaji: 'wakaranai', pos: '動詞', meaning: 'to understand', meaningBusy: false },
      ];
      await surface.update({
        playback: { title: 'Seanime Demo', episode: '1' }, positionMs: 1500, source: { sourceId: 'ep1.srt', cueCount: 1 },
        preferences: { readingMode: 'furigana', showTranslation: true, captionOpacity: 18 },
        activeCues: [{ id: 'c1', text: '日本語しか分からない' }], tokens: { c1: tokens },
        captionTranslations: { c1: { state: 'ready', translation: 'I only understand Japanese.' } },
        drawerOpen: true, selected: { surface: '分からない', sentence: '日本語しか分からない', title: 'Seanime Demo', episode: '1', videoTimeMs: 1500, span: { start: 5, end: 10 } },
        reading: 'わからない', romaji: 'wakaranai', baseForm: '分かる', meaning: 'to understand; to comprehend',
        sentenceTokens: tokens, sentenceTranslation: 'I only understand Japanese.',
        grammarPatterns: ${JSON.stringify(patterns)},
      });
      const toggle = document.querySelector('[data-langplay="grammar-toggle"]');
      // Simulate Seanime transport handler that intercepts Enter/Space on non-inputs.
      window.transportIntercepted = 0;
      document.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName !== 'INPUT') {
          e.preventDefault(); window.transportIntercepted++;
        }
      }, true);
      toggle.focus();
      toggle.click();
      const highlighted = [...document.querySelectorAll('[data-langplay="sentence"] [data-grammar-match="true"]')]
        .map(el => el.querySelector('ruby')?.firstChild?.textContent || el.textContent);
      return {
        visible: !document.querySelector('[data-langplay="grammar-section"]').hidden,
        tag: toggle.tagName,
        inputType: toggle.type,
        expanded: toggle.getAttribute('aria-expanded'),
        badge: document.querySelector('[data-langplay="jlpt-badge"]')?.textContent,
        pattern: toggle.value,
        matched: document.querySelector('[data-langplay="grammar-match"] mark')?.textContent,
        highlighted,
      };
    })()`);
    // Verify real Chromium Enter & Space keystrokes toggle the native input without transport interception.
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    const afterSpace = await evaluate(`({ expanded: document.querySelector('[data-langplay="grammar-toggle"]').getAttribute('aria-expanded'), intercepted: window.transportIntercepted })`);
    assert.equal(afterSpace.expanded, 'false');
    assert.equal(afterSpace.intercepted, 0);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    const afterEnter = await evaluate(`({ expanded: document.querySelector('[data-langplay="grammar-toggle"]').getAttribute('aria-expanded'), intercepted: window.transportIntercepted })`);
    assert.equal(afterEnter.expanded, 'true');
    assert.equal(afterEnter.intercepted, 0);

    assert.equal(state.visible, true);
    assert.equal(state.tag, 'INPUT');
    assert.equal(state.inputType, 'button');
    assert.equal(state.expanded, 'true');
    assert.equal(state.badge, 'N4');
    assert.match(state.pattern, /〜しか〜ない/);
    assert.equal(state.matched, 'しか分からない');
    assert.deepEqual(state.highlighted, ['しか', '分からない']);

    if (screenshotPath) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(screenshotPath, Buffer.from(data, 'base64'));
    }
  } finally {
    await chrome.close();
  }
});
