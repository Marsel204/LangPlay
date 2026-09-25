const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Check manifest.json permissions
const manifestPath = fs.existsSync(path.join(__dirname, '..', 'extension', 'manifest.json'))
  ? path.join(__dirname, '..', 'extension', 'manifest.json')
  : path.join(__dirname, '..', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Test A: Manifest MUST declare contextMenus permission
assert.ok(
  manifest.permissions.includes('contextMenus'),
  'FAIL: manifest.json is missing "contextMenus" in permissions array!'
);

// 2. Evaluate background.js in an environment where contextMenus might be uninitialized
const bgPath = fs.existsSync(path.join(__dirname, '..', 'extension', 'background.js'))
  ? path.join(__dirname, '..', 'extension', 'background.js')
  : path.join(__dirname, '..', 'background.js');
const bgCode = fs.readFileSync(bgPath, 'utf8');

const mockChrome = {
  runtime: {
    onInstalled: { addListener: () => {} },
    onMessage: { addListener: (cb) => { mockChrome._onMessage = cb; } },
    getURL: (p) => `chrome-extension://mock/${p}`
  },
  tabs: {
    create: () => {}
  }
};

try {
  const evalFn = new Function('chrome', bgCode);
  evalFn(mockChrome);
  assert.ok(mockChrome._onMessage, 'FAIL: onMessage listener was never registered because background.js crashed before line 26!');
  console.log('PASS: background.js evaluated cleanly without crashing!');
} catch (err) {
  assert.fail(`FAIL: background.js threw uncaught exception: ${err.message}`);
}
