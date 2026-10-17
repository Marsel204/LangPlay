import parserModule from '../../../extension/js/japanese-parser.js';
import wanakana from '../../../extension/lib/wanakana.min.js';
import { JDICT } from '../../../extension/js/dict.js';

const endpoint = 'http://127.0.0.1:8765';
export function createServices({ fetch, save } = {}) {
  async function post(path, body, timeout = 8) {
    let response;
    try { response = await fetch(`${endpoint}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), timeout }); }
    catch { throw new Error('LangPlay companion unavailable at 127.0.0.1:8765.'); }
    if (!response.ok) throw new Error(`Companion request failed (${response.status}).`);
    const value = await response.json();
    if (value?.status !== 'success') throw new Error('Companion could not complete this request.');
    return value;
  }
  const parser = parserModule.create({ wanakana, transport: text => post('/api/parse', { text }) });
  return {
    async parse(text) {
      const result = await parser.request(text);
      if (!result) throw new Error('Japanese parser unavailable. Start the LangPlay companion and try again.');
      return result;
    },
    cached: text => parser.cached(text),
    async lookup({ surface, baseForm }) { return { meaning: JDICT[baseForm] || JDICT[surface] || '' }; },
    async explain(context) {
      const value = await post('/api/ai/analyze', { word: context.surface, sentence: context.sentence, romaji: context.reading || '', provider: 'antigravity' }, 60);
      return { explanation: typeof value.data === 'string' ? value.data : JSON.stringify(value.data, null, 2) };
    },
    async chat(context) {
      return post('/api/ai/chat', { word: context.surface, sentence: context.sentence, romaji: context.reading || '',
        messages: [{ role: 'user', content: context.question }] }, 60);
    },
    save,
  };
}
