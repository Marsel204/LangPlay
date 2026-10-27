import test from 'node:test';
import assert from 'node:assert/strict';

test('pending UI files yield to later file/saved/paste choices and playback changes', async () => {
  const elements = new Map(), events = new Map(), sent = [];
  const element = id => ({ value: '', files: [], hidden: false, disabled: false, style: {}, dataset: {},
    setAttribute() {}, append() {}, replaceChildren() {}, querySelector() { return element('button'); } });
  const get = id => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); };
  const previousDocument = globalThis.document, previousWebview = globalThis.webview;
  globalThis.document = { getElementById: get, addEventListener() {}, createElement: element, createTextNode: text => text };
  globalThis.webview = { on: (name, fn) => events.set(name, fn), send: (_event, message) => {
    sent.push(message);
    queueMicrotask(() => events.get('learning:response')({ id: message.id, ok: true, result: {} }));
  } };
  try {
    await import('../src/ui.js');
    get('encoding').value = 'auto';
    let finishOld;
    const bytes = new TextEncoder().encode('1\n00:00:01,000 --> 00:00:02,000\n猫\n');
    get('file').files = [{ name: 'old.srt', size: bytes.length, arrayBuffer: () => new Promise(resolve => { finishOld = () => resolve(bytes.buffer); }) }];
    const old = get('file').onchange();
    get('file').files = [{ name: 'current.srt', size: bytes.length, arrayBuffer: async () => bytes.buffer }];
    await get('file').onchange(); finishOld(); await old;
    assert.deepEqual(sent.filter(message => message.op === 'import').map(message => message.data.sourceId), ['current.srt']);
    assert.equal(get('file').value, '');
    const beginRead = () => {
      get('file').files = [{ name: 'stale.srt', size: bytes.length, arrayBuffer: () => new Promise(resolve => { finishOld = () => resolve(bytes.buffer); }) }];
      return get('file').onchange();
    };
    let read = beginRead();
    get('saved-subtitle').value = 'saved.srt'; await get('load-saved').onclick();
    finishOld(); await read;
    read = beginRead();
    get('paste-name').value = 'paste.srt'; get('paste-text').value = new TextDecoder().decode(bytes);
    await get('import-paste').onclick(); finishOld(); await read;
    read = beginRead();
    events.get('learning:state')({ activeCues: [], preferences: { readingMode: 'furigana' },
      playback: { clientId: 'new-client', playbackId: 'next', videoIdentity: 'next' } });
    finishOld(); await read;
    assert.deepEqual(sent.filter(message => message.op === 'import').map(message => message.data.sourceId), ['current.srt', 'paste.srt']);
    await new Promise(resolve => setImmediate(resolve)); // Finish the render-triggered saved-list refresh before restoring globals.
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWebview === undefined) delete globalThis.webview; else globalThis.webview = previousWebview;
  }
});
