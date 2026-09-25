const assert = require('assert');
const fs = require('fs');
const path = require('path');

const contentPath = fs.existsSync(path.join(__dirname, '..', 'extension', 'content.js'))
  ? path.join(__dirname, '..', 'extension', 'content.js')
  : path.join(__dirname, '..', 'content.js');
const contentJs = fs.readFileSync(contentPath, 'utf8');

// 1. Check that the separate "📚 Dictionary Definition" card is removed from the drawer template
assert.strictEqual(
  contentJs.includes('📚 Dictionary Definition'),
  false,
  'FAIL: Separate "📚 Dictionary Definition" card is still present in drawer HTML template!'
);

// 2. Check that #lp-active-def is located within .linguaplay-drawer-header next to #lp-active-word
const headerMatch = contentJs.match(/class="linguaplay-drawer-header"[\s\S]*?id="lp-dismiss-btn"[\s\S]*?<\/div>\s*<\/div>/);
assert.ok(headerMatch, 'Drawer header structure found');
const headerSnippet = headerMatch[0];

assert.ok(
  headerSnippet.includes('id="lp-active-word"') && headerSnippet.includes('id="lp-active-def"'),
  'FAIL: #lp-active-def must be located inside .linguaplay-drawer-header alongside #lp-active-word!'
);

console.log('PASS: Header definition placement verified!');
