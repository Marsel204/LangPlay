/** Shared async parser client for content scripts and extension pages. */
(function (root) {
  'use strict';
  function create({ transport, wanakana, now = Date.now } = {}) {
    const cache = new Map();
    const pending = new Map();
    let cooldown = 0;
    let generation = 0;
    const send = transport || (text => new Promise(resolve => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return resolve(null);
      try {
        chrome.runtime.sendMessage({ action: 'PARSE_JAPANESE', text }, response => {
          resolve(chrome.runtime.lastError || !response?.success ? null : response);
        });
      } catch { resolve(null); }
    }));
    function readingToken(token) {
      const wk = wanakana || root.wanakana;
      const reading = token.reading || token.surface;
      const furigana = wk?.toHiragana ? wk.toHiragana(reading, { convertLongVowelMark: false }) : reading;
      let romaji = wk?.toRomaji ? wk.toRomaji(reading) : reading;
      if (token.pos === '助詞') {
        romaji = ({ 'は': 'wa', 'へ': 'e', 'を': 'o' })[token.surface] || romaji;
      }
      if (token.pos === '空白') return { ...token, furigana: '', romaji: '' };
      return { ...token, furigana, romaji };
    }
    function validated(text, response) {
      if (!response || !Array.isArray(response.tokens) || response.tokens.length > text.length) return null;
      let offset = 0;
      const tokens = [];
      for (const token of response.tokens) {
        if (!token || token.start !== offset || !Number.isInteger(token.end) || token.end <= offset ||
            token.end > text.length || typeof token.surface !== 'string' || text.slice(offset, token.end) !== token.surface ||
            typeof token.reading !== 'string' || token.reading.length > 16384 || typeof token.baseForm !== 'string' ||
            typeof token.pos !== 'string') return null;
        if (token.morphemes !== undefined) {
          if (!Array.isArray(token.morphemes) || !token.morphemes.length || token.morphemes.some(piece => piece?.morphemes !== undefined)) return null;
          const pieces = validated(token.surface, { tokens: token.morphemes.map(piece => piece && ({
            ...piece, start: piece.start - token.start, end: piece.end - token.start,
          })) });
          if (!pieces) return null;
        }
        tokens.push(readingToken(token));
        offset = token.end;
      }
      return offset === text.length ? tokens : null;
    }
    function cached(text) {
      const value = cache.get(text);
      if (value) { cache.delete(text); cache.set(text, value); }
      return value || null;
    }
    function request(text) {
      if (typeof text !== 'string' || !text.trim() || text.length > 4096) return Promise.resolve(null);
      const existing = cached(text);
      if (existing) return Promise.resolve(existing);
      if (pending.has(text)) return pending.get(text);
      if (now() < cooldown || pending.size >= 32) return Promise.resolve(null);
      const revision = generation;
      const promise = Promise.resolve().then(() => send(text)).then(response => {
        if (revision !== generation) return null;
        const tokens = validated(text, response);
        if (!tokens) { cooldown = now() + 2000; return null; }
        cache.set(text, tokens);
        while (cache.size > 256) cache.delete(cache.keys().next().value);
        return tokens;
      }).catch(() => { if (revision === generation) cooldown = now() + 2000; return null; })
        .finally(() => { if (pending.get(text) === promise) pending.delete(text); });
      pending.set(text, promise);
      return promise;
    }
    function romaji(text, target = '') {
      const tokens = cached(text);
      if (!tokens) return null;
      const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
      const parts = [];
      for (const token of tokens) {
        if (!token.surface.trim()) continue;
        const value = escape(token.romaji);
        if (token.pos === '補助記号') {
          if (parts.length) parts[parts.length - 1] += value;
          else parts.push(value);
        } else {
          parts.push(target && token.surface.includes(target)
            ? `<span style="color:#fda4af; font-weight:bold; background:rgba(253,164,175,0.18); padding:0 3px; border-radius:3px;">${value}</span>` : value);
        }
      }
      return parts.join(' ');
    }
    return { cached, request, readingToken, romaji,
      retry() { cooldown = 0; },
      reset() { generation++; cache.clear(); pending.clear(); cooldown = 0; },
    };
  }
  const api = { create };
  root.LinguaPlayParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
