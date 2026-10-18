import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const bundle = buildSync({ entryPoints: ['src/player-surface.js'], bundle: true, write: false,
  format: 'iife', globalName: 'Surface', loader: { '.css': 'text' } }).outputFiles[0].text;
function fixture() {
  let serial = 0;
  const nodes = [], actions = [], tracks = [];
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
    async queryOne() { return null; }
    addEventListener(name, fn) { this.handlers.set(name, fn); return () => this.handlers.delete(name); }
  }
  const parent = new Element('div'), player = new Element('div'); parent.append(player);
  const ctx = { videoCore:{setSubtitleTrack:n=>tracks.push(['subtitle',n]),setMediaCaptionTrack:n=>tracks.push(['caption',n])}, dom: { queryOne: async () => player, query: async () => [], createElement: async tag => new Element(tag),
    viewport: { getSize: () => ({width:1280}) } } };
  const sandbox = {}; vm.runInNewContext(bundle, sandbox);
  const surface = sandbox.Surface.createPlayerSurface({ ctx, act: async (op, data) => { actions.push([op, data]); }, openPanel() {} });
  const connected = node => node === parent || !!node.parent && connected(node.parent);
  const token = () => nodes.find(n => connected(n) && n.attributes['data-langplay'] === 'token');
  return { surface, token, actions, parent, player, nodes, tracks };
}
function view(tokens) {
  return { playback: {title:'Horimiya', episode:'1'}, positionMs:1500, source:{sourceId:'ja.srt'},
    preferences:{readingMode:'plain'}, activeCues:[{id:'cue',text:'日本語'}], tokens:{cue:tokens}, drawerOpen:false };
}

test('a paused caption keeps its clickable word when nested Go map enumeration order changes', async () => {
  const h = fixture(); let reversed = false;
  const piece = new Proxy({ surface:'日本語', reading:'ニホンゴ', pos:'名詞' }, {
    ownKeys(target) { reversed = !reversed; const keys = Reflect.ownKeys(target); return reversed ? keys.reverse() : keys; },
  });
  const tokens = [{surface:'日本語',start:0,end:3,reading:'ニホンゴ',morphemes:[piece]}];
  await h.surface.update(view(tokens)); const original = h.token(); assert.ok(original);
  for (let i = 0; i < 8; i++) await h.surface.update(view(tokens));
  assert.equal(h.token(), original, 'unchanged visible words must keep the same DOM node and click listener');
  await original.handlers.get('click')();
  assert.equal(h.actions[0]?.[0], 'select');
});

test('a changed visible word replaces the caption even when cue identity is unchanged', async () => {
  const h = fixture(); await h.surface.update(view([{surface:'日本語',start:0,end:3}])); const original = h.token();
  await h.surface.update(view([{surface:'言葉',start:0,end:2}]));
  assert.notEqual(h.token(), original); assert.equal(h.token().text, '言葉');
});


test('mounting into an already fullscreen inline player keeps the drawer inside it', async () => {
  const h = fixture();
  h.parent.setAttribute('data-vc-element', 'inline-container'); h.parent.setAttribute('class', 'fixed inset-0');
  await h.surface.update({ ...view([{surface:'日本語',start:0,end:3}]), drawerOpen:true });
  const drawer = h.nodes.find(n => n.attributes['data-langplay'] === 'drawer');
  assert.equal(drawer.parent, h.player, 'a plugin reload in fullscreen must not put study outside the fullscreen player');
  assert.equal(drawer.attributes['data-mode'], 'fullscreen');
});


test('reading mode is reachable while watching and switches captions to romaji without opening study', async () => {
  const h = fixture();
  const state = view([{surface:'日本語',start:0,end:3,furigana:'にほんご',romaji:'nihongo'}]);
  await h.surface.update(state);
  const controls = h.nodes.find(n => n.attributes['data-langplay'] === 'controls');
  const mode = controls.children.find(n => n.tagName === 'select' && n.attributes['aria-label'] === 'Subtitle reading');
  assert.ok(mode, 'reading mode must be available directly on the player');
  mode.value = 'romaji'; await mode.handlers.get('change')();
  assert.equal(h.actions[0]?.[0], 'preferences');
  assert.equal(h.actions[0]?.[1].readingMode, 'romaji');
  await h.surface.update({...state, preferences:{readingMode:'romaji'}});
  assert.equal(mode.value, 'romaji');
  assert.equal(h.token().children[0].children[0].text, 'nihongo');
  const drawer = h.nodes.find(n => n.attributes['data-langplay'] === 'drawer');
  assert.ok('hidden' in drawer.attributes);
  assert.equal(h.actions.some(([op]) => op === 'resume' || op === 'select'), false);
});

test('fullscreen captions reserve the study drawer area and release it when closed', async () => {
  const h = fixture();
  const state = view([{surface:'日本語',start:0,end:3}]);
  await h.surface.update(state);
  await h.surface.fullscreen({fullscreen:true});
  await h.surface.update({...state, drawerOpen:true});
  const captions = h.nodes.find(n => n.attributes['data-langplay'] === 'captions');
  assert.equal(captions.attributes['data-mode'], 'fullscreen');
  assert.equal(captions.attributes['data-study-open'], 'true');
  await h.surface.update(state);
  assert.equal(captions.attributes['data-study-open'], 'false');
  await h.surface.fullscreen({fullscreen:false});
  assert.equal(captions.attributes['data-mode'], 'windowed');
});

test('word lookup shows romaji alongside the Japanese reading', async () => {
  const h = fixture();
  await h.surface.update({...view([]), selected:{surface:'日本語',sentence:'日本語',span:{start:0,end:3}},
    drawerOpen:true, reading:'ニホンゴ', romaji:'nihongo'});
  const reading = h.nodes.find(n => n.attributes['data-langplay'] === 'reading');
  assert.equal(reading.text, 'ニホンゴ · nihongo');
});

test('replacement captions use the ordinary bottom position inside the displayed picture', () => {
  const scope = {}; vm.runInNewContext(bundle, scope);
  const inset = scope.Surface.captionInset;
  assert.ok(Math.abs(inset({width:1280,height:720,videoWidth:1920,videoHeight:1080}) - 32.4) < .001);
  assert.ok(Math.abs(inset({width:774,height:633,videoWidth:1920,videoHeight:1080}) - 122.8125) < .001);
  assert.equal(inset({width:640,height:360,videoWidth:1920,videoHeight:1080}), 24);
  assert.equal(inset({width:0,height:0,videoWidth:0,videoHeight:0}), 32);
});

test('punctuation remains literal without fake romaji readings or word actions', async () => {
  const h = fixture();
  const state = view([{surface:'“',start:0,end:1,reading:'キゴウ',romaji:'kigou',pos:'補助記号'},
    {surface:'日本語',start:1,end:4,romaji:'nihongo'}]);
  await h.surface.update({...state,preferences:{readingMode:'romaji'}});
  const captions = h.nodes.find(n => n.attributes['data-langplay'] === 'captions');
  const quote = captions.children[0].children[0];
  assert.equal(quote.tagName, 'span');
  assert.equal(quote.text, '“');
  assert.equal(quote.children.length, 0);
});


test('a loaded LangPlay source disables host subtitle tracks once, including between cues', async () => {
  const h = fixture(), state = view([{surface:'日本語',start:0,end:3}]);
  await h.surface.update({...state,source:null,activeCues:[]});
  assert.deepEqual(h.tracks, [], 'ordinary playback keeps its subtitles before a learning file is ready');
  await h.surface.update(state);
  assert.deepEqual(h.tracks, [['subtitle',-1],['caption',-1]], 'use the supported host Off selection');
  await h.surface.update({...state,activeCues:[]});
  await h.surface.update(state);
  assert.equal(h.tracks.length, 2, 'clock ticks must not keep changing the host track');
  const toggle = h.nodes.find(n=>n.attributes['data-langplay']==='toggle');
  await toggle.handlers.get('click')();
  await h.surface.update(state);
  assert.equal(h.tracks.length, 2, 'turning LangPlay off leaves the user-requested Off track untouched');
  await toggle.handlers.get('click')();
  await h.surface.update(state);
  assert.equal(h.tracks.length, 4, 'turning replacement captions back on selects Off again');
});

test('automatic subtitle status, opt-out and retry are available in setup',async()=>{
 const h=fixture();const state={...view([]),preferences:{readingMode:'romaji',autoSubtitles:true},autoSubtitles:{state:'error',message:'No Japanese subtitle match. Retry or choose a file.'}};
 await h.surface.update(state);
 const mode=h.nodes.find(n=>n.attributes['data-langplay']==='auto-mode');assert.ok(mode,'automatic loading needs an explicit manual fallback');
 assert.equal(mode.value,'automatic');mode.value='manual';await mode.handlers.get('change')();
 assert.equal(h.actions[0][1].autoSubtitles,false);
 const status=h.nodes.find(n=>n.attributes['data-langplay']==='auto-status');assert.match(status.text,/No Japanese subtitle/);
 const retry=h.nodes.find(n=>n.attributes['data-langplay']==='auto-retry');await retry.handlers.get('click')();assert.equal(h.actions[1][0],'auto-retry');
});

test('study places sentence romaji and English with Japanese and exposes translation recovery',async()=>{
  const h=fixture(), state={...view([]),drawerOpen:true,selected:{surface:'猫',sentence:'猫がいる',span:{start:0,end:1}},sentenceRomaji:'neko ga iru',sentenceTranslation:'A cat is here.'};
  await h.surface.update(state);
  const field=name=>h.nodes.find(n=>n.attributes['data-langplay']===name);
  assert.equal(field('sentence-romaji').text,'neko ga iru');
  assert.equal(field('sentence-romaji').attributes.lang,'ja-Latn');
  assert.equal(field('sentence-translation').text,'A cat is here.');
  assert.equal(field('sentence-translation').attributes.lang,'en');
  assert.equal(field('sentence').parent,field('sentence-translation').parent);
  await h.surface.update({...state,sentenceTranslation:'',translationError:'Check your AI provider.'});
  assert.match(field('sentence-translation').text,/Check your AI/);
  assert.equal('hidden' in field('translation-retry').attributes,false);
  await field('translation-retry').handlers.get('click')();
  assert.equal(h.actions.at(-1)[0],'translate');
});
