const assert = require('assert');
const fs = require('fs');
const path = require('path');

const contentPath = fs.existsSync(path.join(__dirname, '..', 'extension', 'content.js'))
  ? path.join(__dirname, '..', 'extension', 'content.js')
  : path.join(__dirname, '..', 'content.js');
const contentJs = fs.readFileSync(contentPath, 'utf8');

// 1. Verify navigation tab buttons exist in template
assert.ok(
  contentJs.includes('id="lp-tab-breakdown-btn"') && contentJs.includes('id="lp-tab-chat-btn"'),
  'FAIL: Drawer must define #lp-tab-breakdown-btn and #lp-tab-chat-btn!'
);

// 2. Verify segmented views exist
assert.ok(
  contentJs.includes('id="lp-view-breakdown"') && contentJs.includes('id="lp-view-chat"'),
  'FAIL: Drawer must partition content into #lp-view-breakdown and #lp-view-chat!'
);

// 3. Verify chat view contains context sentence display
assert.ok(
  contentJs.includes('id="lp-chat-context-sentence"'),
  'FAIL: Chat view must display #lp-chat-context-sentence!'
);

// 4. Verify switchDrawerTab function and event binding
assert.ok(
  contentJs.includes('function switchDrawerTab(tab)'),
  'FAIL: content.js must implement switchDrawerTab function!'
);
assert.ok(
  contentJs.includes('id="lp-goto-chat-btn"'),
  'FAIL: Breakdown card must contain #lp-goto-chat-btn shortcut!'
);

// 5. Verify chat view contains full rich context elements (romaji and translation meaning)
assert.ok(
  contentJs.includes('id="lp-chat-sentence-romaji"'),
  'FAIL: Chat view must display #lp-chat-sentence-romaji for reading!'
);
assert.ok(
  contentJs.includes('id="lp-chat-sentence-en"'),
  'FAIL: Chat view must display #lp-chat-sentence-en for translation meaning!'
);

console.log('PASS: Drawer tab navigation structure verified!');

