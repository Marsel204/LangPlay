const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = fs.existsSync(path.join(__dirname, '..', 'extension', 'manifest.json'))
  ? path.join(__dirname, '..', 'extension')
  : path.join(__dirname, '..');

// Run the production standalone click workflow with controlled async parsing.
function harness() {
  const source = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const start = source.indexOf('function handleTokenClick(tokenEl)');
  const end = source.indexOf('// ── 5.', start);
  const element = () => ({ dataset: {}, textContent: '', innerHTML: '', classList: { add() {}, remove() {} } });
  const sandbox = { JDICT: {'来る':'to come'}, getCurrentSentence: () => '来ない', abortAIAnalysis() {},
    fetchGoogleTranslation: async () => 'fallback definition', requests: [] };
  for (const name of ['activeWord', 'activeRomaji', 'activePos', 'activeDef', 'aiTriggerSection', 'aiResponseContainer', 'aiCardsContainer', 'aiErrorDisplay', 'quickAnkiBtn', 'quickAnkiFeedback', 'placeholderState', 'activeState']) sandbox[name] = element();
  sandbox.parseSelectedWord = () => new Promise(resolve => sandbox.requests.push(resolve));
  vm.runInNewContext(`let currentActiveToken=null; let wordSelectionVersion=0; let currentLastAiData=null; let refreshActiveWordParsing=()=>{};\n${source.slice(start,end)}\nglobalThis.click=handleTokenClick; globalThis.retry=()=>refreshActiveWordParsing();`, sandbox);
  return { sandbox, token: word => ({ ...element(), dataset: {word,romaji:'fallback',baseform:word} }), tick: () => new Promise(resolve => setImmediate(resolve)) };
}

test('late standalone parsing updates the selected reading, lemma and Anki token data', async () => {
  const { sandbox: h, token, tick } = harness();
  const selected = token('来ない');
  h.click(selected);
  h.requests[0]({surface:'来ない',reading:'コナイ',furigana:'こない',romaji:'konai',baseForm:'来る',pos:'動詞',posDetail:'非自立可能'});
  await tick();
  assert.equal(h.activeRomaji.textContent, 'konai');
  assert.ok(h.activePos.textContent.includes('Base: 来る'));
  assert.equal(h.activeDef.textContent, '来る — to come');
  assert.equal(selected.dataset.furigana, 'こない');
  assert.equal(selected.dataset.baseform, '来る');
});

test('an old standalone parse cannot overwrite a newly selected word', async () => {
  const { sandbox: h, token, tick } = harness();
  h.click(token('来ない'));
  h.click(token('学校'));
  h.requests[0]({surface:'来ない',romaji:'konai',baseForm:'来る',pos:'動詞'});
  await tick();
  assert.equal(h.activeWord.textContent, '学校');
  assert.equal(h.activeRomaji.textContent, 'fallback');
});

test('server readiness retries the pinned standalone word without resetting its state', async () => {
  const { sandbox: h, token, tick } = harness();
  const selected = token('来ない');
  h.click(selected);
  h.requests[0](null);
  await tick();
  h.retry();
  h.requests[1]({surface:'来ない',reading:'コナイ',furigana:'こない',romaji:'konai',baseForm:'来る',pos:'動詞'});
  await tick();
  assert.equal(h.activeRomaji.textContent, 'konai');
  assert.equal(selected.dataset.baseform, '来る');
});
