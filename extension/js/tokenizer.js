/**
 * LinguaPlay Chrome Extension — Tokenizer Module (tokenizer.js)
 * Async local Sudachi analysis with WanaKana and a lightweight offline fallback.
 */

import { getWordReading } from './kanji-dict.js';
import './japanese-parser.js';

const japaneseParser = globalThis.LinguaPlayParser.create();
const parserReadyListeners = new Set();
export function requestParsedSentence(text) { return japaneseParser.request(text); }
export function onParserReady(callback) { parserReadyListeners.add(callback); return () => parserReadyListeners.delete(callback); }
export function retryJapaneseParser() {
  japaneseParser.retry();
  for (const callback of parserReadyListeners) callback();
}
export async function parseSelectedWord(text, surface, start) {
  const tokens = await japaneseParser.request(text);
  if (!tokens) return null;
  const matches = token => token.surface === surface && (!Number.isInteger(start) || token.start === start);
  return tokens.find(matches) || tokens.flatMap(token => token.morphemes || []).filter(matches).map(japaneseParser.readingToken)[0] || null;
}

let tokenizer = null;
let initPromise = null;

export function initTokenizer(onProgress = null) {
  if (tokenizer) return Promise.resolve(tokenizer);
  if (initPromise) return initPromise;
  // Extension pages use the local parser asynchronously. Avoid decompressing
  // the remote Kuromoji dictionary on the playback/UI thread.
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    if (onProgress) onProgress('ready', 'Ready');
    return Promise.resolve(null);
  }

  initPromise = new Promise((resolve) => {
    const kuromojiLib = typeof window !== 'undefined' ? window.kuromoji : null;
    if (!kuromojiLib) {
      if (onProgress) onProgress('ready', 'Using built-in dictionary');
      return resolve(null);
    }

    if (onProgress) onProgress('loading', 'Loading Japanese dictionary…');

    kuromojiLib.builder({
      dicPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/'
    }).build((err, _tokenizer) => {
      if (err) {
        console.warn('[Tokenizer] Kuromoji remote dictionary load failed, using built-in kanji map:', err);
        if (onProgress) onProgress('ready', 'Using built-in dictionary');
        return resolve(null);
      }

      tokenizer = _tokenizer;
      console.log('[Tokenizer] Kuromoji morphological analyzer ready.');
      if (onProgress) onProgress('ready', 'Dictionary ready');
      resolve(tokenizer);
    });
  });

  return initPromise;
}

export function toRomaji(token) {
  if (!token) return '';
  const src = typeof token === 'string' ? token : (token.reading || token.surface_form || '');
  if (typeof window !== 'undefined' && window.wanakana && window.wanakana.toRomaji) {
    return window.wanakana.toRomaji(src);
  }
  return src;
}

export function toFurigana(token) {
  if (!token) return '';
  const src = typeof token === 'string' ? token : (token.reading || token.surface_form || '');
  if (typeof window !== 'undefined' && window.wanakana && window.wanakana.toHiragana) {
    return window.wanakana.toHiragana(src);
  }
  return src;
}

export function tokenizeSentence(text) {
  if (!text || !text.trim()) return [];
  const clean = text.trim();
  const parsed = japaneseParser.cached(text);
  if (parsed) return parsed;
  const wk = typeof window !== 'undefined' ? window.wanakana : null;

  // 1. If Kuromoji is initialized, use full morphological breakdown
  if (tokenizer) {
    try {
      const rawTokens = tokenizer.tokenize(clean);
      return rawTokens.map(tk => {
        const surface = tk.surface_form || '';
        const reading = tk.reading || surface;
        const furigana = toFurigana(reading);
        const romaji = toRomaji(reading);
        return {
          surface,
          reading,
          furigana: furigana !== surface ? furigana : (getWordReading(surface, wk).furigana || furigana),
          romaji: romaji !== surface ? romaji : (getWordReading(surface, wk).romaji || romaji),
          pos: tk.pos || '',
          posDetail: tk.pos_detail_1 || '',
          baseForm: tk.basic_form && tk.basic_form !== '*' ? tk.basic_form : surface
        };
      });
    } catch (e) {
      console.warn('[Tokenizer] Kuromoji tokenization failed, using built-in kanji map:', e);
    }
  }

  // 2. Native Intl.Segmenter + Built-in Kanji Dictionary
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const segmenter = new Intl.Segmenter('ja-JP', { granularity: 'word' });
      const segments = Array.from(segmenter.segment(clean));
      return segments.map(seg => {
        const word = seg.segment;
        const readingData = getWordReading(word, wk);
        return {
          surface: word,
          reading: readingData.furigana || word,
          furigana: readingData.furigana || word,
          romaji: readingData.romaji || toRomaji(word),
          pos: seg.isWordLike ? 'Word' : 'Punctuation',
          posDetail: '',
          baseForm: word
        };
      });
    } catch (e) {
      console.warn('[Tokenizer] Intl.Segmenter failed:', e);
    }
  }

  // 3. Fallback character-based split
  return clean.split(/([、。！？\s]+)/).filter(Boolean).map(chunk => {
    const readingData = getWordReading(chunk, wk);
    return {
      surface: chunk,
      reading: readingData.furigana || chunk,
      furigana: readingData.furigana || chunk,
      romaji: readingData.romaji || toRomaji(chunk),
      pos: '',
      posDetail: '',
      baseForm: chunk
    };
  });
}

export function isTokenizerReady() {
  return true;
}
