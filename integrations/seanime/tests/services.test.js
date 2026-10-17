import test from 'node:test';
import assert from 'node:assert/strict';
import { createServices } from '../src/services.js';
import { validateMessage } from '../src/bridge.js';

test('Saved subtitle requests use the local companion and surface recovery messages', async () => {
  const calls = [];
  const services = createServices({ fetch: async (url, options) => {
    calls.push([url, JSON.parse(options.body)]);
    return { ok: true, json: () => ({ status: 'success', files: [{ name: '日本語.srt' }] }) };
  } });
  assert.equal((await services.savedSubtitles({ action: 'list' })).files[0].name, '日本語.srt');
  assert.deepEqual(calls, [['http://127.0.0.1:8765/api/subtitles', { action: 'list' }]]);
  const unavailable = createServices({ fetch: async () => ({ ok: false, status: 404, json: () => ({ message: 'Refresh the list or choose another file.' }) }) });
  await assert.rejects(() => unavailable.savedSubtitles({ action: 'read', name: 'missing.srt' }), /Refresh the list/);
  for (const name of ['../secret.srt', 'folder\\secret.srt', '/tmp/sub.srt', 'file.json']) {
    assert.throws(() => validateMessage({ v: 1, id: 1, op: 'saved-import', data: { name, encoding: 'auto', offsetMs: 0 } }), /Choose a saved/);
  }
  assert.equal(validateMessage({ v: 1, id: 1, op: 'saved-import', data: { name: '日本語.srt', encoding: 'auto', offsetMs: 0 } }).op, 'saved-import');
});
test('Services reuse the shared lossless parser and offline dictionary without implicit AI', async () => {
  const calls = [];
  const services = createServices({ fetch: async (url, options) => {
    calls.push(url); assert.equal(options.timeout, 8);
    return { ok: true, json: () => ({ status: 'success', tokens: [{ surface: '日本語', start: 0, end: 3, reading: 'ニホンゴ', baseForm: '日本語', pos: '名詞' }] }) };
  } });
  const tokens = await services.parse('日本語');
  assert.equal(tokens[0].furigana, 'にほんご'); assert.equal(tokens[0].romaji, 'nihongo');
  await services.parse('日本語'); assert.equal(calls.length, 1);
  assert.match((await services.lookup({ surface: '日本語' })).meaning, /Japanese/);
  assert.equal((await services.lookup({ surface: '未登録架空語' })).meaning, '');
  assert.equal(calls.some(x => x.includes('/ai/')), false);
});
test('Invalid parser spans and failed AI responses fail honestly', async () => {
  const services = createServices({ fetch: async () => ({ ok: true, json: () => ({ status: 'success', tokens: [{ surface: '<bad>', start: 0, end: 4 }] }) }) });
  await assert.rejects(() => services.parse('日本語'), /unavailable/);
  const unavailable = createServices({ fetch: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(() => unavailable.explain({ surface: '日本語', sentence: '日本語' }), /503/);
});
test('Explicit AI explanation is readable and chat keeps only the captured selection history', async () => {
  const messages = [];
  const services = createServices({ fetch: async (url, options) => {
    messages.push(JSON.parse(options.body));
    return { ok: true, json: () => url.endsWith('/analyze') ? { status: 'success', data: {
      contextual_meaning: 'who', sentence_translation: { en: 'Is nobody here?' }, sentence_fit: { role_in_sentence: 'Interrogative pronoun with mo.' },
    } } : { status: 'success', reply: 'Generated fixture reply' } };
  } });
  const context = { clientId: 'a', playbackId: 'b', generation: 1, surface: '誰', sentence: '誰もいない', question: 'Why mo?' };
  const result = await services.explain(context);
  assert.match(result.explanation, /Is nobody here\?/); assert.equal(result.explanation.includes('role_in_sentence'), false);
  await services.chat(context); await services.chat({ ...context, question: 'And nai?' });
  assert.equal(messages[2].messages.length, 3);
  await services.chat({ ...context, generation: 2 }); assert.equal(messages[3].messages.length, 1);
});
