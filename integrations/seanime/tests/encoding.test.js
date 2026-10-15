import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSubtitle, MAX_TEXT_BYTES } from '../src/core/encoding.js';

const encode = text => new TextEncoder().encode(text);

test('UTF-8 portable decoder preserves Japanese, supplementary characters and literal replacement characters', () => {
  const text = '猫\n𠮷野 🐈 \ufffd é';
  assert.deepEqual(decodeSubtitle(encode(text)), { text, encoding: 'utf-8', bom: false, byteLength: encode(text).length });
  assert.equal(decodeSubtitle(new Uint8Array([239, 187, 191, ...encode(text)])).text, text);
  assert.equal(decodeSubtitle(encode('')).text, '');
});

test('BOM selects strict UTF-16 endianness without a browser decoder', () => {
  const le = new Uint8Array([0xff, 0xfe, 0x2b, 0x73, 0x3d, 0xd8, 0x08, 0xdc]);
  const be = new Uint8Array([0xfe, 0xff, 0x73, 0x2b, 0xd8, 0x3d, 0xdc, 0x08]);
  assert.equal(decodeSubtitle(le).text, '猫🐈');
  assert.equal(decodeSubtitle(be).text, '猫🐈');
  assert.equal(decodeSubtitle(le.subarray(2), { encoding: 'utf-16le' }).text, '猫🐈');
  assert.equal(decodeSubtitle(be).encoding, 'utf-16be');
  assert.throws(() => decodeSubtitle(le, { encoding: 'utf-8' }), { code: 'ENCODING_CONFLICT' });
});

test('Corrupt, overlong, truncated and surrogate UTF-8 never silently substitutes text', () => {
  for (const bytes of [[0xc0, 0xaf], [0xe0, 0x80, 0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80],
    [0xf5, 0x80, 0x80, 0x80], [0xe7, 0x8c], [0x80], [0xc2, 0x20]]) {
    assert.throws(() => decodeSubtitle(new Uint8Array(bytes)), { code: 'INVALID_ENCODING' });
  }
});

test('Malformed UTF-16 and UTF-32 BOMs fail explicitly', () => {
  for (const bytes of [[0xff, 0xfe, 0x2b], [0xfe, 0xff, 0xd8, 0x00], [0xff, 0xfe, 0x00, 0xdc]]) {
    assert.throws(() => decodeSubtitle(new Uint8Array(bytes)), { code: 'INVALID_ENCODING' });
  }
  for (const bytes of [[0xff, 0xfe, 0, 0], [0, 0, 0xfe, 0xff]]) {
    assert.throws(() => decodeSubtitle(new Uint8Array(bytes)), { code: 'UNSUPPORTED_ENCODING' });
  }
});

test('Shift_JIS is explicit and uses a strict injected runtime decoder', () => {
  const bytes = new Uint8Array([0x94, 0x4c, 0x82, 0xc5, 0x82, 0xb7]); // 猫です
  let calls = 0;
  const decodeLegacy = (encoding, input, { fatal }) => { calls++; return new TextDecoder(encoding, { fatal }).decode(input); };
  assert.throws(() => decodeSubtitle(bytes), { code: 'INVALID_ENCODING' });
  assert.equal(calls, 0, 'No guessing or silent fallback');
  assert.equal(decodeSubtitle(bytes, { encoding: 'shift_jis', decodeLegacy }).text, '猫です');
  assert.equal(calls, 1);
  assert.throws(() => decodeSubtitle(bytes, { encoding: 'sjis' }), { code: 'DECODER_UNAVAILABLE' });
  assert.throws(() => decodeSubtitle(new Uint8Array([0x82]), { encoding: 'shift_jis', decodeLegacy }), { code: 'INVALID_ENCODING' });
  assert.throws(() => decodeSubtitle(bytes, { encoding: 'shift_jis', decodeLegacy: () => '\ufffd' }), { code: 'INVALID_ENCODING' });
});

test('10 MiB byte cap is inclusive and rejects oversize before invoking a decoder', () => {
  assert.equal(decodeSubtitle(new Uint8Array(MAX_TEXT_BYTES).fill(0x61)).text.length, MAX_TEXT_BYTES);
  let called = false;
  assert.throws(() => decodeSubtitle(new Uint8Array(MAX_TEXT_BYTES + 1), { encoding: 'shift_jis', decodeLegacy() { called = true; } }), { code: 'TEXT_TOO_LARGE' });
  assert.equal(called, false);
  assert.throws(() => decodeSubtitle('猫'), TypeError);
  assert.throws(() => decodeSubtitle(encode('猫'), { encoding: 'guess' }), { code: 'UNSUPPORTED_ENCODING' });
});

test('Failed decoding leaves a caller’s previously selected text untouched', () => {
  let selected = decodeSubtitle(encode('前の字幕'));
  assert.throws(() => { selected = decodeSubtitle(new Uint8Array([0xff])); });
  assert.equal(selected.text, '前の字幕');
});
