import test from 'node:test';
import assert from 'node:assert/strict';
import { createCards } from '../src/cards.js';
import { createStorage } from '../src/storage.js';
test('Local cards persist frozen context, deduplicate, and export safe TSV', () => {
  const values = new Map(), storage = createStorage({ get: k => values.get(k), set: (k,v) => values.set(k,v) });
  const cards = createCards(storage);
  const card = { surface: '日本語', reading: 'ニホンゴ', meaning: '=formula\tdefinition', sentence: '日本語\nの文', title: 'Title', episode: '1', videoTimeMs: 1500 };
  const first = cards.save(card); cards.save(card);
  assert.equal(cards.list().length, 1); assert.equal(first.id, cards.list()[0].id);
  card.sentence = 'changed';
  const restarted = createCards(storage); assert.equal(restarted.list()[0].sentence, '日本語\nの文');
  assert.equal(restarted.tsv().split('\n').length, 2);
  assert.match(restarted.tsv(), /'=formula definition/);
  assert.equal(restarted.list()[0].videoTimeMs, 1500);
});
test('Corrupt storage recovers without erasing valid user data', () => {
  let writes = 0;
  const storage = createStorage({ get: () => '{bad', set() { writes++; } });
  assert.deepEqual(storage.read('cards', []), []); assert.equal(writes, 0);
});
