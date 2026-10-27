const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(directory) {
  const requests = [];
  const sandbox = { AbortController, TextDecoder, console, window: { location: { origin: 'http://127.0.0.1:18765' } },
    chrome: { storage: { local: { get: async () => ({}) } } },
    fetch: (_url, options) => new Promise((resolve, reject) => requests.push({ ...options, resolve, reject })),
  };
  const source = fs.readFileSync(path.join(__dirname, `../${directory}/js/ai.js`), 'utf8')
    .replace(/^import .*;$/m, '').replace(/export /g, '');
  vm.runInNewContext(source + '\nglobalThis.api = {requestAIAnalysis, abortAIAnalysis};', sandbox);
  return { ...sandbox.api, requests };
}
function success(provider, directory) {
  const data = { contextual_meaning: 'fixture' };
  let done = false;
  return { ok: true, json: async () => directory === 'extension' && provider === 'gemini'
    ? { candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }] }
    : { status: 'success', data },
    body: { getReader: () => ({ read: async () => done ? { done: true } : (done = true, {
      done: false, value: new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(data) } }] })}\n\n`),
    }) }) },
  };
}
for (const directory of ['extension', 'static']) {
for (const provider of ['antigravity', 'gemini', 'openrouter']) {
  test(`${directory}/${provider}: old cleanup cannot remove a newer request's abort handle`, async () => {
    const h = harness(directory), options = { provider, word: '猫', apiKey: 'fixture', onSuccess() {}, onError() {} };
    const old = h.requestAIAnalysis(options); await tick();
    const newer = h.requestAIAnalysis(options); await tick();
    h.requests[0].reject(Object.assign(Error('cancelled'), { name: 'AbortError' }));
    await old;
    h.abortAIAnalysis();
    const aborted = h.requests[1].signal.aborted;
    h.requests[1].resolve(success(provider, directory)); await newer;
    assert.equal(aborted, true);
  });
  test(`${directory}/${provider}: responses delivered after cancellation cannot update a newer selection`, async () => {
    const h = harness(directory), delivered = [];
    const options = { provider, word: '猫', apiKey: 'fixture', onError() {} };
    const old = h.requestAIAnalysis({ ...options, onSuccess: () => delivered.push('old') }); await tick();
    const newer = h.requestAIAnalysis({ ...options, onSuccess: () => delivered.push('new') }); await tick();
    h.requests[0].resolve(success(provider, directory)); await old;
    h.requests[1].resolve(success(provider, directory)); await newer;
    assert.deepEqual(delivered, ['new']);
  });
}

}
