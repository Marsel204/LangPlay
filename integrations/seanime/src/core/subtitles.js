export class SubtitleError extends Error {
  constructor(code, message) { super(message); this.name = 'SubtitleError'; this.code = code; }
}

const invalid = message => { throw new SubtitleError('MALFORMED_SUBTITLE', message); };
const formats = new Set(['srt', 'vtt']);

function fingerprint(text) {
  // Deterministic cue namespace only; never use this as a cache/content hash.
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

function timestamp(value, format) {
  const match = format === 'srt'
    ? /^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3})$/.exec(value)
    : /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);
  if (!match) return invalid(`Invalid ${format.toUpperCase()} timestamp: ${value}`);
  const ms = ((Number(match[1] || 0) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
  if (!Number.isSafeInteger(ms)) return invalid('Timestamp is outside the supported range.');
  return ms;
}

function entities(text) {
  const named = { amp: '&', lt: '<', gt: '>', nbsp: ' ', quot: '"', apos: "'" };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|nbsp|quot|apos);/gi, (whole, key) => {
    if (!key.startsWith('#')) return named[key.toLowerCase()];
    const n = /^#x/i.test(key) ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : whole;
  });
}

function cleanText(text) {
  return entities(text.replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/?(?:b|i|u|s|font|ruby|rt|c|v|lang)(?:[.\s][^>]*)?>/gi, '')
    .replace(/<\d{2}:\d{2}(?::\d{2})?\.\d{3}>/g, '')).trim();
}

function timing(line, format) {
  const match = /^(\S+)\s+-->\s+(\S+)(?:[ \t]+(.*))?$/.exec(line.trim());
  if (!match) return invalid(`Invalid timing line: ${line}`);
  const startMs = timestamp(match[1], format);
  const endMs = timestamp(match[2], format);
  if (endMs <= startMs) return invalid('Cue end must be after its start.');
  return { startMs, endMs, settings: match[3] || '' };
}

export function parseSubtitles(original, { format, sourceId } = {}) {
  format = String(format || '').toLowerCase().replace(/^\./, '');
  if (!formats.has(format)) throw new SubtitleError('UNSUPPORTED_FORMAT', `Unsupported subtitle format: ${format}`);
  if (typeof original !== 'string' || original.includes('\0')) return invalid('Expected subtitle text without NUL bytes.');
  const normalized = original.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return invalid('Subtitle is empty.');
  const blocks = normalized.split(/\n(?:[ \t]*\n)+/);
  if (format === 'vtt') {
    const header = blocks.shift().split('\n');
    if (!/^WEBVTT(?:[ \t].*)?$/.test(header[0]) || header.slice(1).some(line => line.includes('-->'))) {
      return invalid('WebVTT requires a header followed by a blank line.');
    }
  }
  const cues = [];
  let timedCount = 0;
  const namespace = sourceId === undefined ? `${format}-${fingerprint(original)}` : String(sourceId);
  blocks.forEach((block, sourceIndex) => {
    const lines = block.split('\n');
    if (format === 'vtt' && /^(NOTE(?:[ \t]|$)|STYLE$|REGION$)/.test(lines[0])) return;
    let identifier = '';
    if (!lines[0].includes('-->')) {
      identifier = lines.shift();
      if (format === 'srt' && !/^\d+$/.test(identifier)) return invalid(`Invalid SRT cue number: ${identifier}`);
    }
    if (!lines.length) return invalid('Cue has no timing line.');
    const times = timing(lines.shift(), format);
    timedCount++;
    const rawText = lines.join('\n');
    const text = cleanText(rawText);
    if (!text) return;
    cues.push({ id: `${namespace}:${sourceIndex}`, sourceIndex, identifier, ...times,
      text, rawText, format, layer: 0, style: '' });
  });
  if (!timedCount) return invalid('No timed subtitle cues found.');
  cues.sort((a, b) => a.startMs - b.startMs || a.sourceIndex - b.sourceIndex);
  return { format, original, sourceId: namespace, cues };
}
