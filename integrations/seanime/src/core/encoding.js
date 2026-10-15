export const MAX_TEXT_BYTES = 10 * 1024 * 1024;

export class EncodingError extends Error {
  constructor(code, message, byteOffset) {
    super(message); this.name = 'EncodingError'; this.code = code;
    if (byteOffset !== undefined) this.byteOffset = byteOffset;
  }
}

const fail = (code, message, offset) => { throw new EncodingError(code, message, offset); };

// Portable strict decoders: Goja need not provide browser TextDecoder.
function collector() {
  const chunks = [];
  let units = [];
  return {
    push(point) {
      if (point > 0xffff) { point -= 0x10000; units.push(0xd800 + (point >> 10), 0xdc00 + (point & 1023)); }
      else units.push(point);
      if (units.length >= 4096) { chunks.push(String.fromCharCode.apply(null, units)); units = []; }
    },
    finish() { if (units.length) chunks.push(String.fromCharCode.apply(null, units)); return chunks.join(''); },
  };
}

function utf8(bytes, start) {
  const out = collector();
  for (let i = start; i < bytes.length;) {
    const pos = i, first = bytes[i++];
    let point, extra, minimum;
    if (first <= 0x7f) { out.push(first); continue; }
    if (first >= 0xc2 && first <= 0xdf) { point = first & 31; extra = 1; minimum = 0x80; }
    else if (first >= 0xe0 && first <= 0xef) { point = first & 15; extra = 2; minimum = 0x800; }
    else if (first >= 0xf0 && first <= 0xf4) { point = first & 7; extra = 3; minimum = 0x10000; }
    else return fail('INVALID_ENCODING', 'Invalid UTF-8. Choose Shift_JIS explicitly if appropriate.', pos);
    if (i + extra > bytes.length) return fail('INVALID_ENCODING', 'Truncated UTF-8 sequence.', pos);
    for (let n = 0; n < extra; n++) {
      const next = bytes[i++];
      if ((next & 0xc0) !== 0x80) return fail('INVALID_ENCODING', 'Invalid UTF-8 continuation byte.', i - 1);
      point = (point << 6) | (next & 63);
    }
    if (point < minimum || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) {
      return fail('INVALID_ENCODING', 'Invalid UTF-8 code point.', pos);
    }
    out.push(point);
  }
  return out.finish();
}

function utf16(bytes, start, littleEndian) {
  if ((bytes.length - start) % 2) return fail('INVALID_ENCODING', 'Truncated UTF-16 code unit.', bytes.length - 1);
  const out = collector();
  const unit = i => littleEndian ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1];
  for (let i = start; i < bytes.length; i += 2) {
    const first = unit(i);
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = i + 2 < bytes.length ? unit(i + 2) : 0;
      if (second < 0xdc00 || second > 0xdfff) return fail('INVALID_ENCODING', 'Unpaired UTF-16 high surrogate.', i);
      out.push(0x10000 + ((first - 0xd800) << 10) + second - 0xdc00); i += 2;
    } else {
      if (first >= 0xdc00 && first <= 0xdfff) return fail('INVALID_ENCODING', 'Unpaired UTF-16 low surrogate.', i);
      out.push(first);
    }
  }
  return out.finish();
}

export function decodeSubtitle(bytes, { encoding = 'auto', decodeLegacy } = {}) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Subtitle input must be a Uint8Array.');
  if (bytes.byteLength > MAX_TEXT_BYTES) return fail('TEXT_TOO_LARGE', 'Text subtitle exceeds 10 MiB; choose a smaller file.');
  const aliases = { auto: 'auto', utf8: 'utf-8', 'utf-8': 'utf-8', 'utf-16le': 'utf-16le',
    'utf-16be': 'utf-16be', shift_jis: 'shift_jis', 'shift-jis': 'shift_jis', sjis: 'shift_jis' };
  const requested = aliases[String(encoding).toLowerCase()];
  if (!requested) return fail('UNSUPPORTED_ENCODING', `Unsupported subtitle encoding: ${encoding}`);
  if ((bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0 && bytes[3] === 0) ||
    (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff)) {
    return fail('UNSUPPORTED_ENCODING', 'UTF-32 subtitles must be converted to UTF-8 before import.');
  }
  let bom, start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) { bom = 'utf-8'; start = 3; }
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) { bom = 'utf-16le'; start = 2; }
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) { bom = 'utf-16be'; start = 2; }
  if (bom && requested !== 'auto' && requested !== bom) return fail('ENCODING_CONFLICT', 'Selected encoding conflicts with the file BOM.');
  const selected = bom || (requested === 'auto' ? 'utf-8' : requested);
  let text;
  if (selected === 'utf-8') text = utf8(bytes, start);
  else if (selected === 'utf-16le' || selected === 'utf-16be') text = utf16(bytes, start, selected === 'utf-16le');
  else {
    if (typeof decodeLegacy !== 'function') return fail('DECODER_UNAVAILABLE', 'Shift_JIS decoder is unavailable; convert to UTF-8 or retry with a supported decoder.');
    try { text = decodeLegacy(selected, bytes, { fatal: true }); }
    catch { return fail('INVALID_ENCODING', 'Invalid Shift_JIS subtitle; the previous subtitle is unchanged.'); }
    if (typeof text !== 'string' || text.includes('\ufffd')) return fail('INVALID_ENCODING', 'Shift_JIS decoder returned invalid or replacement text.');
  }
  return { text, encoding: selected, bom: !!bom, byteLength: bytes.byteLength };
}
