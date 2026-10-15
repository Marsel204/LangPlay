import { build } from 'esbuild';
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const exists = file => access(file).then(() => true, () => false);

// All helpers, constants and imports belong INSIDE the serialized UI callback.
// Seanime executes that callback in a fresh runtime without init's closures.
async function hostPayload(entry, define = {}) {
  const result = await build({
    absWorkingDir: path.dirname(entry), entryPoints: [path.basename(entry)],
    bundle: true, write: false, format: 'iife',
    globalName: 'LangPlay', platform: 'neutral', target: 'es2017',
    charset: 'utf8', legalComments: 'inline', minify: false, define,
  });
  return `function init() {\n  $ui.register(function(ctx) {\n${result.outputFiles[0].text}\nLangPlay.start(ctx);\n  });\n}\n`;
}

async function selfTest() {
  const temp = await mkdtemp(path.join(tmpdir(), 'langplay-build-'));
  try {
    await writeFile(path.join(temp, 'helper.js'), 'export const twice = x => x * 2;');
    const entry = path.join(temp, 'probe.js');
    await writeFile(entry, 'import {twice} from "./helper.js"; export function start(ctx) { ctx.result(twice(21)); }');
    const payload = await hostPayload(entry);
    assert.equal(payload, await hostPayload(entry), 'Output must be deterministic');
    let callback;
    vm.runInNewContext(`${payload}\ninit();`, { $ui: { register(fn) { callback = fn.toString(); } } });
    let result;
    vm.runInNewContext(`(${callback})(ctx)`, { ctx: { result(value) { result = value; } } });
    assert.equal(result, 42, 'Imported helpers survive callback serialization into an isolated runtime');
    assert.equal(callback.includes(temp), false, 'No absolute build paths in callback');
    console.log('PASS: deterministic bundle and isolated callback smoke');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

async function test() {
  await selfTest();
  const dir = path.join(root, 'tests');
  const files = await exists(dir) ? (await readdir(dir)).filter(name => name.endsWith('.test.js')).sort() : [];
  if (files.length === 0) {
    console.log('No core test files yet; build smoke is the only check.');
    return;
  }
  const child = spawnSync(process.execPath, ['--test', ...files.map(name => path.join(dir, name))], {
    cwd: root, stdio: 'inherit',
  });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exitCode = child.status || 1;
}

async function bundle() {
  await selfTest();
  const entry = path.join(root, 'src/plugin.js');
  if (!await exists(entry)) {
    console.log('Build infrastructure ready; native probe entry has not been authored yet.');
    return;
  }
  const define = {};
  const browserEntry = path.join(root, 'src/ui.js');
  if (await exists(browserEntry)) {
    const browser = await build({ entryPoints: [browserEntry], bundle: true, write: false,
      format: 'iife', platform: 'browser', target: 'es2020', charset: 'utf8', legalComments: 'inline' });
    const html = await readFile(path.join(root, 'src/ui.html'), 'utf8');
    const css = await readFile(path.join(root, 'src/ui.css'), 'utf8');
    assert.ok(html.includes('<!-- LANGPLAY_ASSETS -->'), 'UI template requires its asset insertion marker');
    define.__LANGPLAY_UI_HTML__ = JSON.stringify(html.replace('<!-- LANGPLAY_ASSETS -->',
      `<style>${css}</style><script>${browser.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`));
  }
  const output = path.join(root, 'dist');
  await mkdir(output, { recursive: true });
  const payload = await hostPayload(entry, define);
  await writeFile(path.join(output, 'plugin.js'), payload);
  const manifestFile = path.join(root, 'plugin.json');
  if (await exists(manifestFile)) {
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    manifest.payload = payload;
    await writeFile(path.join(output, 'langplay-probe.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`Built ${Buffer.byteLength(payload)} byte self-contained host payload in dist/`);
}

if (process.argv.includes('--test')) await test();
else if (process.argv.includes('--self-test')) await selfTest();
else await bundle();
