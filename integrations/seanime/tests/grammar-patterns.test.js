import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { LEVELS, PATTERNS, detectGrammarPatterns } from '../src/grammar-patterns.js';
import { createLearningController } from '../src/learning-controller.js';

const ids = sentence => detectGrammarPatterns(sentence).map(m => m.id);
const levels = sentence => detectGrammarPatterns(sentence).map(m => m.level);

test('grammar module stays ES2017-compatible and covers JLPT N5 through N1', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/grammar-patterns.js', import.meta.url)), 'utf8');
  assert.equal(source.includes('(?<'), false, 'ES2017/Goja target must not contain regex lookbehinds');
  assert.deepEqual(LEVELS, ['N5', 'N4', 'N3', 'N2', 'N1']);
  for (const level of LEVELS) {
    const entries = PATTERNS.filter(p => p.level === level);
    assert.ok(entries.length >= 25, `${level} should have rich coverage (got ${entries.length})`);
    for (const entry of entries) {
      assert.ok(entry.id && entry.pattern && entry.reading && entry.meaning && entry.structure && entry.note, entry.id);
    }
  }
  assert.equal(new Set(PATTERNS.map(p => p.id)).size, PATTERNS.length, 'Pattern IDs must be unique');
});

test('detects split 〜しか〜ない patterns and avoids lexical false positives', () => {
  for (const [sentence, expectedSnippet] of [
    ['日本語しか分からない', 'しか分からない'],
    ['日本語しかずっと勉強していない', 'しか … 勉強していない'],
    ['ここでしかまずは手に入らない', 'しか … 入らない'],
    ['太郎しか死ぬ場面はない', 'しか … ない'],
    ['彼にしかできず、困った', 'しかできず'],
    ['彼にしかできぬ仕事だ', 'しかできぬ'],
    ['日本語しかできない', 'しかできない'],
    ['私しかもらえない', 'しかもらえない'],
    ['私しかもっていない', 'しかもっていない'],
    ['彼しかこの本をもっていない', 'しか … もっていない'],
    ['私しかしていない', 'しかしていない'],
    ['私しかここには住んでいない', 'しか … 住んでいない'],
    ['私しかこうえんで遊べない', 'しか … 遊べない'],
    ['これしかしない', 'しかしない'],
    ['これしかわからない', 'しかわからない'],
    ['これしか私には見えない', 'しか … 見えない'],
    ['英語しか話せません', 'しか話せません'],
    ['少ししか食べなかった', 'しか食べなかった'],
    ['100円しかない', 'しかない'],
    ['今はこの近くしかない', 'しかない'],
    ['一つしかない', 'しかない'],
    ['パンしか食べずに学校へ行った', 'しか食べずに'],
  ]) {
    const matches = detectGrammarPatterns(sentence);
    const shika = matches.find(m => m.id === 'n4-shika-nai');
    assert.ok(shika, `Expected 〜しか〜ない for "${sentence}", got ${JSON.stringify(matches.map(m => m.id))}`);
    assert.equal(shika.level, 'N4');
    assert.equal(shika.matched, expectedSnippet);
    assert.equal(shika.spans.length, 2);
  }

  assert.deepEqual(ids('私しかしていない'), ['n4-shika-nai', 'n5-te-iru']);
  assert.ok(!ids('今はこの近くしかない').includes('n3-shika-nai-choice'));
  assert.ok(!ids('一つしかない').includes('n3-shika-nai-choice'));

  for (const sentence of ['行くしかない', '諦めるしかなかった', 'やるしかない']) {
    const found = ids(sentence);
    assert.ok(found.includes('n3-shika-nai-choice'), sentence);
    assert.ok(!found.includes('n4-shika-nai'), sentence);
  }

  for (const sentence of ['しかし雨が降らない', 'しかも分からない', 'たしかに分からない', 'もしかしたら来ないかもしれない', 'しかたがない', 'しかるべきではない']) {
    assert.ok(!ids(sentence).includes('n4-shika-nai'), `False positive on "${sentence}"`);
  }
});

test('identifies N5–N1 patterns, polite/contracted aspect spans, and paired conditionals', () => {
  const cases = [
    ['日本語を話すことができる', 'N5', 'n5-koto-ga-dekiru'],
    ['日本に行ったことがある', 'N5', 'n5-ta-koto-ga-aru'],
    ['本を読んだり映画を見たりする', 'N5', 'n5-tari-tari'],
    ['あまり美味しくない', 'N5', 'n5-amari-nai'],
    ['全然分からない', 'N5', 'n5-zenzen-nai'],
    ['まだ食べていない', 'N5', 'n5-mada-teinai'],
    ['冷たい水が飲みたい', 'N5', 'n5-tai'],
    ['雨が降っているのに出かけてしまった', 'N5', 'n5-te-iru'],
    ['雨が降っているのに出かけてしまった', 'N4', 'n4-noni'],
    ['雨が降っているのに出かけてしまった', 'N4', 'n4-te-shimau'],
    ['勉強しなければならない', 'N4', 'n4-nakereba-naranai'],
    ['食べたらいい', 'N4', 'n4-tara'],
    ['雨が降ったらすぐ帰る', 'N4', 'n4-tara'],
    ['食べたらくだらない話をしよう', 'N4', 'n4-tara'],
    ['努力すればするほど上手になる', 'N3', 'n3-ba-hodo'],
    ['せっかく作ったのに食べてくれなかった', 'N3', 'n3-sekkaku-noni'],
    ['彼のことだからきっと遅れるに違いない', 'N2', 'n2-koto-dakara'],
    ['田中さんをはじめ、多くの人が参加した', 'N2', 'n2-wo-hajime'],
    ['雨が降っているにもかかわらず、出かけざるを得ない', 'N2', 'n2-ni-mo-kakawarazu'],
    ['雨が降っているにもかかわらず、出かけざるを得ない', 'N2', 'n2-zaru-wo-enai'],
    ['涙を禁じ得ない', 'N1', 'n1-wo-kinji-enai'],
    ['雨が止むや否や走り出した', 'N1', 'n1-ya-inaya'],
    ['彼ならではのアイデアだ', 'N1', 'n1-naradewa'],
    ['漢字はおろかひらがなさえ書けない', 'N1', 'n1-wa-oroka'],
  ];
  for (const [sentence, expectedLevel, expectedId] of cases) {
    const hit = detectGrammarPatterns(sentence).find(m => m.id === expectedId);
    assert.ok(hit, `Expected ${expectedLevel}:${expectedId} in "${sentence}"`);
    assert.equal(hit.level, expectedLevel);
  }
  assert.equal(detectGrammarPatterns('私は食べていませんでした').find(m => m.id === 'n5-te-iru')?.matched, 'ていませんでした');
  assert.equal(detectGrammarPatterns('食べてませんでした').find(m => m.id === 'n5-te-iru')?.matched, 'てませんでした');
  assert.equal(detectGrammarPatterns('読んでませんでした').find(m => m.id === 'n5-te-iru')?.matched, 'でませんでした');
  assert.deepEqual(detectGrammarPatterns('もし食べたらくだらない話をしよう').map(m => [m.id, m.matched]), [['n4-moshi-tara', 'もし … たら']]);
  assert.deepEqual(levels('雨が降っているにもかかわらず、出かけざるを得ない'), ['N5', 'N2', 'N2']);
  assert.equal(detectGrammarPatterns('あ'.repeat(1000) + '日本語しか分からない').length, 0);
  assert.ok(!ids('新しい仕事を始めた').includes('n2-wo-hajime'), 'Ordinary verb 始めた must not match 〜をはじめ');
  assert.ok(!ids('新しい仕事を始めずに帰った').includes('n2-wo-hajime'), 'Negative verb 始めずに must not match 〜をはじめ');
  assert.ok(!ids('新しい仕事を始め、早速問題が起きた').includes('n2-wo-hajime'), 'Continuative verb 始め、 must not match 〜をはじめ');
  for (const plain of ['', 'Hello', '猫がいる', '頭が痛い', 'とても綺麗だった', '今日はとても暑い', '雨はとても強い', '新しい言葉', 'さようなら']) {
    assert.deepEqual(detectGrammarPatterns(plain), [], `Unexpected match for "${plain}"`);
  }
});

test('learning controller populates grammarPatterns offline immediately on select and clears on resume', async () => {
  const playback = { clientId: 'c1', playbackId: 'p1', videoIdentity: 'v1', title: 'Test', episode: '1', positionMs: 1500, paused: false };
  const host = {
    async snapshot() { return playback; },
    async pause() { playback.paused = true; },
    async resume() { playback.paused = false; },
  };
  let resolveParse;
  const services = {
    parse: () => new Promise(resolve => { resolveParse = resolve; }),
    lookup: async () => ({ meaning: 'to understand' }),
    translate: async () => ({ translation: 'I only understand Japanese.' }),
  };
  const controller = createLearningController({ host, services, now: () => 1000 });
  await controller.loadSubtitle({
    sourceId: 'ep1.srt', format: 'srt',
    content: '1\n00:00:01,000 --> 00:00:04,000\n日本語しか分からない\n',
  });
  await controller.refresh();
  const selecting = controller.select({ cueId: controller.view().activeCues[0].id, start: 5, end: 10 });
  // Grammar patterns are available synchronously before parsing resolves.
  assert.deepEqual(controller.view().grammarPatterns.map(m => m.id), ['n4-shika-nai']);
  await Promise.resolve();
  resolveParse([
    { surface: '日本語', start: 0, end: 3, reading: 'にほんご', romaji: 'nihongo', baseForm: '日本語', pos: '名詞' },
    { surface: 'しか', start: 3, end: 5, reading: 'しか', romaji: 'shika', baseForm: 'しか', pos: '助詞' },
    { surface: '分からない', start: 5, end: 10, reading: 'わからない', romaji: 'wakaranai', baseForm: '分かる', pos: '動詞' },
  ]);
  await selecting;
  assert.equal(controller.view().grammarPatterns[0].level, 'N4');
  assert.equal(controller.view().grammarPatterns[0].matched, 'しか分からない');
  await controller.resume();
  assert.deepEqual(controller.view().grammarPatterns, []);
});

test('on-video Study drawer renders grammar cards, keeps open state across clock updates, highlights tokens, and asks Sensei', async () => {
  const bundle = buildSync({ entryPoints: ['src/player-surface.js'], bundle: true, write: false,
    format: 'iife', globalName: 'Surface', target: 'es2017', loader: { '.css': 'text' } }).outputFiles[0].text;
  let serial = 0;
  const nodes = [], actions = [];
  class Element {
    constructor(tag) { this.id = `n${++serial}`; this.tagName = tag; this.attributes = {}; this.styles = {}; this.children = []; this.parent = null; this.handlers = new Map(); nodes.push(this); }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    async getAttribute(k) { return this.attributes[k] ?? null; }
    removeAttribute(k) { delete this.attributes[k]; }
    setText(v) { this.text = String(v); }
    setStyle(k, v) { this.styles[k] = v; }
    async getStyle(k) { return this.styles[k] || ''; }
    removeStyle(k) { delete this.styles[k]; }
    setProperty(k, v) { this[k] = v; }
    async getProperty(k) { return this[k]; }
    append(child) { child.remove(); child.parent = this; this.children.push(child); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null; }
    async getParent() { return this.parent; }
    async getChildren() { return [...this.children]; }
    after(child) { const owner = this.parent; if (!owner) return; child.remove(); child.parent = owner; owner.children.splice(owner.children.indexOf(this) + 1, 0, child); }
    async queryOne(selector) {
      const match = /^\[data-(?:vc-element|langplay)="([^"]+)"\]$/.exec(selector);
      if (!match) return null;
      const key = selector.includes('data-vc-element') ? 'data-vc-element' : 'data-langplay';
      const find = node => { for (const child of node.children) { if (child.attributes[key] === match[1]) return child; const nested = find(child); if (nested) return nested; } return null; };
      return find(this);
    }
    addEventListener(name, fn) { this.handlers.set(name, fn); return () => this.handlers.delete(name); }
  }
  const parent = new Element('div'), player = new Element('div'); parent.append(player);
  const ctx = { dom: { queryOne: async () => player, query: async () => [], createElement: async tag => new Element(tag), viewport: { getSize: () => ({ width: 1280 }) } } };
  const sandbox = {}; vm.runInNewContext(bundle, sandbox);
  const surface = sandbox.Surface.createPlayerSurface({ ctx, act: async (op, data) => { actions.push([op, data]); return { reply: 'Explanation' }; }, openPanel() {} });

  const patterns = detectGrammarPatterns('日本語しか分からない');
  const tokens = [
    { surface: '日本語', romaji: 'nihongo', pos: '名詞', meaning: 'Japanese', meaningBusy: false },
    { surface: 'しか', romaji: 'shika', pos: '助詞', meaning: 'only', meaningBusy: false },
    { surface: '分からない', romaji: 'wakaranai', pos: '動詞', meaning: 'to understand', meaningBusy: false },
  ];
  const state = {
    playback: { title: 'Test Anime', episode: '1' }, positionMs: 1500, source: { sourceId: 'ep1.srt', cueCount: 1 },
    preferences: { readingMode: 'furigana' }, activeCues: [{ id: 'c1', text: '日本語しか分からない' }], tokens: { c1: tokens },
    drawerOpen: true, selected: { surface: '分からない', sentence: '日本語しか分からない', title: 'Test Anime', episode: '1', videoTimeMs: 1500, span: { start: 5, end: 10 } },
    sentenceTokens: tokens, sentenceTranslation: 'I only understand Japanese.', grammarPatterns: patterns,
  };
  await surface.update(state);

  const section = nodes.find(n => n.attributes['data-langplay'] === 'grammar-section');
  const card = nodes.find(n => n.attributes['data-langplay'] === 'grammar-card');
  const toggle = nodes.find(n => n.attributes['data-langplay'] === 'grammar-toggle');
  const body = nodes.find(n => n.attributes['data-langplay'] === 'grammar-body');
  const askBtn = nodes.find(n => n.attributes['data-langplay'] === 'grammar-ask');
  assert.ok(!('hidden' in section.attributes), 'grammar section should be visible');
  assert.equal(card.attributes['data-level'], 'N4');
  assert.equal(toggle.tagName, 'input');
  assert.equal(toggle.attributes.type, 'button');
  assert.equal(toggle.attributes['aria-expanded'], 'false');
  assert.ok('hidden' in body.attributes);

  // Expanding highlights overlapping words in the sentence and survives subsequent ticks.
  toggle.handlers.get('click')();
  assert.equal(toggle.attributes['aria-expanded'], 'true');
  assert.ok(!('hidden' in body.attributes));
  const highlightedWords = nodes.filter(n => n.attributes['data-langplay'] === 'sentence-word' && n.attributes['data-grammar-match'] === 'true');
  assert.equal(highlightedWords.length, 2, 'しか and 分からない should be highlighted');

  await surface.update({ ...state, positionMs: 2000 });
  assert.equal(toggle.attributes['aria-expanded'], 'true', 'clock updates must not reset open grammar card');

  await askBtn.handlers.get('click')();
  assert.equal(actions.at(-1)[0], 'chat');
  assert.match(actions.at(-1)[1].question, /N4.*〜しか〜ない/);

  // Multi-pattern sentence: opening a second card closes the first and highlights plain-text fallback slices too.
  const multiSentence = '雨が降っているのに出かけてしまった';
  const multiPatterns = detectGrammarPatterns(multiSentence);
  await surface.update({ ...state, selected: { ...state.selected, surface: '雨', sentence: multiSentence }, sentenceTokens: [], grammarPatterns: multiPatterns });
  const multiToggles = nodes.filter(n => n.parent && n.attributes['data-langplay'] === 'grammar-toggle').slice(-multiPatterns.length);
  assert.equal(multiToggles.length, 3);
  multiToggles[0].handlers.get('click')();
  multiToggles[1].handlers.get('click')();
  assert.equal(multiToggles[0].attributes['aria-expanded'], 'false', 'opening second card closes first');
  assert.equal(multiToggles[1].attributes['aria-expanded'], 'true');
  const plainHighlighted = nodes.filter(n => n.attributes['data-langplay'] === 'grammar-slice' && n.attributes['data-grammar-match'] === 'true').map(n => n.text);
  assert.deepEqual(plainHighlighted, ['のに']);

  // A transient DOM bridge error during grammar rendering (A -> failed B -> A)
  // must keep A's cards and click listeners intact, and retry of B must succeed.
  const grammarList = nodes.find(n => n.attributes['data-langplay'] === 'grammar-list');
  const origGetChildren = grammarList.getChildren.bind(grammarList);
  const stateA = { ...state, selected: { ...state.selected, surface: '雨', sentence: multiSentence }, sentenceTokens: [], grammarPatterns: multiPatterns };
  const nodesBeforeFailedB = nodes.length;
  let failOnce = true;
  grammarList.getChildren = async () => { if (failOnce) { failOnce = false; throw new Error('bridge timeout'); } return origGetChildren(); };
  await assert.rejects(() => surface.update({ ...state, selected: { ...state.selected, surface: '涙', sentence: '涙を禁じ得ない' }, sentenceTokens: [], grammarPatterns: detectGrammarPatterns('涙を禁じ得ない') }), /bridge timeout/);
  // Staged B nodes must have all their event listeners disposed when getChildren() fails.
  const leakedHandlers = nodes.slice(nodesBeforeFailedB).reduce((sum, n) => sum + n.handlers.size, 0);
  assert.equal(leakedHandlers, 0, 'failed B staging must dispose all staged listeners');
  // Returning to A preserves A's cards and interactive toggle listener.
  await surface.update(stateA);
  assert.equal(grammarList.children.length, 3);
  assert.equal(multiToggles[1].attributes['aria-expanded'], 'true');
  multiToggles[1].handlers.get('click')();
  assert.equal(multiToggles[1].attributes['aria-expanded'], 'false', 'A toggle listener must remain live after failed B');
  // Retrying B succeeds cleanly.
  await surface.update({ ...state, selected: { ...state.selected, surface: '涙', sentence: '涙を禁じ得ない' }, sentenceTokens: [], grammarPatterns: detectGrammarPatterns('涙を禁じ得ない') });
  assert.ok(nodes.some(n => n.parent === grammarList && n.attributes['data-pattern-id'] === 'n1-wo-kinji-enai'));

  // Empty grammarPatterns hides the section cleanly.
  await surface.update({ ...state, selected: { ...state.selected, surface: '猫', sentence: '猫がいる' }, sentenceTokens: [], grammarPatterns: [] });
  assert.ok('hidden' in section.attributes);
});

test('tray study panel renders grammar cards, highlights fallback slices, keeps expansion exclusive, and wires Ask', async () => {
  const browser = buildSync({ entryPoints: [fileURLToPath(new URL('../src/ui.js', import.meta.url))], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020' });
  const nodes = new Map(), listeners = {}, sent = [];
  const node = () => ({ value: '', hidden: false, open: false, textContent: '', children: [], attrs: {}, handlers: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener(k, fn) { this.handlers[k] = fn; }, replaceChildren() { this.children = []; this.value = ''; }, append(child) { this.children.push(child); if (!this.value) this.value = child.value; }, focus() {}, select() {} });
  const get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  vm.runInNewContext(browser.outputFiles[0].text, {
    document: { getElementById: get, createElement: node, activeElement: null, addEventListener() {} },
    setTimeout: () => 1, clearTimeout() {},
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, Blob: class {},
    webview: { on: (event, callback) => { listeners[event] = callback; }, send(event, message) {
      sent.push(message);
      if (message.op !== 'refresh') listeners['learning:response']({ id: message.id, result: { ok: true } });
    } },
  });
  const state = {
    activeCues: [], preferences: { readingMode: 'plain' }, source: { sourceId: 'ep1.srt', cueCount: 1, offsetMs: 0 },
    drawerOpen: true, selected: { surface: '雨', sentence: '雨が降っているのに出かけてしまった', title: 'Test', episode: '1', videoTimeMs: 1000 },
    playback: { title: 'Test' }, positionMs: 1000, explanation: '', reply: '',
    grammarPatterns: detectGrammarPatterns('雨が降っているのに出かけてしまった'),
  };
  listeners['learning:state'](JSON.stringify(state));
  assert.equal(get('grammar-section').hidden, false);
  assert.equal(get('grammar-count').textContent, '3 patterns');
  const [card0, card1] = get('grammar-list').children;
  card0.open = true; card0.handlers.toggle();
  card1.open = true; card1.handlers.toggle();
  assert.equal(card0.open, false, 'opening second card closes first');
  const highlighted = get('sentence').children.filter(el => el.attrs['data-grammar-match'] === 'true').map(el => el.textContent);
  assert.deepEqual(highlighted, ['のに']);

  const askBtn = card1.children[1].children.at(-1);
  await askBtn.onclick();
  assert.equal(sent.at(-1).op, 'chat');
  assert.match(sent.at(-1).data.question, /N4.*〜のに/);

  state.selected = { surface: '猫', sentence: '猫がいる', title: 'Test', episode: '1', videoTimeMs: 2000 };
  state.grammarPatterns = [];
  listeners['learning:state'](JSON.stringify(state));
  assert.equal(get('grammar-section').hidden, true);
  assert.equal(get('grammar-list').children.length, 0);
});
