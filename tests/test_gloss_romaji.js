const assert = require('assert');
const fs = require('fs');
const path = require('path');

const contentPath = fs.existsSync(path.join(__dirname, '..', 'extension', 'content.js'))
  ? path.join(__dirname, '..', 'extension', 'content.js')
  : path.join(__dirname, '..', 'content.js');
const contentJs = fs.readFileSync(contentPath, 'utf8');

const mockAiJson = {
  data: {
    target_word: { word: '綺麗', reading: 'きれい', romaji: 'kirei', jlpt_level: 'N5', pos: 'Na-adjective' },
    contextual_meaning: 'beautiful, lovely',
    sentence_fit: {
      phrase_connection: '世界はとても綺麗だったな -> 綺麗 takes とても as an adverb',
      role_in_sentence: 'Predicate adjective describing the subject 世界',
      context_nuance: 'Expresses an emotionally colored past impression'
    },
    conjugation: {
      is_conjugated: true,
      form: 'past tense (だった)',
      from_base: '綺麗',
      explanation: 'The na-adjective is followed by past copula'
    },
    sentence_translation: {
      jp: '世界はとても綺麗だったな',
      en: "The world was so beautiful, wasn't it?"
    },
    word_by_word: [
      { word: '世界', reading: 'せかい', romaji: 'sekai', meaning: 'world' },
      { word: 'は', reading: 'は', romaji: 'wa', meaning: 'topic marker' },
      { word: 'とても', reading: 'とても', romaji: 'totemo', meaning: 'very, extremely' },
      { word: '綺麗', reading: 'きれい', romaji: 'kirei', meaning: 'beautiful, pretty', is_target: true },
      { word: 'だった', reading: 'だった', romaji: 'datta', meaning: 'was (past copula)' },
      { word: 'な', reading: 'な', romaji: 'na', meaning: 'sentence-final particle' }
    ]
  }
};

const fnMatch = contentJs.match(/function renderPedagogicalBreakdown\(aiJson, providerTitle\) \{([\s\S]*?)\n  \}/);
assert.ok(fnMatch, 'renderPedagogicalBreakdown function found in content.js');

const fnBody = fnMatch[1];
const mockWanakana = {
  toRomaji: (str) => {
    const dict = { 'せかい': 'sekai', 'は': 'ha', 'とても': 'totemo', 'きれい': 'kirei', 'だった': 'datta', 'な': 'na' };
    return dict[str] || str;
  }
};

const renderFn = new Function('aiJson', 'providerTitle', 'window', `
  const wanakana = window.wanakana;
  ${fnBody}
`);

const renderedHtml = renderFn(mockAiJson, '⚡ DEEPSEEK SENSEI BREAKDOWN', { wanakana: mockWanakana });

// Requirement 1: Text Breakdown card elements (Image 1) MUST be deleted
assert.strictEqual(
  renderedHtml.includes('Sentence Connection Flow'),
  false,
  'FAIL: "Sentence Connection Flow" from Image 1 is still present in breakdown HTML!'
);
assert.strictEqual(
  renderedHtml.includes('Role in This Sentence'),
  false,
  'FAIL: "Role in This Sentence" from Image 1 is still present in breakdown HTML!'
);
assert.strictEqual(
  renderedHtml.includes('Full Sentence Translation'),
  false,
  'FAIL: "Full Sentence Translation" from Image 1 is still present in breakdown HTML!'
);

// Requirement 2: Horizontal Word-by-Word Gloss MUST display Romaji (Image 2)
assert.ok(
  renderedHtml.includes('sekai'),
  'FAIL: "sekai" romaji not rendered in horizontal gloss card!'
);
assert.ok(
  renderedHtml.includes('kirei'),
  'FAIL: "kirei" romaji not rendered in horizontal gloss card!'
);

// Kana reading on the card should be replaced by Romaji
assert.strictEqual(
  renderedHtml.includes('<span class="linguaplay-gloss-reading">せかい</span>'),
  false,
  'FAIL: Kana reading "せかい" should be replaced by romaji "sekai" on the gloss card!'
);

console.log('PASS: renderPedagogicalBreakdown adheres to user requirements!');
