// Run with: node tests/browser_9router.mjs (requires Chromium).
// Uses a disposable browser profile and a local mock API; never calls a model.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../extension');
const browserBinary = process.env.CHROMIUM_PATH || 'chromium';
const profile = await mkdtemp(path.join(tmpdir(), 'linguaplay-browser-'));
const requests = [];
let hold = false;
const held = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    requests.push({ method: req.method, url: req.url, origin: req.headers.origin, authorization: req.headers.authorization, body });
    if (req.url === '/v1/models') {res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({data:[{id:'oc/exact-model'},{id:'my-combo'}]})); return;}
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
    if (hold) {held.push(res); return;}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ finish_reason:'stop', message: { content: '{"contextual_meaning":"cat"}' } }] }));
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
      const timer = setTimeout(() => {pending.delete(id); reject(new Error('CDP timed out: '+method+' '+JSON.stringify(params).slice(0,200)));}, 15000);
      pending.set(id, {resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
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
  await evaluate(`(() => {
    document.getElementById('ai-provider').value = '9router';
    document.getElementById('9router-url').value = 'http://127.0.0.1:${port}/v1/chat/completions/';
    document.getElementById('9router-key').value = 'fake-browser-token';
    document.getElementById('9router-model').value = ' oc/exact-model ';
    document.getElementById('load-9router-models-btn').click();
  })()`);
  async function waitFor(expression) {
    for (let i=0;i<100;i++) {if (await evaluate(expression)) return; await new Promise(r=>setTimeout(r,50));}
    throw new Error('Browser condition timed out: '+expression);
  }
  await waitFor("document.getElementById('9router-models').children.length === 2");
  await evaluate(`(() => {
    const model = document.getElementById('9router-model');
    model.value = 'oc/'; model.dispatchEvent(new Event('input'));
  })()`);
  assert.equal(await evaluate("document.getElementById('9router-models').children.length"), 2, 'Typing must retain discovered model suggestions');
  await evaluate(`(() => {
    const model = document.getElementById('9router-model');
    model.value = 'oc/exact-model'; model.dispatchEvent(new Event('input'));
  })()`);
  await evaluate("document.getElementById('test-9router-btn').click()");
  await waitFor("document.getElementById('9router-status-text').textContent.includes('returned a completion')");
  assert.equal(await evaluate("(async()=> (await chrome.storage.local.get('linguaplay_9router_key')).linguaplay_9router_key)()"), undefined, 'Test must not save');
  await evaluate("document.getElementById('save-settings-btn').click()");
  await waitFor("document.getElementById('save-toast').classList.contains('show')");
  assert.equal(await evaluate("(async()=> (await chrome.storage.local.get('linguaplay_9router_model')).linguaplay_9router_model)()"), 'oc/exact-model');
  await evaluate('location.reload()');
  await waitFor("document.getElementById('9router-model')?.value === 'oc/exact-model'");
  const answer = await evaluate('chrome.runtime.sendMessage({action:"CALL_9ROUTER",isJson:true,messages:[{role:"user",content:"Explain 猫"}]})');
  assert.equal(answer.success, true, JSON.stringify(answer));
  const standalone = await evaluate(`(async () => {
    const ai = await import(chrome.runtime.getURL('js/ai.js'));
    ai.setAIProvider('9router');
    return await new Promise(resolve => ai.requestAIAnalysis({word:'猫',sentence:'猫がいる',onSuccess: data => resolve({success:true,data}),onError: error => resolve({success:false,error})}));
  })()`);
  assert.equal(standalone.success, true, JSON.stringify(standalone));
  assert.equal(standalone.data.contextual_meaning, 'cat');
  const suppressed = await evaluate(`(async () => {
    const ai = await import(chrome.runtime.getURL('js/ai.js'));
    let callbacks = 0;
    const pending = ai.requestAIAnalysis({word:'猫',onSuccess:()=>callbacks++,onError:()=>callbacks++});
    ai.setAIProvider('antigravity');
    await pending;
    return callbacks;
  })()`);
  assert.equal(suppressed, 0, 'Changing provider suppresses an outstanding worker result');
  console.log('Browser: base scenarios passed');
  // Exercise real Options event handlers while transport and permission are deferred.
  hold = true;
  await evaluate("document.getElementById('test-9router-btn').click()");
  for (let i=0; i<100 && !held.length; i++) await new Promise(r=>setTimeout(r,20));
  assert.equal(held.length,1);
  await evaluate("document.getElementById('9router-key').value='changed'; document.getElementById('9router-key').dispatchEvent(new Event('input'))");
  held.shift().end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'OK'}}]}));
  hold = false;
  await evaluate("document.getElementById('load-9router-models-btn').click()");
  await waitFor("document.getElementById('9router-status-text').textContent.includes('models loaded')");
  assert.doesNotMatch(await evaluate("document.getElementById('9router-status-text').textContent"), /returned a completion/);
  const beforePermission = requests.length;
  await evaluate(`(() => {
    window.originalContains = chrome.permissions.contains;
    chrome.permissions.contains = () => new Promise(resolve => window.resolvePermission = resolve);
    document.getElementById('test-9router-btn').click();
    document.getElementById('9router-url').value = 'http://localhost:${port}/v1';
    document.getElementById('9router-url').dispatchEvent(new Event('input'));
    window.resolvePermission(true);
  })()`);
  await evaluate('chrome.permissions.contains = window.originalContains');
  assert.equal(requests.length,beforePermission);

  console.log('Browser: Options races passed');
  // Load the actual player app, block external dictionary/translation calls,
  // and replace only the companion status probe so no existing service is touched.
  await rpc('Network.enable', {}, sessionId);
  await rpc('Network.setBlockedURLs', {urls:['https://*']}, sessionId);
  await rpc('Page.addScriptToEvaluateOnNewDocument', {source:`
    const originalFetch = window.fetch;
    window.fetch = (url, ...args) => String(url).startsWith('http:')
      ? Promise.resolve(new Response(JSON.stringify({antigravity_available:false})))
      : originalFetch(url, ...args);
  `}, sessionId);
  await evaluate(`location.href = '${extensionOrigin}/player.html'`);
  await waitFor("document.readyState === 'complete' && !!document.getElementById('ai-provider-select')");
  await evaluate(`(async()=>{await import(chrome.runtime.getURL('js/app.js'));})()`);
  await waitFor("document.getElementById('ai-provider-select').value === 'antigravity'");
  await evaluate(`(() => {
    const select=document.getElementById('ai-provider-select');
    select.value='9router';select.dispatchEvent(new Event('change'));
    const token=document.createElement('span');token.className='token-group';
    Object.assign(token.dataset,{word:'猫',romaji:'neko',reading:'ねこ',baseform:'猫'});
    document.getElementById('tokens-container').append(token);token.click();
  })()`);
  console.log('Browser: player selected word');
  hold = true;
  await evaluate("document.getElementById('ask-ai-btn').click()");
  await waitFor("!document.getElementById('ai-loading-skeleton').classList.contains('hidden')");
  await evaluate("const select=document.getElementById('ai-provider-select');select.value='gemini';select.dispatchEvent(new Event('change'))");
  await waitFor("document.getElementById('ai-loading-skeleton').classList.contains('hidden') && !document.getElementById('ai-trigger-section').classList.contains('hidden')");
  await evaluate("chrome.storage.local.set({linguaplay_ai_provider:'9router'})");
  await waitFor("document.getElementById('ai-provider-select').value === '9router'");
  await evaluate("document.getElementById('ask-ai-btn').click()");
  await waitFor("!document.getElementById('ai-loading-skeleton').classList.contains('hidden')");
  await evaluate("chrome.storage.local.set({linguaplay_9router_model:'new-combo'})");
  await waitFor("document.getElementById('ai-loading-skeleton').classList.contains('hidden') && !document.getElementById('ai-trigger-section').classList.contains('hidden')");
  for (const response of held.splice(0)) response.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{\"meaning\":\"obsolete\"}'}}]}));
  hold = false;
  await evaluate("document.getElementById('ask-ai-btn').click()");
  await waitFor("document.getElementById('ai-cards-container').children.length > 0");
  const cardsBefore = await evaluate("document.getElementById('ai-cards-container').innerHTML");
  await evaluate("chrome.storage.local.set({linguaplay_9router_model:'new-combo', unrelated_browser_setting:true})");
  assert.equal(await evaluate("document.getElementById('ai-cards-container').innerHTML"), cardsBefore);
  const missingModel = await evaluate(`(async () => {
    await chrome.storage.local.set({linguaplay_9router_model:''});
    return chrome.runtime.sendMessage({action:'CALL_9ROUTER', messages:[{role:'user',content:'Hi'}]});
  })()`);
  assert.equal(missingModel.success, false); assert.match(missingModel.error, /model or combo/);
  assert.ok(requests.length >= 7);
  for (const request of requests) {
    assert.ok(['Bearer fake-browser-token','Bearer changed'].includes(request.authorization));
    assert.notEqual(request.origin, 'https://www.youtube.com');
    assert.ok(!request.body.includes('fake-browser-token'));
    if (request.method === 'POST') {
      const body = JSON.parse(request.body);
      assert.ok(['oc/exact-model','new-combo'].includes(body.model)); assert.equal(body.stream, false);
    }
  }
  console.log(JSON.stringify({extensionLoaded:true, modelDiscovery:true, unsavedTest:true, saveReload:true, worker:true, standaloneModule:true, playerUI:true, optionsRaces:true, savedSettingsInvalidation:true, staleResponseSuppressed:true, missingModel:true, requests:requests.length}));
} finally {
  ws?.close();
  browser.kill('SIGTERM');
  await new Promise(resolve => { if (browser.exitCode !== null || !browser.pid) resolve(); else browser.once('exit', resolve); });
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
