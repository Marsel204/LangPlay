/**
 * LinguaPlay Chrome Extension — Subtitles Module (subtitles.js)
 * Binary-search subtitle synchronizer, multi-format parser,
 * timing offset manager, and tokenized reading mode renderer.
 */

import { tokenizeSentence } from './tokenizer.js';

const VTT_TIME_RE = /(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3})/;
const SRT_TIME_RE = /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/;

let subtitleTimeline = [];
let currentSubIndex = -1;
let timingOffset = 0.0; // in seconds
let readingMode = 'furigana'; // 'furigana' | 'romaji' | 'hidden'
let manualCaptionsLoaded = false;

try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem) {
    readingMode = localStorage.getItem('linguaplay_reading_mode') || 'furigana';
  }
} catch (e) { /* ignore */ }

function timeToSeconds(h, m, s, ms) {
  const hours = h ? parseInt(h, 10) : 0;
  const minutes = parseInt(m, 10);
  const seconds = parseInt(s, 10);
  const millis = parseInt(ms, 10);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

export function parseVTT(raw) {
  if (!raw) return [];
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const cues = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const match = line.match(VTT_TIME_RE);

    if (match) {
      const startH = match[1] ? match[1].replace(':', '') : '0';
      const startM = match[2];
      const startS = match[3];
      const startMs = match[4];

      const endH = match[5] ? match[5].replace(':', '') : '0';
      const endM = match[6];
      const endS = match[7];
      const endMs = match[8];

      const start = timeToSeconds(startH, startM, startS, startMs);
      const end = timeToSeconds(endH, endM, endS, endMs);

      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== '') {
        const text = lines[i].trim()
          .replace(/<[^>]+>/g, '')
          .replace(/&rlm;|&lrm;/g, '');
        if (text) textLines.push(text);
        i++;
      }

      if (textLines.length > 0 && end > start) {
        cues.push({
          start,
          end,
          text: textLines.join(' ')
        });
      }
    } else {
      i++;
    }
  }

  return cues.sort((a, b) => a.start - b.start);
}

export function parseSRT(raw) {
  if (!raw) return [];
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\s*\n/);
  const cues = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    let timeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timeLineIdx = i;
        break;
      }
    }

    if (timeLineIdx === -1) continue;

    const timeLine = lines[timeLineIdx];
    const match = timeLine.match(SRT_TIME_RE);
    if (!match) continue;

    const start = timeToSeconds(match[1], match[2], match[3], match[4]);
    const end = timeToSeconds(match[5], match[6], match[7], match[8]);
    const textLines = lines.slice(timeLineIdx + 1).map(l => l.replace(/<[^>]+>/g, ''));

    if (textLines.length > 0 && end > start) {
      cues.push({
        start,
        end,
        text: textLines.join(' ')
      });
    }
  }

  return cues.sort((a, b) => a.start - b.start);
}

export function parseJSON3(json) {
  if (!json || !Array.isArray(json.events)) return [];
  const cues = [];

  for (const ev of json.events) {
    if (!ev.segs || ev.tStartMs === undefined) continue;
    const text = ev.segs.map(s => s.utf8 || '').join('').trim();
    if (!text || text === '\n') continue;

    const start = ev.tStartMs / 1000;
    const duration = (ev.dDurationMs || 3000) / 1000;
    cues.push({
      start,
      end: start + duration,
      text: text.replace(/\n+/g, ' ')
    });
  }

  return cues.sort((a, b) => a.start - b.start);
}

export function parseSubtitleFile(raw, filename = '') {
  const isVtt = filename.toLowerCase().endsWith('.vtt') || raw.trim().startsWith('WEBVTT');
  if (isVtt) {
    return parseVTT(raw);
  }
  return parseSRT(raw);
}

export function findCueIndexAtTime(timeline, time) {
  if (!timeline || timeline.length === 0) return -1;

  const effectiveTime = time - timingOffset;

  if (currentSubIndex >= 0 && currentSubIndex < timeline.length) {
    const cue = timeline[currentSubIndex];
    if (effectiveTime >= cue.start && effectiveTime <= cue.end) {
      return currentSubIndex;
    }
    if (currentSubIndex + 1 < timeline.length) {
      const nextCue = timeline[currentSubIndex + 1];
      if (effectiveTime >= nextCue.start && effectiveTime <= nextCue.end) {
        return currentSubIndex + 1;
      }
    }
  }

  let low = 0;
  let high = timeline.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const cue = timeline[mid];

    if (effectiveTime < cue.start) {
      high = mid - 1;
    } else if (effectiveTime > cue.end) {
      low = mid + 1;
    } else {
      return mid;
    }
  }

  return -1;
}

export function setTimeline(timeline, isManual = false) {
  subtitleTimeline = Array.isArray(timeline) ? timeline : [];
  currentSubIndex = -1;
  if (isManual) manualCaptionsLoaded = true;
}

export function getTimeline() {
  return subtitleTimeline;
}

export function isManualCaptionsLoaded() {
  return manualCaptionsLoaded;
}

export function setManualCaptionsLoaded(val) {
  manualCaptionsLoaded = val;
}

export function getCurrentCueIndex() {
  return currentSubIndex;
}

export function setCurrentCueIndex(idx) {
  currentSubIndex = idx;
}

export function getCurrentSentence() {
  if (currentSubIndex >= 0 && currentSubIndex < subtitleTimeline.length) {
    return subtitleTimeline[currentSubIndex].text;
  }
  return '';
}

export function adjustTimingOffset(delta) {
  timingOffset = Math.round((timingOffset + delta) * 10) / 10;
  return timingOffset;
}

export function setTimingOffset(val) {
  timingOffset = Math.round(val * 10) / 10;
  return timingOffset;
}

export function getTimingOffset() {
  return timingOffset;
}

export function setReadingMode(mode) {
  if (['furigana', 'romaji', 'hidden'].includes(mode)) {
    readingMode = mode;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.setItem) {
        localStorage.setItem('linguaplay_reading_mode', mode);
      }
    } catch (e) { /* ignore */ }
  }
  return readingMode;
}

export function getReadingMode() {
  return readingMode;
}

export function renderTokens(text, container) {
  if (!container) return;
  container.innerHTML = '';
  if (!text || !text.trim()) return;

  const tokens = tokenizeSentence(text);
  if (tokens.length === 0) {
    const span = document.createElement('span');
    span.className = 'text-white text-xl font-medium px-2 py-1';
    span.textContent = text;
    container.appendChild(span);
    return;
  }

  for (const tk of tokens) {
    if (!tk.surface.trim()) continue;

    const span = document.createElement('span');
    span.className = 'token-group';
    span.dataset.word = tk.surface;
    span.dataset.romaji = tk.romaji;
    span.dataset.reading = tk.reading;
    span.dataset.furigana = tk.furigana;
    span.dataset.pos = tk.pos;
    span.dataset.posDetail = tk.posDetail;
    span.dataset.baseform = tk.baseForm;

    let readingText = tk.furigana || tk.reading;
    let readingHiddenClass = '';

    if (readingMode === 'romaji') {
      readingText = tk.romaji;
    } else if (readingMode === 'hidden') {
      readingHiddenClass = 'hidden-reading';
    }

    span.innerHTML = `
      <span class="token-reading text-rose-subtle/80 leading-tight ${readingHiddenClass}">${readingText || '&nbsp;'}</span>
      <span class="jp-text text-white text-xl font-medium" style="font-family:'Noto Sans JP',sans-serif">${tk.surface}</span>
    `;

    container.appendChild(span);
  }
}
