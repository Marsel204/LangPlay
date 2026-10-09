const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = fs.existsSync(path.join(__dirname, '..', 'extension', 'manifest.json'))
  ? path.join(__dirname, '..', 'extension')
  : path.join(__dirname, '..');
const { create } = require(path.join(root, 'js', 'japanese-parser.js'));
const wanakana = require(path.join(root, 'lib', 'wanakana.min.js'));

const token = (surface, reading = surface, baseForm = surface, pos = '名詞', start = 0) =>
  ({ surface, reading, baseForm, pos, start, end: start + surface.length });
const result = (...tokens) => ({ success: true, tokens });

test('parser uses dictionary readings, verb lemmas, POS-aware particles and long vowels', async () => {
  const client = create({ wanakana, transport: async () => result(
    token('は', 'ハ', 'は', '助詞'), token('生ビール', 'ナマビール', '生ビール', '名詞', 1),
    token('来ない', 'コナイ', '来る', '動詞', 5), token('。', '。', '。', '補助記号', 8)) });
  const parsed = await client.request('は生ビール来ない。');
  assert.deepEqual(parsed.map(t => [t.furigana, t.romaji, t.baseForm]), [
    ['は', 'wa', 'は'], ['なまびーる', 'namabiiru', '生ビール'], ['こない', 'konai', '来る'], ['。', '.', '。'],
  ]);
  assert.equal(client.romaji('は生ビール来ない。'), 'wa namabiiru konai.');
  assert.equal(client.readingToken(token('は', 'ハ')).romaji, 'ha', 'The particle rule must not affect a non-particle');
});

test('identical requests share a promise and cache without further transport calls', async () => {
  let count = 0;
  const client = create({ wanakana, transport: async () => { count++; return result(token('学校', 'ガッコウ')); } });
  const first = client.request('学校');
  assert.equal(client.request('学校'), first);
  const parsed = await first;
  assert.equal(parsed[0].romaji, 'gakkou');
  assert.equal(await client.request('学校'), parsed);
  assert.equal(count, 1);
});

test('invalid offsets, surfaces and morphemes fall back; astral offsets remain valid', async () => {
  for (const bad of [null, result(token('犬')), result({ ...token('猫'), start: 1 }), result({ ...token('猫'), reading: null }),
    result({ ...token('猫'), morphemes: [null] }), result({ ...token('猫'), morphemes: [token('犬')] })]) {
    const client = create({ transport: async () => bad });
    assert.equal(await client.request('猫'), null);
  }
  const client = create({ transport: async () => result(token('😀'), token('猫', 'ネコ', '猫', '名詞', 2)) });
  assert.equal((await client.request('😀猫'))[1].start, 2);
});

test('failed transport is cooled down and recovers when the server becomes ready', async () => {
  let calls = 0;
  const client = create({ now: () => 10, transport: async () => { calls++; if (calls === 1) throw Error('offline'); return result(token('猫')); } });
  assert.equal(await client.request('猫'), null);
  assert.equal(await client.request('猫'), null);
  assert.equal(calls, 1);
  client.retry();
  assert.ok(await client.request('猫'));
});

test('navigation discards old responses without deleting a new in-flight request', async () => {
  const callbacks = [];
  const client = create({ transport: () => new Promise(resolve => callbacks.push(resolve)) });
  const old = client.request('猫');
  await Promise.resolve();
  client.reset();
  const next = client.request('猫');
  await Promise.resolve();
  callbacks[0](result(token('猫', 'wrong')));
  assert.equal(await old, null);
  assert.equal(client.cached('猫'), null);
  assert.equal(client.request('猫'), next);
  callbacks[1](result(token('猫', 'ネコ')));
  assert.equal((await next)[0].reading, 'ネコ');
});

test('cached romaji escapes markup in parser readings', async () => {
  const client = create({ transport: async () => result(token('猫', '<img>')) });
  await client.request('猫');
  assert.equal(client.romaji('猫'), '&lt;img&gt;');
});

function worker(config = {}, permission = true) {
  let listener;
  const calls = [];
  const sandbox = { URL, AbortSignal, console, fetch: async (url, options) => {
    calls.push({ url, options }); return { ok: true, json: async () => ({ status: 'success', tokens: [token('猫', 'ネコ')], engine: 'sudachi' }) };
  }, chrome: {
    storage: { local: { get: async () => config } }, permissions: { contains: async () => permission },
    runtime: { id: 'test', onInstalled: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } }, sendNativeMessage() { assert.fail('Parsing must not launch a process'); } },
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), sandbox);
  return { sandbox, calls, request: (text = '猫', sender = { id: 'test', url: 'https://www.youtube.com/watch?v=test' }) =>
    new Promise(resolve => listener({ action: 'PARSE_JAPANESE', text }, sender, resolve)) };
}

test('worker dispatches to configured server and deduplicates concurrent calls', async () => {
  const h = worker({ linguaplay_server_url: 'http://127.0.0.1:8123' });
  const responses = await Promise.all(Array.from({ length: 5 }, () => h.request()));
  assert.ok(responses.every(r => r.success && r.engine === 'sudachi'));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, 'http://127.0.0.1:8123/api/parse');
  assert.deepEqual(JSON.parse(h.calls[0].options.body), { text: '猫' });
  assert.equal(h.calls[0].options.signal.aborted, false);
});

test('worker rejects untrusted senders, bad input, denied permissions and invalid URLs', async () => {
  const h = worker();
  for (const sender of [{ id: 'other', url: 'https://www.youtube.com/watch' }, { id: 'test', url: 'https://youtube.com.example.com/watch' }]) {
    assert.equal((await h.request('猫', sender)).success, false);
  }
  for (const text of ['', ' ', {}, '猫'.repeat(4097)]) assert.equal((await h.request(text)).success, false);
  assert.equal(h.calls.length, 0);
  for (const url of ['file:///tmp', 'http://user:secret@localhost:8000']) {
    const invalid = worker({ linguaplay_server_url: url });
    assert.equal((await invalid.request()).success, false);
    assert.equal(invalid.calls.length, 0);
  }
  const denied = worker({}, false);
  assert.equal((await denied.request()).success, false);
  assert.equal(denied.calls.length, 0);
});

test('worker reports a missing parser without returning fabricated tokens', async () => {
  const h = worker();
  h.sandbox.fetch = async () => ({ ok: false, status: 503 });
  assert.match((await h.request()).error, /503/);
  h.sandbox.fetch = async () => { throw new Error('timeout'); };
  assert.equal((await h.request()).success, false);
});
