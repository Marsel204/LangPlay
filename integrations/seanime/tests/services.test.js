import test from 'node:test';
import assert from 'node:assert/strict';
import { createServices } from '../src/services.js';

test('obsolete queued translations do not exhaust admission for the latest selection', async () => {
  const pending = [], calls = [];
  const services = createServices({ fetch: (url, options) => new Promise(resolve => {
    calls.push([url, JSON.parse(options.body)]);
    pending.push(() => resolve({ ok: true, json: () => ({ status: 'success', meaning: 'word', translation: 'Current translation' }) }));
  }) });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const blockers = Array.from({ length: 4 }, (_, i) => services.lookup({ surface: `架空阻塞${i}` }));
  await flush();
  let selection = 0;
  const obsolete = [];
  for (let i = 0; i < 5; i++) {
    selection = i;
    obsolete.push(services.translate({ sentence: `過去の文${i}`, isCurrent: () => selection === i }).catch(() => null));
  }
  selection = 5;
  const latest = services.translate({ sentence: '今の文', isCurrent: () => selection === 5 });
  while (pending.length) { pending.shift()(); await flush(); }
  assert.equal((await latest).translation, 'Current translation');
  await Promise.all([...blockers, ...obsolete]);
  assert.deepEqual(calls.filter(([url]) => url.endsWith('/translate')).map(([, body]) => body.sentence), ['今の文']);
});

test('new sentence translation bypasses stale queued lookups without exceeding four requests', async () => {
  const pending = [], calls = [];
  const services = createServices({ fetch: (url, options) => new Promise(resolve => {
    calls.push([url, JSON.parse(options.body)]);
    pending.push(() => resolve({ ok: true, json: () => ({ status: 'success', meaning: 'word', translation: 'Current.' }) }));
  }) });
  let oldCurrent = true;
  const words = Array.from({ length: 20 }, (_, i) => services.lookup({ surface: `未知架空${i}`, isCurrent: () => oldCurrent }));
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush(); assert.equal(calls.length, 4);
  oldCurrent = false;
  // A newly selected sentence can still need the same queued word.
  const shared = services.lookup({ surface: '未知架空19' });
  const translation = services.translate({ sentence: '今の文' });
  pending.shift()(); await flush();
  assert.ok(calls[4][0].endsWith('/translate'));
  while (pending.length) { pending.shift()(); await flush(); }
  assert.equal((await translation).translation, 'Current.');
  assert.equal((await shared).meaning, 'word');
  await Promise.all(words);
  assert.equal(calls.filter(([url]) => url.endsWith('/dictionary')).length, 5);
});

test('sentence translation and word lookup share the companion concurrency budget', async () => {
  let release, active = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const services = createServices({ fetch: async url => {
    if (active >= 4) return { ok: false, status: 502, json: async () => ({ message: 'Translation is busy. Retry shortly.' }) };
    active++;
    await gate;
    active--;
    return { ok: true, json: async () => ({ status: 'success', ...(url.endsWith('/translate') ? { translation: 'A sentence.' } : { meaning: 'A word.' }) }) };
  } });
  const requests = [services.translate({ sentence: '未登録の文章です。' }),
    ...['未登録甲', '未登録乙', '未登録丙', '未登録丁'].map(surface => services.lookup({ surface }))];
  await new Promise(resolve => setImmediate(resolve));
  release();
  const [translation, ...words] = await Promise.all(requests);
  assert.equal(translation.translation, 'A sentence.');
  assert.deepEqual(words.map(word => word.meaning), Array(4).fill('A word.'));
});
import { validateMessage } from '../src/bridge.js';

test('chat rejects a concurrent turn centrally and preserves accepted conversation order', async () => {
  const requests = [];
  const services = createServices({ fetch: (_url, options) => new Promise(resolve => requests.push({
    body: JSON.parse(options.body), resolve: reply => resolve({ ok: true, json: () => ({ status: 'success', reply }) }),
  })) });
  const context = { clientId: 'a', playbackId: 'p', generation: 1, surface: '猫', sentence: '猫がいる' };
  const first = services.chat({ ...context, question: 'first' });
  const second = services.chat({ ...context, question: 'second' });
  if (requests.length > 1) requests[1].resolve('out-of-order reply');
  await assert.rejects(second, /pending|wait/i);
  assert.equal(requests.length, 1);
  requests[0].resolve('first reply'); await first;
  const third = services.chat({ ...context, question: 'third' });
  assert.deepEqual(requests[1].body.messages.map(message => message.content), ['first', 'first reply', 'third']);
  requests[1].resolve('third reply'); await third;
  const failed = services.chat({ ...context, question: 'failed turn' });
  requests[2].resolve(''); await assert.rejects(failed, /invalid answer/);
  const retry = services.chat({ ...context, question: 'retry' });
  assert.equal(requests[3].body.messages.some(message => message.content === 'failed turn'), false);
  requests[3].resolve('retry reply'); await retry;
});

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

test('Sensei uses the companion provider configuration and surfaces actionable AI errors', async () => {
  const bodies=[];
  const services=createServices({fetch:async(url,options)=>{
    bodies.push(JSON.parse(options.body));
    return {ok:true,json:()=>url.endsWith('/analyze')?{status:'success',data:{contextual_meaning:'cat'}}:{status:'success',reply:'A cat.'}};
  }});
  await services.explain({surface:'猫',sentence:'猫がいる',romaji:'neko'});
  await services.chat({surface:'猫',sentence:'猫がいる',romaji:'neko',question:'Why ga?'});
  assert.equal(bodies[0].provider,undefined,'the browser must not hardcode Antigravity');
  assert.equal(bodies[0].romaji,'neko');
  assert.equal(bodies[1].romaji,'neko');
  const rejected=createServices({fetch:async()=>({ok:false,status:500,json:()=>({status:'error',message:'DeepSeek rejected the API key (HTTP 401).'})})});
  await assert.rejects(()=>rejected.explain({surface:'猫'}),/DeepSeek.*401/);
});

test('automatic subtitle search sends only episode identity through the local companion',async()=>{
 const calls=[];const services=createServices({fetch:async(url,options)=>{calls.push([url,JSON.parse(options.body),options.timeout]);return {ok:true,json:()=>({status:'success',sourceId:'automatic.srt',content:'Japanese'})};}});
 assert.equal(typeof services.discoverSubtitles,'function','automatic discovery must be available without passing a remote URL or credential');
 await services.discoverSubtitles({mediaId:189046,episode:2});
 assert.deepEqual(calls,[['http://127.0.0.1:8765/api/subtitles/auto',{mediaId:189046,episode:2},55]]);
 assert.equal(validateMessage({v:1,id:1,op:'preferences',data:{autoSubtitles:false}}).data.autoSubtitles,false);
 assert.throws(()=>validateMessage({v:1,id:1,op:'preferences',data:{autoSubtitles:'false'}}));
});

test('English uses fast sentence translation without AI and reuses results across selected words',async()=>{
  const calls=[];
  const services=createServices({fetch:async(url,options)=>{
    calls.push([url,JSON.parse(options.body),options.timeout]);
    return {ok:true,json:()=>({status:'success',translation:'A cat is here.'})};
  }});
  const context={surface:'猫',sentence:'猫がいる'};
  const [a,b]=await Promise.all([services.translate(context),services.translate({...context,surface:'いる'})]);
  assert.equal(a.translation,'A cat is here.');assert.deepEqual(a,b);
  await services.translate(context);assert.equal(calls.length,1);
  assert.equal(calls[0][0],'http://127.0.0.1:8765/api/translate');
  assert.deepEqual(calls[0][1],{sentence:'猫がいる'});
  assert.ok(calls[0][2]<=8,'ordinary translation must not wait on the AI timeout');
  assert.equal(calls.some(([url])=>url.includes('/ai/')),false);
});

test('invalid English replies are not cached and allow retry',async()=>{
  let english='';
  const services=createServices({fetch:async()=>({ok:true,json:()=>({status:'success',translation:english})})});
  await assert.rejects(()=>services.translate({sentence:'猫がいる'}),/translation/i);
  english='A cat is here.';
  assert.equal((await services.translate({sentence:'猫がいる'})).translation,english);
});
