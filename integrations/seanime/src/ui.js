import { decodeSubtitle } from './core/encoding.js';

const $ = id => document.getElementById(id);
let sequence = 0, state = null, signature = '', selectedKey = '', setupOpen = false, offsetDirty = false;
const pending = new Map();
function send(op, data = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Seanime did not reply. Reopen LangPlay and try again.')); }, op === 'explain' || op === 'chat' ? 70000 : 15000);
    pending.set(id, { resolve, reject, timer }); webview.send('learning:request', { v: 1, id, op, data });
  });
}
const notice = message => { $('notice').textContent = message || ''; };
async function run(op, data) {
  try { const result = await send(op, data); return result; }
  catch (error) { notice(error.message); return null; }
}
const timestamp = ms => { const s = Math.floor((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function setup(value) { setupOpen = value; $('setup').hidden = !value; $('settings').setAttribute('aria-expanded', String(value)); }
function caption(view) {
  const key = JSON.stringify([view.activeCues, view.tokens, view.preferences.readingMode, !!view.source, !!view.playback]);
  if (key === signature) return; signature = key;
  $('caption').replaceChildren();
  if (!view.activeCues.length) {
    const p = document.createElement('p'); p.className = 'muted';
    p.textContent = !view.playback ? 'Start an episode in Seanime’s browser player.' : !view.source ? 'Choose a Japanese subtitle to start learning.' : 'Waiting for the next subtitle…';
    $('caption').append(p); return;
  }
  for (const cue of view.activeCues) {
    const line = document.createElement('p');
    const tokens = view.tokens?.[cue.id] || (typeof Intl.Segmenter === 'function'
      ? [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(cue.text)].map(s => ({ surface: s.segment, start: s.index, end: s.index + s.segment.length }))
      : [{ surface: cue.text, start: 0, end: cue.text.length }]);
    for (const token of tokens) {
      if (!token.surface.trim() || /^[\p{P}\p{S}\s]+$/u.test(token.surface)) { line.append(document.createTextNode(token.surface)); continue; }
      const button = document.createElement('button'); button.className = 'token'; button.lang = 'ja';
      const reading = view.preferences.readingMode === 'furigana' ? token.furigana : view.preferences.readingMode === 'romaji' ? token.romaji : '';
      if (reading && reading !== token.surface) {
        const ruby = document.createElement('ruby'), rt = document.createElement('rt');
        ruby.append(document.createTextNode(token.surface)); rt.textContent = reading; ruby.append(rt); button.append(ruby);
      } else button.textContent = token.surface;
      button.addEventListener('click', () => run('select', { cueId: cue.id, start: token.start, end: token.end }));
      line.append(button);
    }
    $('caption').append(line);
  }
}
function render(view) {
  state = view; caption(view);
  $('clock').textContent = timestamp(view.positionMs);
  $('source').textContent = view.source ? `${view.source.sourceId} · ${view.source.cueCount} cues` : view.association ? `Re-select subtitle: ${view.association.sourceId}` : 'SRT, VTT, ASS or SSA · up to 10 MiB';
  if (!offsetDirty && document.activeElement !== $('offset')) $('offset').value = view.source?.offsetMs ?? view.association?.offsetMs ?? 0;
  $('mode').value = view.preferences.readingMode;
  $('drawer').hidden = !view.drawerOpen;
  $('continue').hidden = !view.selected || view.drawerOpen;
  if (!view.source && !view.drawerOpen) setup(true);
  if (view.selected) {
    $('word').textContent = view.selected.surface; $('reading').textContent = view.reading;
    $('base').textContent = view.baseForm && view.baseForm !== view.selected.surface ? `Dictionary form: ${view.baseForm}` : '';
    $('meaning').textContent = view.meaning || (view.busy ? 'Looking up this word…' : 'No local definition yet.');
    $('sentence').textContent = view.selected.sentence;
    $('context').textContent = `${view.selected.title} · Episode ${view.selected.episode} · ${timestamp(view.selected.videoTimeMs)}`;
  }
  for (const key of ['explanation', 'reply']) { $(key).textContent = view[key]; $(key).hidden = !view[key]; }
  if (view.error) notice(view.error);
  if (view.drawerOpen && selectedKey !== JSON.stringify(view.selected)) { setup(false); $('close').focus(); }
  selectedKey = view.drawerOpen ? JSON.stringify(view.selected) : '';
}
webview.on('learning:state', raw => { try { render(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch { notice('Unable to display LangPlay state. Reopen the panel.'); } });
webview.on('learning:response', raw => {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw, request = pending.get(value.id);
  if (!request) return; pending.delete(value.id); clearTimeout(request.timer);
  if (value.error) request.reject(new Error(value.error)); else request.resolve(value.result);
});
$('settings').onclick = () => setup(!setupOpen);
for (const op of ['close', 'resume', 'hide']) $(op).onclick = () => run(op);
$('continue').onclick = () => run('resume');
document.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); run('close'); } });
$('offset').oninput = () => { offsetDirty = true; };
$('apply-offset').onclick = async () => {
  const result = await run('offset', { offsetMs: Number($('offset').value) });
  if (result) { offsetDirty = false; notice('Subtitle delay applied. Positive values show captions later.'); }
};
$('mode').onchange = () => run('preferences', { readingMode: $('mode').value });
$('import-paste').onclick = async () => {
  const sourceId = $('paste-name').value.trim(), content = $('paste-text').value;
  const result = await run('import', { content, sourceId, format: sourceId.split('.').pop().toLowerCase(), offsetMs: Number($('offset').value) });
  if (result) { $('paste-text').value = ''; setup(false); notice('Japanese subtitles ready. Select a word to pause and learn.'); }
};
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file) return;
  if (!file.size || file.size > 10 * 1024 * 1024) { notice('Choose a subtitle between 1 byte and 10 MiB.'); return; }
  try {
    const decoded = decodeSubtitle(new Uint8Array(await file.arrayBuffer()), { encoding: $('encoding').value,
      decodeLegacy: (encoding, bytes) => new TextDecoder(encoding, { fatal: true }).decode(bytes) });
    const result = await run('import', { content: decoded.text, sourceId: file.name, format: file.name.split('.').pop().toLowerCase(), offsetMs: Number($('offset').value) });
    if (result) { setup(false); notice('Japanese subtitles ready. Select a word to pause and learn.'); }
  } catch (e) { notice(e.message); }
  $('file').value = '';
};
for (const op of ['save', 'explain']) $(op).onclick = async () => {
  $(op).disabled = true; notice(op === 'explain' ? 'Asking your configured AI companion…' : 'Saving card…');
  const value = await run(op); $(op).disabled = false;
  if (value) notice(op === 'save' ? value.duplicate ? 'Card already saved locally.' : 'Card saved locally.' : 'Explanation ready.');
};
$('chat').onsubmit = async event => {
  event.preventDefault(); const question = $('question').value.trim(); if (!question) return;
  const button = $('chat').querySelector('button'); button.disabled = true; notice('Asking your configured AI companion…');
  const result = await run('chat', { question }); button.disabled = false; if (result) notice('Answer ready.');
};
$('export').onclick = async () => {
  const value = await run('export'); if (!value) return;
  $('cards-tsv').value = value.tsv; $('card-export').hidden = false;
  notice(`${value.count} local card${value.count === 1 ? '' : 's'} ready to export.`);
};
$('select-tsv').onclick = () => { $('cards-tsv').focus(); $('cards-tsv').select(); };
run('refresh');
