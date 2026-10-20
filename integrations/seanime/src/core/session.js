import { createCueIndex, activeAtVideoTime, cueVideoTime, validateOffset } from './cues.js';

const identityKeys = ['clientId', 'playbackId', 'videoIdentity'];
const splitSurrogate = (text, pos) => pos > 0 && pos < text.length &&
  text.charCodeAt(pos - 1) >= 0xd800 && text.charCodeAt(pos - 1) <= 0xdbff &&
  text.charCodeAt(pos) >= 0xdc00 && text.charCodeAt(pos) <= 0xdfff;

export function createLearningSession({ now = () => Date.now(), maxExtrapolationMs = 1000 } = {}) {
  if (typeof now !== 'function' || !Number.isFinite(maxExtrapolationMs) || maxExtrapolationMs < 0) throw new TypeError('Invalid clock configuration.');
  let identity = null, sourceId = null, index = createCueIndex([]), offsetMs = 0;
  let generation = 0, selected = null, anchor = null;
  const tick = () => {
    const value = now();
    if (!Number.isFinite(value)) throw new RangeError('Clock must return finite milliseconds.');
    return value;
  };
  const invalidate = () => { generation++; selected = null; };
  function setPlayback(value) {
    if (value !== null && (!value || identityKeys.some(key => typeof value[key] !== 'string' || !value[key]))) {
      throw new TypeError('An identified playback requires clientId, playbackId and videoIdentity.');
    }
    if (identity && value && identityKeys.every(key => identity[key] === value[key])) return;
    if (!identity && value === null) return;
    identity = value ? Object.freeze({ clientId: value.clientId, playbackId: value.playbackId, videoIdentity: value.videoIdentity }) : null;
    sourceId = null; index = createCueIndex([]); offsetMs = 0; anchor = null;
    invalidate();
  }
  function setSource(value) {
    if (!identity) throw new Error('No active playback.');
    if (!value || typeof value.sourceId !== 'string' || !value.sourceId) throw new TypeError('Subtitle source identity is required.');
    const nextOffset = validateOffset(value.offsetMs === undefined ? 0 : value.offsetMs);
    const nextIndex = createCueIndex(value.cues); // Validate completely before replacing working content.
    sourceId = value.sourceId; index = nextIndex; offsetMs = nextOffset;
    invalidate();
  }
  function setOffset(value) {
    validateOffset(value);
    if (value !== offsetMs) { offsetMs = value; invalidate(); }
  }
  function update({ positionMs, paused, rate = 1, durationMs }, { discontinuity = false } = {}) {
    if (!identity) throw new Error('No active playback.');
    if (!Number.isFinite(positionMs) || positionMs < 0 || positionMs > Number.MAX_SAFE_INTEGER ||
      typeof paused !== 'boolean' || !Number.isFinite(rate) || rate <= 0 ||
      (durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs < 0))) {
      throw new RangeError('Invalid authoritative playback status.');
    }
    anchor = { positionMs, paused, rate, durationMs, at: tick() };
    if (discontinuity) invalidate(); // Explicit authoritative seek, not a routine status tick/pause acknowledgement.
  }
  function position() {
    if (!anchor) return null;
    const elapsed = anchor.paused ? 0 : Math.min(maxExtrapolationMs, Math.max(0, tick() - anchor.at));
    const value = Math.min(Number.MAX_SAFE_INTEGER, anchor.positionMs + elapsed * anchor.rate);
    return anchor.durationMs === undefined ? value : Math.min(anchor.durationMs, value);
  }
  function active(options) {
    const time = position();
    return time === null ? [] : activeAtVideoTime(index, time, offsetMs, options);
  }
  function readingCues() {
    const time = position();
    if (time === null) return [];
    const sourceMs = time - offsetMs;
    const result = active().slice(0, 8);
    // Prepare only nearby lines, with current dialogue taking priority. Seek
    // directly into the sorted source instead of scanning an episode per tick.
    let low = 0, high = index.cues.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (index.cues[middle].startMs <= sourceMs) low = middle + 1;
      else high = middle;
    }
    for (let i = low; i < index.cues.length && result.length < 8; i++) {
      if (index.cues[i].startMs > sourceMs + 15000) break;
      result.push(index.cues[i]);
    }
    return result;
  }
  function token() {
    if (!identity) throw new Error('No active playback.');
    return Object.freeze({ ...identity, sourceId, generation });
  }
  function isCurrent(candidate) {
    return !!(identity && candidate && identityKeys.every(key => identity[key] === candidate[key]) &&
      candidate.sourceId === sourceId && candidate.generation === generation);
  }
  function select({ cueId, start, end, title = '', episode = '' }) {
    if (!identity || !sourceId || !anchor) throw new Error('Select text only after playback, source and clock are ready.');
    const cue = index.cues.find(item => item.id === cueId);
    if (!cue) throw new RangeError('Selected cue is no longer available.');
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > cue.text.length ||
      splitSurrogate(cue.text, start) || splitSurrogate(cue.text, end)) throw new RangeError('Invalid UTF-16 token span.');
    if (typeof title !== 'string' || typeof episode !== 'string') throw new TypeError('Title and episode must be text.');
    invalidate();
    const videoTimeMs = Math.round(position());
    selected = Object.freeze({ ...token(), cueIds: Object.freeze([cue.id]), sentence: cue.text,
      span: Object.freeze({ start, end }), surface: cue.text.slice(start, end),
      sourceStartMs: cue.startMs, sourceEndMs: cue.endMs,
      cueVideoStartMs: cueVideoTime(cue.startMs, offsetMs), cueVideoEndMs: cueVideoTime(cue.endMs, offsetMs),
      videoTimeMs, offsetMs, title, episode, capturedAtMs: tick() });
    return selected;
  }
  return Object.freeze({ setPlayback, setSource, setOffset, update, position, active, readingCues, select, token, isCurrent,
    clearSelection: invalidate, selected: () => selected, close: () => setPlayback(null) });
}
