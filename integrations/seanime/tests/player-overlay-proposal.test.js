import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHost } from '../src/host.js';

execFileSync(process.execPath, ['build.mjs'], { cwd: new URL('..', import.meta.url), stdio: 'pipe' });
const payload = readFileSync(new URL('../dist/learning-plugin.js', import.meta.url), 'utf8');

// Mock Seanime's documented DOM bridge, not a browser-global injection API.
function fixture() {
  const nodes = [], coreEvents = new Map(), requests = [], intervals = [], channels = new Map(), values = new Map();
  let serial = 0, shown = false, pauses = 0, resumes = 0, playerType = 'web';
  const info = { id: 'fixture-video-1', media: { id: 124080, title: { romaji: 'Horimiya' } }, episode: { episodeNumber: 1 } };
  const status = { id: info.id, clientId: 'fixture-client', currentTime: 1.5, duration: 1200, paused: false };
  class Element {
    constructor(tagName) { this.id = `fixture-${++serial}`; this.tagName = tagName; this.attributes = { id: this.id }; this.styles = {}; this.children = []; this.events = new Map(); this.parent = null; this.textContent = ''; this.removed = false; nodes.push(this); }
    setText(text) { this.textContent = String(text); }
    async getText() { return this.textContent + this.children.map(c => c.textContent).join(''); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    async getAttribute(name) { return this.attributes[name] ?? null; }
    async getAttributes() { return { ...this.attributes }; }
    removeAttribute(name) { delete this.attributes[name]; }
    setStyle(name, value) { this.styles[name] = String(value); }
    setCssText(value) { this.styles.cssText = value; }
    async getStyle(name) { return name ? this.styles[name] || '' : { ...this.styles }; }
    removeStyle(name) { delete this.styles[name]; }
    addClass(...names) { this.attributes.class = `${this.attributes.class || ''} ${names.join(' ')}`.trim(); }
    removeClass(...names) { this.attributes.class = (this.attributes.class || '').split(' ').filter(x => !names.includes(x)).join(' '); }
    setDataAttribute(name, value) { this.setAttribute(`data-${name}`, value); }
    async getProperty(name) { return name === 'isConnected' ? this.connected : this[name]; }
    setProperty(name, value) { this[name] = value; }
    get connected() { return !this.removed && (this === body || !!this.parent?.connected); }
    appendChild(child) { child.remove(); child.removed = false; child.parent = this; this.children.push(child); }
    append(child) { this.appendChild(child); }
    before(child) { if (!this.parent) return; const p = this.parent; child.remove(); child.removed = false; child.parent = p; p.children.splice(p.children.indexOf(this), 0, child); }
    after(child) { if (!this.parent) return; const p = this.parent; child.remove(); child.removed = false; child.parent = p; p.children.splice(p.children.indexOf(this) + 1, 0, child); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; this.removed = true; }
    removeChild(child) { if (child.parent === this) child.remove(); }
    async getParent() { return this.parent; }
    async getChildren() { return [...this.children]; }
    addEventListener(name, fn) { const list = this.events.get(name) || []; list.push(fn); this.events.set(name, list); return () => this.events.set(name, list.filter(x => x !== fn)); }
    async queryOne(selector) { return nodes.find(n => n.connected && contains(this, n) && matches(n, selector)) || null; }
    async query(selector) { return nodes.filter(n => n.connected && contains(this, n) && matches(n, selector)); }
    async click() { for (const fn of this.events.get('click') || []) await fn({ type: 'click', button: 0 }); }
  }
  const contains = (parent, node) => node === parent || !!node.parent && contains(parent, node.parent);
  const matches = (node, selector) => selector.split(',').some(part => {
    part = part.trim(); if (part === 'body') return node === body;
    if (part.startsWith('#')) return node.id === part.slice(1);
    const attr = part.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
    if (attr) return attr[2] === undefined ? attr[1] in node.attributes : node.attributes[attr[1]] === attr[2];
    return node.tagName.toLowerCase() === part.toLowerCase();
  });
  const body = new Element('body'), inline = new Element('div'), player = new Element('div');
  inline.setAttribute('data-vc-element', 'inline-container'); player.setAttribute('data-vc-element', 'container'); body.appendChild(inline); inline.appendChild(player);
  const core = {
    getCurrentClientId: () => status.clientId, getCurrentPlayerType: () => playerType,
    getCurrentPlaybackInfo: () => info, getPlaybackStatus: () => status,
    pause() { pauses++; status.paused = true; }, resume() { resumes++; status.paused = false; },
    addEventListener(name, fn) { const list = coreEvents.get(name) || []; list.push(fn); coreEvents.set(name, list); },
  };
  const dom = {
    async createElement(tag) { return new Element(tag); },
    async queryOne(selector) { return nodes.find(n => n.connected && matches(n, selector)) || null; },
    async query(selector) { return nodes.filter(n => n.connected && matches(n, selector)); },
    asElement(id) { return nodes.find(n => n.id === id); },
    onReady(fn) { Promise.resolve().then(fn); }, onMainTabReady(fn) { Promise.resolve().then(fn); },
    observe(selector, callback) { Promise.resolve().then(() => callback(nodes.filter(n => n.connected && matches(n, selector)))); return [() => {}, () => {}]; },
    viewport: { getSize: () => ({ width: 1280, height: 800 }), onResize: () => () => {} },
  };
  const panel = { channel: { on: (name, fn) => channels.set(name, fn), send() {} },
    onMount() {}, onLoad() {}, onUnmount() {}, setContent() {}, setOptions() {},
    show() { shown = true; }, hide() { shown = false; }, isHidden: () => !shown };
  const ctx = { dom, videoCore: core, screen: { onNavigate() {} },
    newTray: () => ({ onClick() {} }), newWebview: () => panel,
    setInterval(fn) { intervals.push(fn); }, setTimeout(fn) { return fn(); },
    async fetch(url) { requests.push(url); return { ok: true, json: () => ({ status: 'success', tokens: [{ surface: '日本語', start: 0, end: 3, reading: 'ニホンゴ', baseForm: '日本語', pos: '名詞' }] }) }; },
  };
  let callback;
  vm.runInNewContext(`${payload}\ninit();`, { $ui: { register(fn) { callback = fn.toString(); } } });
  vm.runInNewContext(`(${callback})(ctx)`, { ctx, $storage: { get: k => values.get(k), set: (k, v) => values.set(k, v) } });
  const flush = async () => { for (let n = 0; n < 80; n++) await Promise.resolve(); };
  const tick = async () => { for (const fn of intervals) await fn(); await flush(); };
  const part = name => nodes.find(n => n.connected && n.attributes['data-langplay'] === name);
  return { core, player, inline, nodes, requests, tick, flush, part,
    setPlayerType(value) { playerType = value; },
    async importSubtitle() { await channels.get('learning:request')({ v: 1, id: 1, op: 'import', data: { sourceId: 'fixture-ja.srt', format: 'srt', content: '1\n00:00:01,000 --> 00:00:04,000\n日本語\n', offsetMs: 0 } }); await tick(); await tick(); },
    async emit(name, data) { for (const fn of coreEvents.get(name) || []) await fn(data); await flush(); await tick(); },
    get pauses() { return pauses; }, get resumes() { return resumes; },
    contains,
  };
}

test('loaded learning subtitles render in the actual video container while the tray panel is closed', async () => {
  const h = fixture(); await h.importSubtitle();
  assert.ok(h.part('captions'), 'player must contain a LangPlay caption surface, not only the floating webview');
  assert.ok(h.contains(h.player, h.part('captions')), 'captions must be inside the fullscreen-capable player subtree');
  assert.ok(h.nodes.some(n => n.connected && n.tagName.toLowerCase() === 'button' && n.textContent === '日本語'), 'Japanese words must be clickable');
  assert.equal(h.requests.some(url => url.includes('/ai/')), false, 'reading captions must not call AI');
});

test('clicking an on-video word pauses that playback and opens the drawer beside the windowed video', async () => {
  const h = fixture(); await h.importSubtitle();
  const word = h.nodes.find(n => n.connected && n.tagName.toLowerCase() === 'button' && n.textContent === '日本語');
  assert.ok(word, 'on-video token must exist'); await word.click(); await h.tick();
  assert.equal(h.pauses, 1); assert.ok(h.part('drawer'), 'word selection must open a learning drawer');
  assert.equal(h.contains(h.player, h.part('drawer')), false, 'windowed drawer must sit beside, not cover, the video');
});

test('fullscreen moves the learning drawer into the same video subtree and returning restores its sidebar placement', async () => {
  const h = fixture(); await h.importSubtitle();
  const word = h.nodes.find(n => n.connected && n.tagName.toLowerCase() === 'button' && n.textContent === '日本語');
  assert.ok(word, 'on-video token must exist'); await word.click(); await h.tick();
  await h.emit('video-fullscreen', { fullscreen: true });
  assert.ok(h.part('drawer') && h.contains(h.player, h.part('drawer')), 'fullscreen drawer must remain inside the player');
  await h.emit('video-fullscreen', { fullscreen: false });
  assert.ok(h.part('drawer') && !h.contains(h.player, h.part('drawer')), 'exiting fullscreen must restore the sidebar');
  assert.equal(h.resumes, 0, 'fullscreen transitions must not resume a paused video');
});

test('terminating playback removes the caption controls rather than leaving a hidden player overlay', async () => {
  const h = fixture(); await h.importSubtitle(); assert.ok(h.part('captions'), 'caption overlay must exist before teardown');
  h.core.getPlaybackStatus = () => null;
  await h.emit('video-terminated', {});
  assert.equal(h.part('captions'), undefined, 'terminated playback must have no active caption surface');
  assert.equal(h.resumes, 0);
});

test('Denshi built-in native VideoCore playback is accepted while external mpv remains unsupported', () => {
  const h = fixture(); h.setPlayerType('native');
  assert.ok(createHost(h.core).snapshot(), 'the native VideoCore player must be eligible for direct learning controls');
  h.setPlayerType('mpv'); assert.equal(createHost(h.core).snapshot(), null);
});
