import parserModule from '../../../extension/js/japanese-parser.js';
import wanakana from '../../../extension/lib/wanakana.min.js';
import { JDICT } from '../../../extension/js/dict.js';

const endpoint = 'http://127.0.0.1:8765';
export function createServices({ fetch, save } = {}) {
  let conversationKey = '', conversation = [];
  const translations = new Map(), translating = new Map();
  const meanings = new Map(), lookingUp = new Map();
  async function post(path, body, timeout = 8) {
    let response;
    try { response = await fetch(`${endpoint}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), timeout }); }
    catch { throw new Error(path.includes('/ai/') ? 'AI did not respond. Check your configured AI provider and try again. Japanese captions and local cards remain available.' : 'LangPlay companion unavailable at 127.0.0.1:8765.'); }
    const value = await Promise.resolve().then(() => response.json()).catch(() => null);
    if (!response.ok) throw new Error(typeof value?.message === 'string' ? value.message.slice(0,2000) : `Companion request failed (${response.status}).`);
    if (value?.status !== 'success') throw new Error('Companion could not complete this request.');
    return value;
  }
  const parser = parserModule.create({ wanakana, transport: text => post('/api/parse', { text }) });
  return {
    discoverSubtitles: data => post('/api/subtitles/auto', data, 55),
    savedSubtitles: data => post('/api/subtitles', data),
    async parse(text) {
      const result = await parser.request(text);
      if (!result) throw new Error('Japanese parser unavailable. Start the LangPlay companion and try again.');
      return result;
    },
    cached: text => parser.cached(text),
    async lookup({ surface, baseForm }) {
      const valid = word => typeof word === 'string' && word.trim() && word.length <= 256;
      const entry = key => valid(key) && Object.prototype.hasOwnProperty.call(JDICT, key) ? JDICT[key] : '';
      const local = entry(baseForm) || entry(surface);
      if (local) return { meaning: local };
      const word = valid(baseForm) ? baseForm.trim() : valid(surface) ? surface.trim() : '';
      if (!word) return { meaning: '' };
      if (meanings.has(word)) return { meaning: meanings.get(word) };
      if (lookingUp.has(word)) return lookingUp.get(word);
      if (lookingUp.size >= 4) return { meaning: '' };
      const work = (async () => {
        try {
          const value = await post('/api/dictionary', { word });
          if (typeof value.meaning !== 'string' || !value.meaning.trim() || value.meaning.length > 8192) return { meaning: '' };
          const meaning = value.meaning.trim();
          meanings.set(word, meaning);
          while (meanings.size > 256) meanings.delete(meanings.keys().next().value);
          return { meaning };
        } catch { return { meaning: '' }; }
      })();
      lookingUp.set(word, work);
      try { return await work; } finally { lookingUp.delete(word); }
    },
    async translate({sentence}) {
      if (typeof sentence !== 'string' || !sentence.trim() || sentence.length > 4096) throw new Error('Select a sentence of up to 4096 characters.');
      if (translations.has(sentence)) return {translation:translations.get(sentence)};
      if (translating.has(sentence)) return translating.get(sentence);
      if (translating.size >= 4) throw new Error('Several translations are pending. Wait briefly and retry.');
      const work = (async () => {
        const value = await post('/api/translate', {sentence});
        const translation = value.translation;
        if (typeof translation !== 'string' || !translation.trim() || translation.length > 8000) throw new Error('No usable English translation returned. Retry translation.');
        translations.set(sentence,translation.trim());
        while (translations.size > 128) translations.delete(translations.keys().next().value);
        return {translation:translation.trim()};
      })();
      translating.set(sentence,work);
      try { return await work; } finally { translating.delete(sentence); }
    },
    async explain(context) {
      const value = await post('/api/ai/analyze', { word: context.surface, sentence: context.sentence, romaji: context.romaji || context.reading || '' }, 60);
      const data = value.data;
      if (typeof data === 'string') return { explanation: data.slice(0, 24000) };
      const parts = [data?.contextual_meaning, data?.sentence_translation?.en,
        data?.sentence_fit?.phrase_connection, data?.sentence_fit?.role_in_sentence, data?.sentence_fit?.context_nuance,
        data?.conjugation?.is_conjugated ? data.conjugation.explanation : ''];
      if (Array.isArray(data?.word_by_word)) parts.push(data.word_by_word.slice(0, 100).map(w => `${w.word || ''} (${w.reading || w.romaji || ''}): ${w.meaning || ''}`).join('\n'));
      const explanation = parts.filter(p => typeof p === 'string' && p.trim()).join('\n\n').slice(0, 24000);
      if (!explanation) throw new Error('AI returned no explanation. Try again.');
      return { explanation };
    },
    async chat(context) {
      const key = JSON.stringify([context.clientId, context.playbackId, context.generation, context.surface, context.sentence]);
      if (key !== conversationKey) { conversationKey = key; conversation = []; }
      const user = { role: 'user', content: context.question };
      const value = await post('/api/ai/chat', { word: context.surface, sentence: context.sentence, romaji: context.romaji || context.reading || '',
        messages: [...conversation.slice(-10), user] }, 60);
      if (typeof value.reply !== 'string' || !value.reply.trim() || value.reply.length > 24000) throw new Error('AI returned an invalid answer. Try again.');
      if (key === conversationKey) conversation = [...conversation.slice(-10), user, { role: 'assistant', content: value.reply }];
      return value;
    },
    save,
  };
}
