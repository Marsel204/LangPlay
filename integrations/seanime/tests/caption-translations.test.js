import test from 'node:test';
import assert from 'node:assert/strict';

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const cue = (id, text) => ({ id, text });
const first = cue('first', '猫がいる。'), second = cue('second', '犬がいる。');
const state = (activeCues = [first], sourceId = 'ja.srt') => ({
  playback: { clientId: 'client', playbackId: 'episode', videoIdentity: 'video' },
  source: { sourceId, offsetMs: 0 }, activeCues,
});
async function fixture() {
  let createCaptionTranslations;
  try { ({ createCaptionTranslations } = await import('../src/caption-translations.js')); }
  catch (error) { if (error.code === 'ERR_MODULE_NOT_FOUND') assert.fail('Optional caption sentence meanings are not implemented'); throw error; }
  const requests = [], changes = [];
  const manager = createCaptionTranslations({ onChange: () => changes.push(true), services: {
    translate: context => new Promise((resolve, reject) => requests.push({ ...context, resolve, reject })),
  } });
  return { manager, requests, changes,
    async resolve(index, translation = 'A cat is here.') { requests[index].resolve({ translation }); await flush(); },
  };
}

test('sentence meanings make no requests while disabled or without an identified subtitle', async () => {
  const h = await fixture();
  h.manager.update(state(), [second], false); await flush();
  assert.deepEqual(h.manager.view(), {}); assert.equal(h.requests.length, 0);
  h.manager.update({ ...state(), source: null }, [second], true); await flush();
  assert.equal(h.requests.length, 0);
});

test('active sentences lead bounded lookahead, with at most two translations in flight', async () => {
  const h = await fixture(), upcoming = Array.from({ length: 10 }, (_, i) => cue(`future-${i}`, `未来の文${i}`));
  h.manager.update(state(), upcoming, true); await flush();
  assert.equal(h.requests.length, 2); assert.equal(h.requests[0].sentence, first.text);
  h.manager.update(state(), upcoming, true); await flush(); assert.equal(h.requests.length, 2);
  await h.resolve(0); await h.resolve(1); await h.resolve(2); await h.resolve(3);
  assert.equal(h.requests.length, 4, 'only three nearby lines are prepared beyond current dialogue');
  assert.equal(h.manager.view().first.translation, 'A cat is here.');
  assert.equal(Object.keys(h.manager.view()).length, 1, 'upcoming meanings are not shown on the current cue');
});

test('each meaning stays with its Japanese cue, including duplicate dialogue and cached revisits', async () => {
  const h = await fixture(), duplicate = cue('duplicate', first.text);
  h.manager.update(state([first, duplicate]), [second], true); await flush();
  assert.deepEqual(h.requests.map(request => request.sentence), [first.text, second.text]);
  await h.resolve(0, 'There is a cat.'); await h.resolve(1, 'There is a dog.');
  assert.equal(h.manager.view().duplicate.translation, 'There is a cat.');
  h.manager.update(state([second]), [], true);
  assert.deepEqual(Object.keys(h.manager.view()), ['second']);
  assert.equal(h.manager.view().second.translation, 'There is a dog.');
  h.manager.update(state(), [], true); await flush(); assert.equal(h.requests.length, 2);
});

test('a seek hides the previous sentence while its translation is still pending', async () => {
  const h = await fixture(); h.manager.update(state(), [], true); await flush();
  h.manager.update(state([second]), [], true); await flush();
  assert.equal(h.requests[0].isCurrent(), false);
  await h.resolve(0, 'Old cat sentence.');
  assert.equal(h.manager.view().first, undefined);
  assert.equal(h.manager.view().second.translation, '');
  await h.resolve(1, 'Current dog sentence.');
  assert.equal(h.manager.view().second.translation, 'Current dog sentence.');
});

test('episode, source, delay, and opt-out invalidate pending caption meanings', async () => {
  for (const change of ['episode', 'source', 'delay', 'disabled']) {
    const h = await fixture(); h.manager.update(state(), [], true); await flush();
    const next = state([second]);
    if (change === 'episode') next.playback.playbackId = 'other';
    if (change === 'source') next.source.sourceId = 'other.srt';
    if (change === 'delay') next.source.offsetMs = 500;
    h.manager.update(next, [], change !== 'disabled'); await flush();
    assert.equal(h.requests[0].isCurrent(), false, change);
    await h.resolve(0, 'Obsolete.');
    assert.equal(h.manager.view().first, undefined, change);
    if (change === 'disabled') assert.deepEqual(h.manager.view(), {});
  }
});

test('translation failure leaves Japanese usable, avoids retry loops, and supports deliberate retry', async () => {
  const h = await fixture(); h.manager.update(state(), [], true); await flush();
  h.requests[0].reject(new Error('Companion offline')); await flush();
  assert.equal(h.manager.view().first.state, 'error');
  for (let i = 0; i < 5; i++) h.manager.update(state(), [], true);
  await flush(); assert.equal(h.requests.length, 1);
  h.manager.retry(); await flush(); assert.equal(h.requests.length, 2);
  await h.resolve(1, 'Recovered meaning.');
  assert.equal(h.manager.view().first.translation, 'Recovered meaning.');
});
