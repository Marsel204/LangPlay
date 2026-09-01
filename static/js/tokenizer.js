/**
 * LinguaPlay — Tokenizer Module (tokenizer.js)
 * Manages Kuromoji morphological analyzer & WanaKana reading converters.
 */

let tokenizer = null;
let initPromise = null;

/**
 * Initialize the Kuromoji morphological analyzer
 * @param {Function} onProgress - Optional callback for status changes
 * @returns {Promise<any>}
 */
export function initTokenizer(onProgress = null) {
  if (tokenizer) return Promise.resolve(tokenizer);
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    if (typeof kuromoji === 'undefined') {
      const err = new Error('Kuromoji library not loaded');
      if (onProgress) onProgress('error', err.message);
      return reject(err);
    }

    if (onProgress) onProgress('loading', 'Loading Japanese morphological dictionary…');

    kuromoji.builder({
      dicPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/'
    }).build((err, _tokenizer) => {
      if (err) {
        console.error('[Tokenizer] Kuromoji build error:', err);
        if (onProgress) onProgress('error', 'Dictionary failed to load. Please reload.');
        return reject(err);
      }

      tokenizer = _tokenizer;
      console.log('[Tokenizer] Kuromoji tokenizer initialized successfully.');
      if (onProgress) onProgress('ready', 'Dictionary ready');
      resolve(tokenizer);
    });
  });

  return initPromise;
}

/**
 * Convert token reading to Romaji via WanaKana
 * @param {object} token - Kuromoji token
 * @returns {string} Romaji transcription
 */
export function toRomaji(token) {
  if (!token) return '';
  const src = token.reading || token.surface_form || '';
  if (typeof wanakana !== 'undefined' && wanakana.toRomaji) {
    return wanakana.toRomaji(src);
  }
  return src;
}

/**
 * Convert token reading to Hiragana (Furigana) via WanaKana
 * @param {object} token - Kuromoji token
 * @returns {string} Hiragana transcription
 */
export function toFurigana(token) {
  if (!token) return '';
  const src = token.reading || token.surface_form || '';
  if (typeof wanakana !== 'undefined' && wanakana.toHiragana) {
    return wanakana.toHiragana(src);
  }
  return src;
}

/**
 * Tokenize a Japanese sentence into structured token metadata
 * @param {string} text - Japanese sentence or subtitle cue text
 * @returns {Array<object>} Processed tokens
 */
export function tokenizeSentence(text) {
  if (!tokenizer || !text || !text.trim()) return [];

  try {
    const rawTokens = tokenizer.tokenize(text);
    return rawTokens.map(tk => {
      const surface = tk.surface_form || '';
      const reading = tk.reading || surface;
      return {
        surface,
        reading,
        furigana: toFurigana(tk),
        romaji: toRomaji(tk),
        pos: tk.pos || '',
        posDetail: tk.pos_detail_1 || '',
        baseForm: tk.basic_form && tk.basic_form !== '*' ? tk.basic_form : surface
      };
    });
  } catch (e) {
    console.error('[Tokenizer] Failed to tokenize sentence:', e);
    return [];
  }
}

/**
 * Check if tokenizer is ready
 * @returns {boolean}
 */
export function isTokenizerReady() {
  return tokenizer !== null;
}
