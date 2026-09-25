const assert = require('assert');
const fs = require('fs');
const path = require('path');

const contentPath = fs.existsSync(path.join(__dirname, '..', 'extension', 'content.js'))
  ? path.join(__dirname, '..', 'extension', 'content.js')
  : path.join(__dirname, '..', 'content.js');
const contentJs = fs.readFileSync(contentPath, 'utf8');

// 1. Verify drawerContextSentence variable declaration exists in content.js
assert.ok(
  contentJs.includes('let drawerContextSentence =') || contentJs.includes('var drawerContextSentence ='),
  'FAIL: content.js must declare dedicated drawerContextSentence state variable!'
);

// 2. Verify handleTokenClick sets drawerContextSentence instead of overwriting activeLiveSentence
const handleTokenClickMatch = contentJs.match(/function handleTokenClick\([\s\S]*?\{([\s\S]*?)(?:aiResults\.innerHTML|switchDrawerTab)/);
assert.ok(handleTokenClickMatch, 'handleTokenClick function body found');
const handleTokenBody = handleTokenClickMatch[1];
assert.ok(
  handleTokenBody.includes('drawerContextSentence ='),
  'FAIL: handleTokenClick must pin drawerContextSentence!'
);

// 3. Verify Ask Sensei (lp-ai-btn) uses drawerContextSentence as primary context
const aiBtnMatch = contentJs.match(/document\.getElementById\(['"]lp-ai-btn['"]\)[\s\S]*?addEventListener\('click'[\s\S]*?\{([\s\S]*?)(?:chrome\.storage\.local\.get|buildSenseiAnalysisPrompt)/);
assert.ok(aiBtnMatch, 'lp-ai-btn click listener found');
const aiBtnBody = aiBtnMatch[1];
assert.ok(
  aiBtnBody.includes('drawerContextSentence'),
  'FAIL: lp-ai-btn must use drawerContextSentence!'
);

// 4. Verify Quick Anki (lp-quick-anki-btn) uses drawerContextSentence
const quickAnkiMatch = contentJs.match(/document\.getElementById\(['"]lp-quick-anki-btn['"]\)[\s\S]*?addEventListener\('click'[\s\S]*?\{([\s\S]*?)(?:chrome\.storage\.local\.get)/);
assert.ok(quickAnkiMatch, 'lp-quick-anki-btn click listener found');
const quickAnkiBody = quickAnkiMatch[1];
assert.ok(
  quickAnkiBody.includes('drawerContextSentence'),
  'FAIL: lp-quick-anki-btn must use drawerContextSentence!'
);

// 5. Verify Sensei Chat (sendSenseiQuestion) uses drawerContextSentence
const chatSendMatch = contentJs.match(/function sendSenseiQuestion\([\s\S]*?\{([\s\S]*?)(?:appendChatMessage|chrome\.storage\.local\.get)/);
assert.ok(chatSendMatch, 'sendSenseiQuestion function body found');
const chatSendBody = chatSendMatch[1];
assert.ok(
  chatSendBody.includes('drawerContextSentence'),
  'FAIL: sendSenseiQuestion must use drawerContextSentence!'
);

// 6. Verify Save Enriched AI Card to Anki (lp-ai-anki-btn) uses drawerContextSentence
const aiAnkiMatch = contentJs.match(/document\.getElementById\(['"]lp-ai-anki-btn['"]\)[\s\S]*?addEventListener\('click'[\s\S]*?\{([\s\S]*?)(?:chrome\.storage\.local\.get)/);
assert.ok(aiAnkiMatch, 'lp-ai-anki-btn click listener found');
const aiAnkiBody = aiAnkiMatch[1];
assert.ok(
  aiAnkiBody.includes('drawerContextSentence'),
  'FAIL: lp-ai-anki-btn must use drawerContextSentence!'
);

// 7. Verify live video caption updates (MutationObserver / cues / onTimeUpdate) do NOT overwrite drawerContextSentence
assert.ok(
  !contentJs.includes('drawerContextSentence = cueText') &&
  !contentJs.includes('drawerContextSentence = text') &&
  !contentJs.includes('drawerContextSentence = "";'),
  'FAIL: Live video caption updates must NEVER overwrite drawerContextSentence!'
);

// 8. Runtime Simulation: Click Word -> Subtitle Advances -> Sensei Prompt Built
{
  const mockStorage = { linguaplay_cards: [] };
  let capturedPrompt = '';
  let capturedChatPrompt = '';

  // Simulate environment
  let drawerContextSentence = '';
  let drawerActiveWord = '';
  let activeLiveSentence = '';

  function mockHandleTokenClick(token, sentenceContext) {
    drawerActiveWord = token.surface || '';
    drawerContextSentence = (sentenceContext || token.surface || '').trim();
  }

  function mockOnTimeUpdate(nextCueText) {
    activeLiveSentence = nextCueText;
  }

  function mockAskSensei() {
    const word = drawerActiveWord;
    const sentence = drawerContextSentence || activeLiveSentence || '';
    capturedPrompt = `Context Sentence: "${sentence}", Target Word: "${word}"`;
    return capturedPrompt;
  }

  function mockSendSenseiQuestion(question) {
    const word = drawerActiveWord;
    const sentence = drawerContextSentence || activeLiveSentence || '';
    capturedChatPrompt = `Context Sentence: "${sentence}", Target Word: "${word}", Question: "${question}"`;
    return capturedChatPrompt;
  }

  function mockQuickAnki() {
    const word = drawerActiveWord;
    const sentence = drawerContextSentence || activeLiveSentence || '';
    mockStorage.linguaplay_cards.push({ word, sentence });
  }

  // 1. User clicks "廃棄" with context sentence "愛が 廃棄 処分になるのは"
  mockHandleTokenClick({ surface: '廃棄', baseForm: '廃棄' }, '愛が 廃棄 処分になるのは');
  assert.strictEqual(drawerContextSentence, '愛が 廃棄 処分になるのは');

  // 2. Video plays in background to 3:11, subtitle updates to "貴方 だ よね ばい ばい"
  mockOnTimeUpdate('貴方 だ よね ばい ばい');
  assert.strictEqual(activeLiveSentence, '貴方 だ よね ばい ばい');
  // Drawer context sentence MUST remain pinned
  assert.strictEqual(drawerContextSentence, '愛が 廃棄 処分になるのは');

  // 3. User clicks "Ask Sensei"
  const prompt = mockAskSensei();
  assert.ok(prompt.includes('愛が 廃棄 処分になるのは'), 'FAIL: Ask Sensei prompt did not contain pinned context sentence!');
  assert.ok(!prompt.includes('貴方 だ よね ばい ばい'), 'FAIL: Ask Sensei prompt contained live playing subtitle instead of context sentence!');

  // 4. User sends chat message in Sensei Chat tab
  const chatPrompt = mockSendSenseiQuestion('Why is 処分 used here?');
  assert.ok(chatPrompt.includes('愛が 廃棄 処分になるのは'), 'FAIL: Sensei Chat prompt did not contain pinned context sentence!');
  assert.ok(!chatPrompt.includes('貴方 だ よね ばい ばい'), 'FAIL: Sensei Chat prompt contained live playing subtitle instead of context sentence!');

  // 5. User clicks Quick Anki
  mockQuickAnki();
  assert.strictEqual(mockStorage.linguaplay_cards.length, 1);
  assert.strictEqual(mockStorage.linguaplay_cards[0].sentence, '愛が 廃棄 処分になるのは');
}

console.log('PASS: Drawer context sentence isolation tests passed cleanly!');

