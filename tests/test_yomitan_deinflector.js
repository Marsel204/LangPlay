const assert = require('assert');
const fs = require('fs');
const path = require('path');
const wanakanaPath = fs.existsSync(path.join(__dirname, '..', 'extension', 'lib', 'wanakana.min.js'))
  ? path.join(__dirname, '..', 'extension', 'lib', 'wanakana.min.js')
  : path.join(__dirname, '..', 'lib', 'wanakana.min.js');
const wanakana = require(wanakanaPath);

global.window = { wanakana, addEventListener: () => {}, location: { search: '', href: '' } };
global.document = { addEventListener: () => {}, querySelector: () => null, getElementById: () => null };
global.chrome = { storage: { local: { get: () => {} } } };

const contentPath = fs.existsSync(path.join(__dirname, '..', 'extension', 'content.js'))
  ? path.join(__dirname, '..', 'extension', 'content.js')
  : path.join(__dirname, '..', 'content.js');
const contentJs = fs.readFileSync(contentPath, 'utf8');

// 1. Verify deinflector integration or definition
assert.ok(
  contentJs.includes('YomitanDeinflector') || contentJs.includes('deinflect') || contentJs.includes('DEINFLECT'),
  'FAIL: content.js must integrate Yomitan deinflection engine!'
);

// 2. Evaluate content.js functions in sandbox
const code = contentJs.replace('(function () {', 'global.testCode = function() {').replace(/\}\)\(\);?\s*$/, '}; global.testCode();');
eval(code.replace('function generateSentenceRomaji', 'global.generateSentenceRomaji = function generateSentenceRomaji')
         .replace('function segmentJapaneseSentence', 'global.segmentJapaneseSentence = function segmentJapaneseSentence'));

const generateSentenceRomaji = global.generateSentenceRomaji;
assert.ok(typeof generateSentenceRomaji === 'function', 'generateSentenceRomaji must be callable');

// Test Case 1: Past copula だったな must not produce "da ttana"
const test1 = generateSentenceRomaji('世界はとても綺麗だったな', '世界');
console.log('Test 1 output:', test1);
assert.strictEqual(
  test1.includes('da ttana'),
  false,
  'FAIL: だったな must not be split into "da ttana"!'
);
assert.ok(
  test1.includes('datta na') || test1.includes('dattana'),
  `FAIL: Expected "datta na" or "dattana", got: ${test1}`
);

// Test Case 2: Negative inflection 届かぬ must not produce "todo ka nu"
const test2 = generateSentenceRomaji('僕には届かぬ存在で', '僕');
console.log('Test 2 output:', test2);
assert.strictEqual(
  test2.includes('todo ka nu'),
  false,
  'FAIL: 届かぬ must not be split into "todo ka nu"!'
);
assert.ok(
  test2.includes('todokanu'),
  `FAIL: Expected "todokanu", got: ${test2}`
);

// Test Case 3: Adjective past 美味しかった must not produce "bimi shika tta"
const test3 = generateSentenceRomaji('美味しかった', '');
console.log('Test 3 output:', test3);
assert.strictEqual(
  test3.includes('bimi shika tta') || test3.includes('shika tta'),
  false,
  'FAIL: 美味しかった must not be split into "bimi shika tta"!'
);
assert.ok(
  test3.includes('oishikatta'),
  `FAIL: Expected "oishikatta", got: ${test3}`
);

// Test Case 4: Negative past 行かなかった must not produce "i ka na ka tta"
const test4 = generateSentenceRomaji('行かなかった', '');
console.log('Test 4 output:', test4);
assert.strictEqual(
  test4.includes('i ka na ka tta'),
  false,
  'FAIL: 行かなかった must not be split into "i ka na ka tta"!'
);
assert.ok(
  test4.includes('ikanakatta'),
  `FAIL: Expected "ikanakatta", got: ${test4}`
);

// Test Case 5: Sokuon integrity guarantee (no token starts with naked double consonant)
const rawTokens = test1.replace(/<[^>]+>/g, '').split(' ');
for (const tok of rawTokens) {
  assert.strictEqual(
    /^(tt|kk|pp|ss)[a-z]/.test(tok),
    false,
    `FAIL: Sokuon floating consonant detected in token "${tok}"!`
  );
}

console.log('PASS: All Yomitan deinflector and sentence Romaji tests passed cleanly!');
process.exit(0);
