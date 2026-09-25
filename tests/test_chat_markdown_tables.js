const assert = require('assert');
const fs = require('fs');
const path = require('path');

const contentPath = fs.existsSync(path.join(__dirname, '..', 'extension', 'content.js'))
  ? path.join(__dirname, '..', 'extension', 'content.js')
  : path.join(__dirname, '..', 'content.js');
const contentJs = fs.readFileSync(contentPath, 'utf8');

// 1. Verify formatSenseiMarkdown or markdown parser is defined in content.js
assert.ok(
  contentJs.includes('formatSenseiMarkdown') || contentJs.includes('parseMarkdownTable'),
  'FAIL: content.js must define a Markdown parser function for chat messages (e.g. formatSenseiMarkdown)!'
);

// 2. Extract and test formatSenseiMarkdown function directly
const fnStart = contentJs.indexOf('function formatSenseiMarkdown(');
assert.ok(fnStart !== -1, 'FAIL: Could not find function formatSenseiMarkdown( in content.js');
const nextFn = contentJs.indexOf('function appendChatMessage(', fnStart);
const fnCode = contentJs.substring(fnStart, nextFn !== -1 ? nextFn : fnStart + 3000).trim();

// Evaluate the function in sandbox
let formatFn;
eval(`${fnCode}; formatFn = formatSenseiMarkdown;`);

const sampleMarkdown = `Here is how giving and receiving verbs work:

| Verb | Meaning | Direction |
|------|---------|-----------|
| あげる (ageru) | to give | I/we → someone else |
| くれる (kureru) | to give | someone else → me/us |
| もらう (morau) | to receive | (from someone's perspective) |

Keep this distinction in mind!`;

const html = formatFn(sampleMarkdown);

// 3. Assert raw markdown table syntax is eliminated
assert.strictEqual(
  html.includes('|------|'),
  false,
  'FAIL: Raw delimiter |------| must not appear in rendered HTML!'
);
assert.strictEqual(
  html.includes('| Verb | Meaning |'),
  false,
  'FAIL: Raw markdown header | Verb | Meaning | must be converted to HTML table!'
);

// 4. Assert valid table structure
assert.ok(html.includes('<table class="lp-chat-table">') || html.includes('class="lp-chat-table"'), 'FAIL: Must generate <table class="lp-chat-table">');
assert.ok(html.includes('<th') && html.includes('>Verb</th>'), 'FAIL: Must generate <th>Verb</th>');
assert.ok(html.includes('<td') && html.includes('あげる (ageru)'), 'FAIL: Must generate <td> with cell text');
assert.ok(html.includes('Here is how giving and receiving verbs work:'), 'FAIL: Surrounding text must be preserved');
assert.ok(html.includes('Keep this distinction in mind!'), 'FAIL: Post-table text must be preserved');

console.log('PASS: Markdown table formatting for Sensei chatbot verified!');
