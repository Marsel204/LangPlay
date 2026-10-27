const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const tick = () => new Promise(resolve => setImmediate(resolve));
const element = () => ({ dataset: {}, value: '', textContent: '', innerHTML: '', handlers: {},
  classList: { add() {}, remove() {} }, addEventListener(event, callback) { this.handlers[event] = callback; } });

function subtitles(directory) {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../${directory}/js/subtitles.js`), 'utf8')
    .replace(/^import .*;$/m, '').replace(/export /g, '')
    + '\nglobalThis.api = {setTimeline, getTimeline, isManualCaptionsLoaded};', sandbox);
  return sandbox.api;
}

for (const directory of ['extension', 'static']) {
const source = fs.readFileSync(path.join(__dirname, `../${directory}/js/app.js`), 'utf8');

test(`${directory}: a new automatic timeline releases the previous manual subtitle ownership`, () => {
  const s = subtitles(directory);
  s.setTimeline([{ text: 'manual' }], true);
  s.setTimeline([], false);
  assert.equal(s.isManualCaptionsLoaded(), false);
});

test(`${directory}: late captions from an older video cannot replace the current timeline or status`, async () => {
  const s = subtitles(directory), requests = new Map();
  const sandbox = { ...s, clearYoutubeFeedback() {}, extractYouTubeId: value => value, showYouTubeUI() {},
    clearWordSelection() {}, renderTokens() {}, tokensContainer: {}, subLabel: element(), captionsYtdlpCmd: element(),
    loadYouTubeVideo: async () => {}, fetchServerCaptions: id => new Promise(resolve => requests.set(id, resolve)),
    showToast() {}, showYoutubeFeedback() {},
  };
  vm.runInNewContext('let currentYouTubeId = null, playbackVersion = 0;\n'
    + source.slice(source.indexOf('async function loadYouTube(input)'), source.indexOf('async function executeYouTubeSearch'))
    + '\nglobalThis.load = loadYouTube;', sandbox);
  const old = sandbox.load('old'); await tick();
  const current = sandbox.load('current'); await tick();
  requests.get('current')([{ text: 'Current video' }]); await current;
  requests.get('old')([{ text: 'Old video' }]); await old;
  assert.equal(s.getTimeline()[0].text, 'Current video');
});

test(`${directory}: Explain, Quick Add and AI card saving use the captured sentence after playback advances`, async () => {
  let sentence = '猫がいる';
  const cards = [], analyses = [], sandbox = { console, Object,
    getCurrentSentence: () => sentence, JDICT: { '猫': 'cat' }, abortAIAnalysis() {},
    parseSelectedWord: async () => null, fetchGoogleTranslation: async () => '',
    getAIProvider: () => 'antigravity', showToast() {}, renderAICards() {},
    requestAIAnalysis: context => { analyses.push(context); context.onSuccess({ meaning: 'cat' }); },
    addQuickCard: async card => { cards.push(card); return {}; }, addAICard: async card => { cards.push(card); return {}; },
  };
  for (const name of ['activeWord','activeRomaji','activePos','activeDef','aiTriggerSection','aiResponseContainer',
    'aiCardsContainer','aiErrorDisplay','quickAnkiBtn','quickAnkiFeedback','placeholderState','activeState',
    'askAiBtn','aiLoadingSkeleton','aiStreamPreview','aiApiKeyInput','aiSaveAnkiBtn']) sandbox[name] = element();
  const click = source.slice(source.indexOf('function handleTokenClick(tokenEl)'), source.indexOf('export async function initApp'));
  const actions = source.slice(source.indexOf("  askAiBtn.addEventListener('click'"), source.indexOf("  dismissBtn.addEventListener('click'"));
  vm.runInNewContext('let currentActiveToken = null, currentSelection = null, wordSelectionVersion = 0, currentLastAiData = null; let refreshActiveWordParsing = () => {};\n'
    + click + '\n' + actions + '\nglobalThis.click = handleTokenClick;', sandbox);
  const token = element(); token.dataset = { word: '猫', romaji: 'neko' };
  sandbox.click(token); sentence = '犬がいる';
  sandbox.askAiBtn.handlers.click();
  await sandbox.quickAnkiBtn.handlers.click();
  await sandbox.aiSaveAnkiBtn.handlers.click();
  assert.equal(analyses[0].sentence, '猫がいる');
  assert.deepEqual(cards.map(card => card.sentence), ['猫がいる', '猫がいる']);
});

}
