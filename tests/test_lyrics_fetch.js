import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extRoot = fs.existsSync(path.join(__dirname, '..', 'extension', 'manifest.json'))
  ? path.join(__dirname, '..', 'extension')
  : path.join(__dirname, '..');

const { parseLRC, cleanSongTitle, parseSubtitleFile } = await import(
  pathToFileURL(path.join(extRoot, 'js', 'subtitles.js')).href
);

test('parseLRC parses standard and multi-timestamp LRC cues with duration calculations', () => {
  const lrcSample = `
[ti:愛の賞味期限]
[ar:tuki.]
[al:愛の賞味期限]
[length:03:30]
[00:12.34]自己嫌悪に落ちてく
[00:16.78]また君に恋を知る
[00:22.50]世界はとても綺麗だったな
[00:30.00][00:45.00]君が僕に見せてくれた
[00:50.00]
`;

  const cues = parseLRC(lrcSample);
  assert.ok(Array.isArray(cues), 'Cues must be an array');
  assert.equal(cues.length, 5, 'Should have 5 valid cues (12.34, 16.78, 22.50, 30.00, 45.00)');

  // Cue 1
  assert.equal(cues[0].text, '自己嫌悪に落ちてく');
  assert.ok(Math.abs(cues[0].start - 12.34) < 0.01, 'Start time should be 12.34s');
  assert.ok(Math.abs(cues[0].end - 16.78) < 0.01, 'End time should match next cue start');

  // Cue 2
  assert.equal(cues[1].text, 'また君に恋を知る');
  assert.ok(Math.abs(cues[1].start - 16.78) < 0.01);
  assert.ok(Math.abs(cues[1].end - 22.50) < 0.01);

  // Cue 3
  assert.equal(cues[2].text, '世界はとても綺麗だったな');
  assert.ok(Math.abs(cues[2].start - 22.50) < 0.01);
  assert.ok(Math.abs(cues[2].end - 30.00) < 0.01);

  // Multi-timestamp cues (sorted chronologically)
  assert.equal(cues[3].text, '君が僕に見せてくれた');
  assert.ok(Math.abs(cues[3].start - 30.00) < 0.01);

  assert.equal(cues[4].text, '君が僕に見せてくれた');
  assert.ok(Math.abs(cues[4].start - 45.00) < 0.01);
  assert.ok(cues[4].end > 45.00, 'Last cue should have default duration');
});

test('parseSubtitleFile recognizes .lrc files and LRC content', () => {
  const lrcContent = `[00:05.50]こんにちは\n[00:10.00]さようなら`;
  const cuesByName = parseSubtitleFile(lrcContent, 'song.lrc');
  assert.equal(cuesByName.length, 2);
  assert.equal(cuesByName[0].text, 'こんにちは');

  const cuesByContent = parseSubtitleFile(lrcContent, '');
  assert.equal(cuesByContent.length, 2);
  assert.equal(cuesByContent[0].text, 'こんにちは');
});

test('cleanSongTitle sanitizes YouTube music video titles and extracts artist/track', () => {
  // Case 1: Japanese quote format
  const t1 = cleanSongTitle('tuki.『愛の賞味期限』Official Music Video', 'tuki. Official Channel');
  assert.equal(t1.trackName, '愛の賞味期限');
  assert.equal(t1.artistName, 'tuki.');

  // Case 2: Japanese brackets and title
  const t2 = cleanSongTitle('【Official MV】YOASOBI「アイドル」 / YOASOBI - Idol', 'Ayase / YOASOBI');
  assert.equal(t2.trackName, 'アイドル');
  assert.equal(t2.artistName, 'YOASOBI');

  // Case 3: Hyphen separated with MV tag
  const t3 = cleanSongTitle('Eve - 廻廻奇譚 (Music Video)', 'Eve');
  assert.equal(t3.trackName, '廻廻奇譚');
  assert.equal(t3.artistName, 'Eve');

  // Case 4: THE FIRST TAKE format
  const t4 = cleanSongTitle('LiSA - 炎 / THE FIRST TAKE', 'THE FIRST TAKE');
  assert.equal(t4.trackName, '炎');
  assert.equal(t4.artistName, 'LiSA');

  // Case 5: Feat with Japanese fullwidth slash
  const t5 = cleanSongTitle('【MV】可愛くてごめん feat. ちゅーたん（CV：早見沙織）／HoneyWorks', 'HoneyWorks OFFICIAL');
  assert.equal(t5.trackName, '可愛くてごめん');
  assert.equal(t5.artistName, 'HoneyWorks');

  // Case 6: Anime metadata with sumitsuki brackets
  const t6 = cleanSongTitle('土岐麻子 / HOME【TVアニメ「フルーツバスケット」2nd Season 第2クール OP ver.】', '土岐麻子');
  assert.equal(t6.trackName, 'HOME');
  assert.equal(t6.artistName, '土岐麻子');

  // Case 7: Title with trailing - YouTube suffix
  const t7 = cleanSongTitle('土岐麻子 / HOME【TVアニメ「フルーツバスケット」2nd Season 第2クール OP ver.】 - YouTube', '土岐麻子');
  assert.equal(t7.trackName, 'HOME');
  assert.equal(t7.artistName, '土岐麻子');

  // Case 8: Anime OP theme in parentheses with quoted anime title
  const t8 = cleanSongTitle('Beverly（ビバリー） / Again（TVアニメ「フルーツバスケット」OPテーマ） - YouTube', 'avex');
  assert.equal(t8.trackName, 'Again');
  assert.equal(t8.artistName, 'Beverly');
});

test('manifest.json includes host permissions for https://lrclib.net/* and arbitrary lyrics URLs', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extRoot, 'manifest.json'), 'utf8'));
  assert.ok(manifest.host_permissions.includes('https://lrclib.net/*'), 'Manifest must allow https://lrclib.net/*');
  assert.ok(
    manifest.host_permissions.includes('<all_urls>') ||
    (manifest.host_permissions.includes('http://*/*') && manifest.host_permissions.includes('https://*/*')),
    'Manifest must permit fetching user-provided lyrics URLs'
  );
});

test('background.js registers and dispatches FETCH_LRCLIB_LYRICS correctly', async () => {
  const bgCode = fs.readFileSync(path.join(extRoot, 'background.js'), 'utf8');

  let messageListener = null;
  const mockChrome = {
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: (cb) => { messageListener = cb; } },
      getURL: (p) => `chrome-extension://mock/${p}`
    },
    tabs: { create: () => {} },
    storage: { local: { get: async () => ({}) } },
    permissions: { contains: async () => true }
  };

  const evalFn = new Function('chrome', bgCode);
  evalFn(mockChrome);
  assert.ok(messageListener, 'Message listener should be registered in background.js');

  // Test FETCH_LRCLIB_LYRICS dispatch with mock fetch
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.ok(url.includes('lrclib.net'), 'Must request lrclib.net');
      return {
        ok: true,
        json: async () => ({
          trackName: '愛の賞味期限',
          artistName: 'tuki.',
          syncedLyrics: '[00:10.00]テスト歌詞'
        })
      };
    };

    const response = await new Promise(resolve => {
      messageListener({
        action: 'FETCH_LRCLIB_LYRICS',
        trackName: '愛の賞味期限',
        artistName: 'tuki.'
      }, { id: 'mock-id' }, resolve);
    });

    assert.equal(response.success, true);
    assert.equal(response.trackName, '愛の賞味期限');
    assert.equal(response.syncedLyrics, '[00:10.00]テスト歌詞');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('background.js handles FETCH_LYRICS_URL action to fetch external lyrics from links', async () => {
  const bgCode = fs.readFileSync(path.join(extRoot, 'background.js'), 'utf8');

  let messageListener = null;
  const mockChrome = {
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: (cb) => { messageListener = cb; } },
      getURL: (p) => `chrome-extension://mock/${p}`
    },
    tabs: { create: () => {} },
    storage: { local: { get: async () => ({}) } },
    permissions: { contains: async () => true }
  };

  const evalFn = new Function('chrome', bgCode);
  evalFn(mockChrome);
  assert.ok(messageListener);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.equal(url, 'https://example.com/custom_song.lrc');
      return {
        ok: true,
        text: async () => '[00:05.00]テスト歌詞リンク'
      };
    };

    const response = await new Promise(resolve => {
      messageListener({
        action: 'FETCH_LYRICS_URL',
        url: 'https://example.com/custom_song.lrc'
      }, { id: 'mock-id' }, resolve);
    });

    assert.equal(response.success, true);
    assert.ok(response.content.includes('[00:05.00]テスト歌詞リンク'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('background.js falls back to querying without duration if duration query fails', async () => {
  const bgCode = fs.readFileSync(path.join(extRoot, 'background.js'), 'utf8');

  let messageListener = null;
  const mockChrome = {
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: (cb) => { messageListener = cb; } },
      getURL: (p) => `chrome-extension://mock/${p}`
    },
    tabs: { create: () => {} },
    storage: { local: { get: async () => ({}) } },
    permissions: { contains: async () => true }
  };

  const evalFn = new Function('chrome', bgCode);
  evalFn(mockChrome);
  assert.ok(messageListener);

  const fetchCalls = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      fetchCalls.push(url);
      if (url.includes('duration=')) {
        return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) };
      }
      return {
        ok: true,
        json: async () => ({
          trackName: 'HOME',
          artistName: '土岐麻子',
          syncedLyrics: '[00:14.62]胸の奥で人知れず 揺れていた'
        })
      };
    };

    const response = await new Promise(resolve => {
      messageListener({
        action: 'FETCH_LRCLIB_LYRICS',
        trackName: 'HOME',
        artistName: '土岐麻子',
        duration: 90
      }, { id: 'mock-id' }, resolve);
    });

    assert.equal(response.success, true);
    assert.equal(response.trackName, 'HOME');
    assert.equal(fetchCalls.length, 2, 'Should attempt with duration, then retry without duration');
    assert.ok(fetchCalls[0].includes('duration=90'));
    assert.ok(!fetchCalls[1].includes('duration='));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('content.js includes lyrics modal UI, search inputs, and retry polling state', () => {
  const contentJs = fs.readFileSync(path.join(extRoot, 'content.js'), 'utf8');

  assert.ok(contentJs.includes('linguaplay-lyrics-modal'), 'content.js must define #linguaplay-lyrics-modal');
  assert.ok(contentJs.includes('lp-search-track-input'), 'content.js must define track search input');
  assert.ok(contentJs.includes('lp-search-artist-input'), 'content.js must define artist search input');
  assert.ok(contentJs.includes('lp-search-submit-btn'), 'content.js must define search submit button');
  assert.ok(contentJs.includes('lyricsFetchAttemptedVid'), 'content.js must track lyricsFetchAttemptedVid for retry on SPA DOM load');
  assert.ok(!contentJs.includes('lp-lyrics-url-input'), 'content.js must not include removed Option 1 URL input');
  assert.ok(!contentJs.includes('lp-paste-lyrics-input'), 'content.js must not include removed Option 3 paste input');
});

test('background.js falls back to Kugou Music when LRCLIB has no synced lyrics', async () => {
  const bgCode = fs.readFileSync(path.join(extRoot, 'background.js'), 'utf8');

  let messageListener = null;
  const mockChrome = {
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: (cb) => { messageListener = cb; } },
      getURL: (p) => `chrome-extension://mock/${p}`
    },
    tabs: { create: () => {} },
    storage: { local: { get: async () => ({}) } },
    permissions: { contains: async () => true }
  };

  const evalFn = new Function('chrome', bgCode);
  evalFn(mockChrome);
  assert.ok(messageListener);

  const originalFetch = globalThis.fetch;
  const fetchUrls = [];
  try {
    globalThis.fetch = async (url) => {
      fetchUrls.push(url);
      if (url.includes('lrclib.net')) {
        // LRCLIB returns 404 / empty search
        return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) };
      }
      if (url.includes('lyrics.kugou.com/search')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 200,
            candidates: [
              {
                id: '62589475',
                accesskey: '5DC756726B71A4435EA15921245BC375',
                singer: '土岐麻子',
                song: 'HOME',
                duration: 291
              }
            ]
          })
        };
      }
      if (url.includes('lyrics.kugou.com/download')) {
        // Base64 encoding for "[00:14.71]胸の奥で人知れず\n[00:18.52]揺れていた\n"
        const rawLrc = '[00:14.71]胸の奥で人知れず\n[00:18.52]揺れていた\n';
        const b64 = Buffer.from(rawLrc, 'utf8').toString('base64');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 200,
            content: b64
          })
        };
      }
      return { ok: false, status: 500 };
    };

    const response = await new Promise(resolve => {
      messageListener({
        action: 'FETCH_LRCLIB_LYRICS',
        trackName: 'HOME',
        artistName: '土岐麻子',
        query: '土岐麻子 HOME'
      }, { id: 'mock-id' }, resolve);
    });

    assert.equal(response.success, true, 'Kugou fallback should return success: true');
    assert.equal(response.provider, 'kugou', 'Response provider should be kugou');
    assert.equal(response.trackName, 'HOME');
    assert.equal(response.artistName, '土岐麻子');
    assert.ok(response.syncedLyrics.includes('[00:14.71]胸の奥で人知れず'), 'syncedLyrics should contain decoded UTF-8 Japanese');
    assert.ok(fetchUrls.some(u => u.includes('lyrics.kugou.com/search')), 'Must have searched Kugou');
    assert.ok(fetchUrls.some(u => u.includes('lyrics.kugou.com/download')), 'Must have downloaded from Kugou');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('content.js includes Audio Timing 1-click anchor sync, macro buttons, and storage persistence', () => {
  const contentJs = fs.readFileSync(path.join(extRoot, 'content.js'), 'utf8');
  assert.ok(contentJs.includes('lp-sync-playhead-btn'), 'content.js must define 1-click anchor sync button #lp-sync-playhead-btn');
  assert.ok(contentJs.includes('lp-offset-manual-input'), 'content.js must define direct numeric offset input #lp-offset-manual-input');
  assert.ok(contentJs.includes('lp_offset_'), 'content.js must persist timing offset per video in storage');
});

test('background.js cascades to track-only search if composite query yields 0 results', async () => {
  const bgCode = fs.readFileSync(path.join(extRoot, 'background.js'), 'utf8');

  let messageListener = null;
  const mockChrome = {
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: (cb) => { messageListener = cb; } },
      getURL: (p) => `chrome-extension://mock/${p}`
    },
    tabs: { create: () => {} },
    storage: { local: { get: async () => ({}) } },
    permissions: { contains: async () => true }
  };

  const evalFn = new Function('chrome', bgCode);
  evalFn(mockChrome);

  const originalFetch = globalThis.fetch;
  const fetchUrls = [];
  try {
    globalThis.fetch = async (url) => {
      fetchUrls.push(url);
      if (url.includes('lrclib.net/api/get')) {
        return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) };
      }
      if (url.includes('lrclib.net/api/search')) {
        // If query is composite anime title + track, return 0
        if (url.includes('Oregairu')) {
          return { ok: true, status: 200, json: async () => [] };
        }
        // If track-only fallback is attempted with '春擬き'
        if (url.includes('%E6%98%A5%E6%93%AC%E3%81%8D') || url.includes('春擬き')) {
          return {
            ok: true,
            status: 200,
            json: async () => ([
              {
                trackName: '春擬き',
                artistName: 'やなぎなぎ',
                syncedLyrics: '[00:00.71] 探しに行くんだ そこへ'
              }
            ])
          };
        }
      }
      return { ok: false, status: 404 };
    };

    const response = await new Promise(resolve => {
      messageListener({
        action: 'FETCH_LRCLIB_LYRICS',
        trackName: '春擬き',
        artistName: 'Oregairu',
        query: 'Oregairu 春擬き'
      }, { id: 'mock-id' }, resolve);
    });

    assert.equal(response.success, true, 'Cascading search should succeed');
    assert.equal(response.trackName, '春擬き');
    assert.equal(response.artistName, 'やなぎなぎ');
    assert.ok(fetchUrls.some(u => u.includes('q=%E6%98%A5%E6%93%AC%E3%81%8D') || u.includes('q=春擬き')), 'Must have attempted track-only fallback query');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('content.js includes Sensei AI song identifier and 1-click modal button', () => {
  const contentJs = fs.readFileSync(path.join(extRoot, 'content.js'), 'utf8');
  assert.ok(contentJs.includes('identifySongWithSensei'), 'content.js must define identifySongWithSensei');
  assert.ok(contentJs.includes('lp-ai-identify-btn'), 'content.js must define 1-click Sensei button #lp-ai-identify-btn');
});

test('content.js includes per-video lyrics caching with storage persistence', () => {
  const contentJs = fs.readFileSync(path.join(extRoot, 'content.js'), 'utf8');
  assert.ok(contentJs.includes('lp_lyrics_cache_'), 'content.js must check and persist lp_lyrics_cache_ in storage');
});

test('content.js places #linguaplay-sub-status badge inside #linguaplay-yt-controls next to the eye icon', () => {
  const contentJs = fs.readFileSync(path.join(extRoot, 'content.js'), 'utf8');
  assert.ok(contentJs.includes('id="linguaplay-visibility-toggle"'), 'Eye icon must exist');
  assert.ok(contentJs.includes('id="linguaplay-sub-status"'), 'Sub status badge must exist');

  // Verify linguaplay-sub-status is within linguaplay-yt-controls
  const controlsMatch = contentJs.match(/controls\.innerHTML\s*=\s*`([\s\S]*?)`;/);
  assert.ok(controlsMatch, 'controls.innerHTML must be defined');
  const controlsHtml = controlsMatch[1];
  assert.ok(controlsHtml.includes('id="linguaplay-visibility-toggle"'), 'visibility-toggle in controls');
  assert.ok(controlsHtml.includes('id="linguaplay-sub-status"'), 'sub-status in controls');
  assert.ok(controlsHtml.includes('id="linguaplay-toggle-trigger"'), 'toggle-trigger in controls');

  // Verify visibility-toggle comes right before sub-status
  const eyeIndex = controlsHtml.indexOf('linguaplay-visibility-toggle');
  const statusIndex = controlsHtml.indexOf('linguaplay-sub-status');
  const triggerIndex = controlsHtml.indexOf('linguaplay-toggle-trigger');
  assert.ok(eyeIndex < statusIndex, 'Eye icon must precede sub-status badge');
  assert.ok(statusIndex < triggerIndex, 'Sub-status badge must precede settings trigger');

  // Verify sub-status was removed from linguaplay-yt-bar
  const barMatch = contentJs.match(/id="linguaplay-yt-bar"[\s\S]*?<\/div>/);
  if (barMatch) {
    assert.ok(!barMatch[0].includes('id="linguaplay-sub-status"'), 'Bar must not have duplicate linguaplay-sub-status');
  }
});

test('clicking the green #linguaplay-sub-status button opens the modal, replaces stale inputs, and autosearches with LLM', async () => {
  const vm = await import('node:vm');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const wanakana = require(path.join(extRoot, 'lib', 'wanakana.min.js'));
  const contentJs = fs.readFileSync(path.join(extRoot, 'content.js'), 'utf8');

  const elements = new Map();
  class Element {
    constructor() {
      this.style = { setProperty(n, v) { this[n] = v; } };
      this.children = [];
      this.listeners = {};
      this.value = '';
      this.dataset = {};
      this.attributes = {};
      this.offsetParent = {};
      this.disabled = false;
      const classes = new Set();
      this.classList = {
        add: (...names) => names.forEach(n => classes.add(n)),
        remove: (...names) => names.forEach(n => classes.delete(n)),
        contains: n => classes.has(n),
        toggle(n, force = !classes.has(n)) { if (force) classes.add(n); else classes.delete(n); return force; }
      };
      this._html = '';
      this._text = '';
    }
    set id(v) { this._id = v; elements.set(v, this); }
    get id() { return this._id; }
    set className(v) { this.classList.add(...v.split(/\s+/).filter(Boolean)); }
    setAttribute(n, v) { this.attributes[n] = String(v); }
    getAttribute(n) { return this.attributes[n] ?? null; }
    set innerHTML(v) {
      this._html = v;
      this._text = v.replace(/<[^>]*>/g, '');
      this.children = [];
      for (const m of v.matchAll(/id="([^"]+)"/g)) {
        const c = new Element();
        c.id = m[1];
        this.appendChild(c);
      }
    }
    get innerHTML() { return this._html; }
    set textContent(v) { this._text = v; this._html = v; }
    get textContent() { return this._text; }
    get firstChild() { return this.children[0] || null; }
    get nextElementSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null; }
    appendChild(c) { c.remove(); c.parentElement = this; this.children.push(c); return c; }
    insertBefore(c, a) { if (!a) return this.appendChild(c); c.remove(); c.parentElement = this; this.children.splice(this.children.indexOf(a), 0, c); return c; }
    addEventListener(n, cb) { this.listeners[n] = cb; }
    click() { this.listeners.click?.({ stopPropagation() {}, preventDefault() {} }); }
    querySelectorAll(sel) {
      const desc = this.children.flatMap(c => [c, ...c.querySelectorAll('*')]);
      return desc.filter(c => sel === '*' || (sel.startsWith('#') ? c.id === sel.slice(1) : sel.startsWith('.') && c.classList.contains(sel.slice(1))));
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    contains(el) { return this === el || this.children.some(c => c.contains(el)); }
    getBoundingClientRect() { return { top: 470, bottom: 510, left: 0, right: 900, width: 40, height: 40 }; }
    scrollIntoView() {}
    focus() {}
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this);
      this.parentElement = null;
    }
  }

  const body = new Element();
  const player = new Element();
  const nativeBar = new Element();
  nativeBar.className = 'ytp-chrome-bottom';
  const nativeControls = new Element();
  nativeControls.className = 'ytp-right-controls';
  const nativeCC = new Element();
  nativeCC.className = 'ytp-button ytp-subtitles-button';
  nativeControls.appendChild(nativeCC);
  nativeBar.appendChild(nativeControls);
  player.appendChild(nativeBar);

  const titleNode = new Element();
  titleNode.textContent = 'Oregairu Season 2 OP - Harumodoki [HD]';
  const channelNode = new Element();
  channelNode.textContent = 'AnimeThemes';

  const fetchCalls = [];
  const runtimeMessages = [];

  const documentElement = new Element();
  documentElement.appendChild(body);
  body.appendChild(player);

  const isConnectedToDocument = (el) => {
    let cur = el;
    while (cur) {
      if (cur === documentElement || cur === body) return true;
      cur = cur.parentElement;
    }
    return false;
  };

  const sandbox = {
    console,
    window: { wanakana, location: { search: '?v=vid_harumodoki', href: 'https://www.youtube.com/watch?v=vid_harumodoki' }, addEventListener() {} },
    document: {
      body,
      title: 'Oregairu Season 2 OP - Harumodoki [HD] - YouTube',
      documentElement,
      getElementById: id => {
        const el = elements.get(id) || null;
        return (el && isConnectedToDocument(el)) ? el : null;
      },
      querySelector: sel => {
        if (sel === '#movie_player') return player;
        if (sel.includes('yt-formatted-string') || sel.includes('title')) return titleNode;
        if (sel.includes('channel-name') || sel.includes('owner-name')) return channelNode;
        return null;
      },
      querySelectorAll: () => [],
      createElement: () => new Element(),
      addEventListener() {},
    },
    chrome: {
      storage: {
        local: {
          get: (_keys, cb) => cb({ linguaplay_ai_provider: 'antigravity' }),
          set: (_obj, cb) => cb?.(),
        }
      },
      runtime: {
        sendMessage(msg, cb) {
          runtimeMessages.push(msg);
          if (msg.action === 'ENSURE_LOCAL_SERVER') {
            cb?.({ success: true });
            return;
          }
          if (msg.action === 'FETCH_LRCLIB_LYRICS') {
            cb?.({
              success: true,
              provider: 'lrclib',
              trackName: msg.trackName,
              artistName: msg.artistName,
              syncedLyrics: '[00:01.00]探しに行くんだ そこへ\n[00:05.00]空欄を埋め完成した定食'
            });
            return;
          }
          cb?.({ success: true });
        }
      }
    },
    MutationObserver: class { observe() {} disconnect() {} },
    AbortSignal,
    URLSearchParams,
    setInterval() {},
    setTimeout() {},
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      if (url.endsWith('/api/ai/analyze')) {
        const bodyJson = JSON.parse(options.body);
        assert.ok(bodyJson.prompt && bodyJson.prompt.includes('trackName'), 'Must forward song identification prompt to /api/ai/analyze');
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            data: {
              trackName: '春擬き',
              artistName: 'やなぎなぎ',
              animeName: 'やはり俺の青春ラブコメはまちがっている。続'
            }
          })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };

  const instrumented = contentJs.replace(/\}\)\(\);\s*$/, 'globalThis.testApi = { injectUI, identifySongWithSensei };})();');
  vm.default.runInNewContext(instrumented, sandbox, { filename: 'content.js' });
  sandbox.testApi.injectUI();

  // Simulate stale inputs from a previous video ("Those Eyes" by "New West")
  const trackInp = elements.get('lp-search-track-input');
  const artistInp = elements.get('lp-search-artist-input');
  trackInp.value = 'Those Eyes';
  artistInp.value = 'New West';

  const statusBadge = sandbox.document.getElementById('linguaplay-sub-status');
  assert.ok(statusBadge, '#linguaplay-sub-status must be connected to document after injectUI');
  assert.equal(typeof statusBadge.listeners.click, 'function', '#linguaplay-sub-status must have click listener attached even though controls is attached at end of injectUI');
  statusBadge.textContent = '🎵 No lyrics (Click)';

  // Click the green button (#linguaplay-sub-status)
  await statusBadge.listeners.click({ stopPropagation() {} });
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));

  const modal = elements.get('linguaplay-lyrics-modal');
  assert.equal(modal.classList.contains('hidden'), false, 'Modal must open when green button is clicked');
  assert.equal(trackInp.value, '春擬き', 'Track input must be updated to LLM-identified song title');
  assert.equal(artistInp.value, 'やなぎなぎ', 'Artist input must be updated to LLM-identified artist');

  const lrclibCall = runtimeMessages.find(m => m.action === 'FETCH_LRCLIB_LYRICS');
  assert.ok(lrclibCall, 'Must automatically dispatch FETCH_LRCLIB_LYRICS after LLM identification');
  assert.equal(lrclibCall.trackName, '春擬き');
  assert.equal(lrclibCall.artistName, 'やなぎなぎ');
  assert.ok(statusBadge.textContent.includes('春擬き'), `Badge should update to synced song, got: ${statusBadge.textContent}`);
});




