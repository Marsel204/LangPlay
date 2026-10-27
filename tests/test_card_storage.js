const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  let listener, cards = [], fail = false;
  const chrome = {
    storage: { local: {
      get: async () => ({ linguaplay_cards: JSON.parse(JSON.stringify(cards)) }),
      set: async value => { await tick(); if (fail) throw Error('Storage quota exceeded'); cards = value.linguaplay_cards; },
    } },
    runtime: { id: 'fixture', onInstalled: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } } },
  };
  const sender = { id: 'fixture', url: 'chrome-extension://fixture/player.html' };
  chrome.runtime.sendMessage = data => new Promise(resolve => listener(data, sender, resolve));
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8'), { chrome, URL, console });
  const client = () => {
    const sandbox = { chrome, console };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension/js/anki.js'), 'utf8').replace(/export /g, '')
      + '\nglobalThis.save = saveToExtensionStorage;', sandbox);
    return sandbox.save;
  };
  return { client, chrome, sender, cards: () => cards, fail(value) { fail = value; } };
}

test('concurrent card saves from separate extension pages preserve both cards', async () => {
  const h = fixture();
  const counts = await Promise.all([h.client()({ word: '猫', sentence: '猫がいる' }), h.client()({ word: '犬', sentence: '犬がいる' })]);
  assert.deepEqual(counts, [1, 2]);
  assert.deepEqual(Array.from(h.cards(), card => card.word), ['猫', '犬']);
});

test('storage failures reach callers and do not poison subsequent card saves', async () => {
  const h = fixture(), save = h.client();
  h.fail(true);
  await assert.rejects(save({ word: '猫', sentence: '猫がいる' }), /quota/i);
  h.fail(false);
  assert.equal(await save({ word: '犬', sentence: '犬がいる' }), 1);
});
