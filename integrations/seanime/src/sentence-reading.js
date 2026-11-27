// Keep the original text (including punctuation and newlines) authoritative.
export function sentenceParts(sentence, tokens) {
  if (!Array.isArray(tokens) || !tokens.length || tokens.some(token => typeof token.surface !== 'string') ||
      tokens.map(token => token.surface).join('') !== sentence) return null;
  let offset = 0;
  return tokens.map(token => {
    const start = offset;
    offset += token.surface.length;
    const word = isSentenceWord(token);
    const meaning = word && typeof token.meaning === 'string' ? token.meaning : '';
    const short = (meaning.startsWith('(') ? meaning : meaning.split(/;| — /)[0]).trim();
    return {
    surface: token.surface,
    start,
    end: offset,
    romaji: word &&
      typeof token.romaji === 'string' && /[a-z]/i.test(token.romaji) ? token.romaji : '',
    meaning,
    gloss: !word ? '' : meaning ? (short.length > 48 ? `${short.slice(0, 47)}…` : short) : token.meaningBusy ? 'Loading…' : 'No definition',
  }; });
}

export function isSentenceWord(token) {
  return !!token.surface.trim() && token.pos !== '補助記号' && token.pos !== '記号' &&
    !/^[\s、。…？！!?「」『』（）()\[\]｛｝{}〈〉《》【】〔〕“”‘’・：；,.:;ー—―～♪♫☆★※〜･]+$/.test(token.surface);
}

// Split plain text on grammar match boundaries so offline patterns can still
// highlight their sentence spans when aligned parser tokens are unavailable.
export function grammarSentenceSlices(sentence, patterns) {
  if (typeof sentence !== 'string' || !sentence || !Array.isArray(patterns) || !patterns.length) return null;
  const cuts = new Set([0, sentence.length]);
  let hasSpan = false;
  for (const pattern of patterns) {
    for (const span of pattern?.spans || []) {
      if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.end <= span.start) continue;
      const start = Math.max(0, Math.min(sentence.length, span.start));
      const end = Math.max(0, Math.min(sentence.length, span.end));
      if (end <= start) continue;
      hasSpan = true;
      cuts.add(start);
      cuts.add(end);
    }
  }
  if (!hasSpan) return null;
  const points = [...cuts].sort((a, b) => a - b);
  const slices = [];
  for (let i = 0; i < points.length - 1; i++) {
    slices.push({ text: sentence.slice(points[i], points[i + 1]), start: points[i], end: points[i + 1] });
  }
  return slices;
}
