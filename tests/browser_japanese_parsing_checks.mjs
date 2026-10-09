// Optional real Sudachi -> HTTP -> extension worker -> DOM integration.
// PARSER_SERVER_DIR must point to a backend with requirements-parser.txt installed.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function checkJapaneseParsing({ root, evaluate, backend }) {
  const python = process.env.PARSER_PYTHON || path.join(backend, '.venv/bin/python');
  const backendProcess = spawn(python, ['-u', '-c', 'from http.server import ThreadingHTTPServer; from Server import RequestHandler; s=ThreadingHTTPServer(("127.0.0.1",0),RequestHandler); print("parser-test-port="+str(s.server_port),flush=True); s.serve_forever()'], { cwd: backend, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  backendProcess.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error(`Parser startup timed out: ${stderr}`)), 10000);
      backendProcess.on('error', error => { clearTimeout(timeout); reject(error); });
      backendProcess.on('exit', code => { clearTimeout(timeout); reject(Error(`Parser exited ${code}: ${stderr}`)); });
      backendProcess.stdout.on('data', chunk => {
        stdout += chunk;
        const match = stdout.match(/parser-test-port=(\d+)/);
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
    });
    await evaluate(`(async () => {
      await chrome.storage.local.set({linguaplay_server_url:'http://127.0.0.1:${port}',linguaplay_auto_start_server:false,linguaplay_reading_mode:'furigana'});
      await import(chrome.runtime.getURL('lib/wanakana.min.js'));
      await import(chrome.runtime.getURL('js/japanese-parser.js'));
    })()`);
    const cases = [ ['学校', 'がっこう', '学校'], ['来ない', 'こない', '来る'], ['上手く', 'うまく', '上手い'], ['生ビール', 'なまびーる', '生ビール'], ['食べられなかった', 'たべられなかった', '食べる'] ];
    const actual = await evaluate(`(async () => {
      window.parserClient = LinguaPlayParser.create();
      const cases = ${JSON.stringify(cases)};
      const results = [];
      for (const [text] of cases) {
        const start = performance.now();
        const tokens = await window.parserClient.request(text);
        results.push({tokens,ms:performance.now()-start});
      }
      return results;
    })()`);
    for (let i = 0; i < cases.length; i++) {
      assert.ok(actual[i].tokens, JSON.stringify(actual[i]));
      assert.equal(actual[i].tokens.length, 1);
      assert.equal(actual[i].tokens[0].furigana, cases[i][1]);
      assert.equal(actual[i].tokens[0].baseForm, cases[i][2]);
    }
    const css = await readFile(path.join(root, 'content.css'), 'utf8');
    const content = (await readFile(path.join(root, 'content.js'), 'utf8')).replace(/\}\)\(\);\s*$/, 'window.parsingApi={injectUI,renderSentenceTokens};})();');
    await evaluate(`(() => {
      document.body.innerHTML = '<div id="movie_player" style="position:relative;width:900px;height:510px"><video></video><div class="ytp-right-controls"><button class="ytp-subtitles-button">CC</button></div></div><div id="secondary"><div id="secondary-inner"></div></div>';
      const style = document.createElement('style'); style.textContent = ${JSON.stringify(css)}; document.head.appendChild(style);
      window.fetch = async () => ({ok:true,json:async () => [[['Unchanged sentence translation']]]});
    })()`);
    await evaluate(content);
    await evaluate('window.parsingApi.injectUI(); window.parsingApi.renderSentenceTokens("来ない")');
    async function waitFor(expression) {
      for (let i = 0; i < 50; i++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.fail(`Parser DOM did not update: ${expression}`);
    }
    await waitFor('document.querySelector(".linguaplay-yt-token")?.dataset.baseform === "来る"');
    await evaluate('document.querySelector(".linguaplay-yt-token").click()');
    await waitFor('document.getElementById("lp-active-romaji").textContent === "こない (konai)"');
    assert.equal(await evaluate('document.getElementById("lp-active-pos").textContent'), '(Base: 来る)');
    assert.ok((await evaluate('document.getElementById("lp-sentence-romaji").textContent')).includes('konai'));
    await evaluate('document.getElementById("linguaplay-visibility-toggle").click(); document.getElementById("lp-dismiss-btn").click(); window.parsingApi.renderSentenceTokens("学校")');
    await waitFor('document.querySelector(".linguaplay-token-reading")?.textContent === "がっこう"');
    assert.equal(await evaluate('getComputedStyle(document.getElementById("linguaplay-yt-drawer")).display'), 'none');
    assert.equal(await evaluate('getComputedStyle(document.getElementById("linguaplay-yt-tokens-overlay")).display'), 'none');

    // Test the standalone module's async renderer in the same real browser.
    const standalone = await evaluate(`(async () => {
      const subtitles = await import(chrome.runtime.getURL('js/subtitles.js'));
      const tokenizer = await import(chrome.runtime.getURL('js/tokenizer.js'));
      const container = document.createElement('div'); document.body.appendChild(container);
      await tokenizer.initTokenizer();
      await tokenizer.requestParsedSentence('食べられなかった');
      subtitles.renderTokens('食べられなかった', container);
      const selected = container.querySelector('.token-group');
      const result = {word:selected.dataset.word,reading:selected.dataset.furigana,base:selected.dataset.baseform};
      subtitles.renderTokens('泳ぎました', container);
      subtitles.renderTokens('', container);
      await tokenizer.requestParsedSentence('泳ぎました');
      await new Promise(resolve => setTimeout(resolve,0));
      return {...result, cleared:container.children.length === 0};
    })()`);
    assert.deepEqual(standalone, {word:'食べられなかった',reading:'たべられなかった',base:'食べる',cleared:true});
    const warmTimes = actual.slice(1).map(r => r.ms).sort((a,b) => a-b);
    return {realBackend:true, realWorker:true, cases:cases.length, drawer:true, hidden:true, standalone:true, coldMs:actual[0].ms, warmMedianMs:warmTimes[Math.floor(warmTimes.length/2)]};
  } finally {
    backendProcess.kill('SIGTERM');
    if (backendProcess.pid && backendProcess.exitCode === null && backendProcess.signalCode === null) await new Promise(resolve => backendProcess.once('exit', resolve));
  }
}
