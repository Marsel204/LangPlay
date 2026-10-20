// Keep the original text (including punctuation and newlines) authoritative.
export function sentenceParts(sentence, tokens) {
  if (!Array.isArray(tokens) || !tokens.length || tokens.some(token => typeof token.surface !== 'string') ||
      tokens.map(token => token.surface).join('') !== sentence) return null;
  return tokens.map(token => {
    const word = isSentenceWord(token);
    const meaning = word && typeof token.meaning === 'string' ? token.meaning : '';
    const short = (meaning.startsWith('(') ? meaning : meaning.split(/;| — /)[0]).trim();
    return {
    surface: token.surface,
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
