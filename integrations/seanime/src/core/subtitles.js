import { compareCues } from './cues.js';

export class SubtitleError extends Error {
  constructor(code, message) { super(message); this.name = 'SubtitleError'; this.code = code; }
}

const invalid = message => { throw new SubtitleError('MALFORMED_SUBTITLE', message); };
const formats = new Set(['srt', 'vtt', 'ass', 'ssa']);

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

function assTimestamp(value) {
  const match = /^(\d+):([0-5]\d):([0-5]\d)\.(\d{2})$/.exec(value.trim());
  if (!match) return invalid(`Invalid ASS timestamp: ${value}`);
  const ms = ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]) * 10;
  if (!Number.isSafeInteger(ms)) return invalid('ASS timestamp is outside the supported range.');
  return ms;
}

function splitFields(text, count) {
  const fields = [];
  let pos = 0;
  for (let i = 1; i < count; i++) {
    const comma = text.indexOf(',', pos);
    if (comma < 0) return invalid('ASS event is missing required fields.');
    fields.push(text.slice(pos, comma));
    pos = comma + 1;
  }
  fields.push(text.slice(pos));
  return fields;
}

function cleanAss(text) {
  let drawing = false;
  let result = '';
  // Override tags affect presentation only. Retain drawing mode across blocks.
  const chunks = /\{([^}]*)\}|([^{}]+)|([{}])/g;
  let chunk;
  while ((chunk = chunks.exec(text)) !== null) {
    if (chunk[1] !== undefined) {
      let depth = 0;
      const tags = chunk[1];
      for (let i = 0; i < tags.length; i++) {
        if (tags[i] === '(') depth++;
        if (tags[i] === ')') depth = Math.max(0, depth - 1);
        if (!depth && tags[i] === '\\' && tags[i + 1] === 'p') {
          const match = /^p(\d+)(?=\\|\s|$)/.exec(tags.slice(i + 1));
          if (match) drawing = Number(match[1]) > 0;
        }
      }
    } else if (!drawing) result += chunk[2] || chunk[3];
  }
  return result.replace(/\\[Nn]/g, '\n').replace(/\\h/g, '\u00a0').trim();
}

function parseAss(original, normalized, format, namespace) {
  const cues = [];
  const metadata = { scriptInfo: {}, styleDefinitions: [] };
  let section = '', columns, timedCount = 0;
  normalized.split('\n').forEach((line, sourceIndex) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';')) return;
    if (/^\[.*\]$/.test(trimmed)) { section = trimmed.toLowerCase(); columns = undefined; return; }
    const pair = /^([^:]+):\s?(.*)$/.exec(line);
    if (!pair) return;
    const key = pair[1].trim().toLowerCase(), value = pair[2];
    if (section === '[script info]') metadata.scriptInfo[pair[1].trim()] = value;
    if (/^\[v4\+? styles\]$/.test(section) && key === 'style') metadata.styleDefinitions.push(value);
    if (section !== '[events]') return;
    if (key === 'format') {
      columns = value.split(',').map(s => s.trim().toLowerCase());
      if (columns.length > 64 || columns.some(s => !s) || new Set(columns).size !== columns.length ||
        !columns.includes('start') || !columns.includes('end') || columns[columns.length - 1] !== 'text') {
        return invalid('ASS event Format must contain Start, End and a final Text field.');
      }
    }
    if (key !== 'dialogue') return;
    if (!columns) return invalid('ASS Dialogue requires an Events Format declaration.');
    const values = splitFields(value, columns.length);
    const event = {};
    columns.forEach((column, i) => { event[column] = column === 'text' ? values[i] : values[i].trim(); });
    const startMs = assTimestamp(event.start), endMs = assTimestamp(event.end);
    if (endMs <= startMs) return invalid('ASS cue end must be after its start.');
    const layerValue = event.layer ?? (event.marked || '0').replace(/^Marked=/i, '');
    if (!/^-?\d+$/.test(layerValue) || !Number.isSafeInteger(Number(layerValue))) return invalid('Invalid ASS layer.');
    timedCount++;
    const text = cleanAss(event.text);
    if (!text) return;
    cues.push({ id: `${namespace}:${sourceIndex}`, sourceIndex, startMs, endMs, text, rawText: event.text,
      format, layer: Number(layerValue), style: event.style || '', speaker: event.name || event.actor || '',
      effect: event.effect || '', margins: { left: event.marginl || '', right: event.marginr || '', vertical: event.marginv || '' } });
  });
  if (!timedCount) return invalid('No timed ASS/SSA dialogue events found.');
  cues.sort(compareCues);
  return { format, original, sourceId: namespace, cues, metadata };
}

export function parseSubtitles(original, { format, sourceId } = {}) {
  format = String(format || '').toLowerCase().replace(/^\./, '');
  if (!formats.has(format)) throw new SubtitleError('UNSUPPORTED_FORMAT', `Unsupported subtitle format: ${format}`);
  if (typeof original !== 'string' || original.includes('\0')) return invalid('Expected subtitle text without NUL bytes.');
  const normalized = original.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return invalid('Subtitle is empty.');
  const namespace = sourceId === undefined ? `${format}-${fingerprint(original)}` : String(sourceId);
  if (format === 'ass' || format === 'ssa') return parseAss(original, normalized, format, namespace);
  const blocks = normalized.split(/\n(?:[ \t]*\n)+/);
  if (format === 'vtt') {
    const header = blocks.shift().split('\n');
    if (!/^WEBVTT(?:[ \t].*)?$/.test(header[0]) || header.slice(1).some(line => line.includes('-->'))) {
      return invalid('WebVTT requires a header followed by a blank line.');
    }
  }
  const cues = [];
  let timedCount = 0;
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
  cues.sort(compareCues);
  return { format, original, sourceId: namespace, cues };
}
