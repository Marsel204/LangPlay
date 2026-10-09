// Run with: node tests/browser_custom_ai.mjs (requires Chromium).
// Uses a disposable browser profile and a local mock API; never calls a model.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import assert from 'node:assert/strict';
import { checkSubtitleVisibility } from './browser_subtitle_visibility_checks.mjs';
import { checkNativeStartup } from './browser_native_startup_checks.mjs';
import { checkJapaneseParsing } from './browser_japanese_parsing_checks.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browserBinary = process.env.CHROMIUM_PATH || 'chromium';
const profile = await mkdtemp(path.join(tmpdir(), 'linguaplay-browser-'));
const requests = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    requests.push({ method: req.method, url: req.url, origin: req.headers.origin, body });
    if (req.url === '/api/ai/analyze') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'success', data: { word_by_word: [{ word: '猫', reading: 'ねこ', romaji: 'neko', meaning: 'cat' }] } }));
      }, 5200);
      return;
    }
    if (req.headers.origin === 'https://www.youtube.com') {
      res.writeHead(403); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"contextual_meaning":"cat"}' } }] }));
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = spawn(browserBinary, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-dev-shm-usage', '--window-size=1440,900', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--load-extension=${root}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
try {
  const debuggerUrl = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Browser did not start: ${stderr.slice(-1500)}`)), 15000);
    browser.stderr.on('data', chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    browser.on('error', error => { clearTimeout(timer); reject(error); });
    browser.on('exit', code => { clearTimeout(timer); reject(new Error(`Browser exited ${code}`)); });
  });
  ws = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
  });
  function rpc(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  let worker;
  for (let i = 0; i < 50; i++) {
    const { targetInfos } = await rpc('Target.getTargets');
    worker = targetInfos.find(target => target.type === 'service_worker' && target.url.endsWith('/background.js'));
    if (worker) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(worker, 'The real extension service worker must register successfully');
  const extensionOrigin = `chrome-extension://${new URL(worker.url).hostname}`;
  const { targetId } = await rpc('Target.createTarget', { url: `${extensionOrigin}/options.html` });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  async function evaluate(expression) {
    const result = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  for (let i = 0; i < 50; i++) {
    if (await evaluate('typeof chrome.storage !== "undefined" && document.readyState === "complete"')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const permission = await evaluate('chrome.permissions.contains({origins:["http://127.0.0.1/*"]})');
  assert.equal(permission, true, 'Local endpoint permissions must cover arbitrary local model ports');
  await evaluate(`chrome.storage.local.set({linguaplay_opencode_url:"http://127.0.0.1:${port}/v1",linguaplay_opencode_model:"test-model"})`);
  const answer = await evaluate('chrome.runtime.sendMessage({action:"CALL_CUSTOM_AI",isJson:true,messages:[{role:"user",content:"Explain 猫"}]})');
  assert.equal(answer.success, true, JSON.stringify(answer));
  assert.equal(answer.content, '{"contextual_meaning":"cat"}');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, '/v1/chat/completions');
  assert.notEqual(requests[0].origin, 'https://www.youtube.com');
  const standalone = await evaluate(`(async () => {
    const ai = await import(chrome.runtime.getURL('js/ai.js'));
    ai.setAIProvider('opencode');
    return await new Promise(resolve => ai.requestAIAnalysis({word:'猫',sentence:'猫がいる',onSuccess: data => resolve({success:true,data}),onError: error => resolve({success:false,error})}));
  })()`);
  assert.equal(standalone.success, true, JSON.stringify(standalone));
  assert.equal(standalone.data.contextual_meaning, 'cat');
  const nativeStartup = await checkNativeStartup({ root, profile, extensionOrigin, evaluate });
  const subtitleVisibility = await checkSubtitleVisibility({ root, evaluate, rpc, sessionId, localAiUrl: `http://127.0.0.1:${port}` });
  const localAnalysis = requests.find(request => request.url === '/api/ai/analyze');
  assert.ok(localAnalysis);
  assert.ok(Object.hasOwn(JSON.parse(localAnalysis.body), 'romaji'), 'Send the reading using the backend romaji field');
  const japaneseParsing = process.env.PARSER_SERVER_DIR ? await checkJapaneseParsing({root,evaluate,backend:process.env.PARSER_SERVER_DIR}) : {skipped:'Set PARSER_SERVER_DIR to test a real Sudachi backend'};
  console.log(JSON.stringify({ extensionLoaded: true, localHostPermission: permission, workerRequest: answer.success, standaloneCustomRequest: standalone.success, origins: requests.map(request => request.origin || '(none)'), nativeStartup, subtitleVisibility, japaneseParsing }));
} finally {
  ws?.close();
  browser.kill('SIGTERM');
  await new Promise(resolve => { if (browser.exitCode !== null || !browser.pid) resolve(); else browser.once('exit', resolve); });
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
