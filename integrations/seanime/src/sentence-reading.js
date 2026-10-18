// Keep the original text (including punctuation and newlines) authoritative.
export function sentenceParts(sentence, tokens) {
  if (!Array.isArray(tokens) || !tokens.length || tokens.some(token => typeof token.surface !== 'string') ||
      tokens.map(token => token.surface).join('') !== sentence) return null;
  return tokens.map(token => ({
    surface: token.surface,
    romaji: token.surface.trim() && token.pos !== '補助記号' && token.pos !== '記号' &&
      typeof token.romaji === 'string' && /[a-z]/i.test(token.romaji) ? token.romaji : '',
  }));
}
