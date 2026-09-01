/**
 * LinguaPlay Chrome Extension — AI Analysis Module (ai.js)
 * Multi-provider AI linguistic tutor:
 * 1. Antigravity CLI (via Local Server http://127.0.0.1:8000)
 * 2. Google Gemini 2.5 Flash (Direct in-browser API & Local Server)
 * 3. OpenRouter DeepSeek (Streaming API)
 */

import { toRomaji } from './tokenizer.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const DEFAULT_LOCAL_SERVER = 'http://127.0.0.1:8000';

const LS_AI_PROVIDER = 'linguaplay_ai_provider';
const LS_OPENROUTER_KEY = 'linguaplay_openrouter_key';
const LS_GEMINI_KEY = 'linguaplay_gemini_key';
const LS_SERVER_URL = 'linguaplay_server_url';

let activeAbortController = null;
let currentProvider = 'antigravity'; // 'antigravity' | 'gemini' | 'openrouter'
let antigravityAvailable = false;
let customServerUrl = DEFAULT_LOCAL_SERVER;

// Load initial settings from chrome.storage or localStorage
try {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([LS_AI_PROVIDER, LS_SERVER_URL], (res) => {
      if (res[LS_AI_PROVIDER]) currentProvider = res[LS_AI_PROVIDER];
      if (res[LS_SERVER_URL]) customServerUrl = res[LS_SERVER_URL];
    });
  } else if (typeof localStorage !== 'undefined') {
    currentProvider = localStorage.getItem(LS_AI_PROVIDER) || 'antigravity';
    customServerUrl = localStorage.getItem(LS_SERVER_URL) || DEFAULT_LOCAL_SERVER;
  }
} catch (e) { /* ignore */ }

export async function checkAntigravityStatus() {
  try {
    const serverUrl = customServerUrl || DEFAULT_LOCAL_SERVER;
    const res = await fetch(`${serverUrl}/api/ai/status`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      antigravityAvailable = !!data.antigravity_available;
      if (antigravityAvailable && currentProvider === 'antigravity') {
        return { available: true, path: data.antigravity_path };
      }
      return { available: antigravityAvailable, path: data.antigravity_path };
    }
  } catch (e) {
    // Local server offline
  }
  antigravityAvailable = false;
  return { available: false, path: null };
}

export function getAIProvider() {
  return currentProvider;
}

export function setAIProvider(provider) {
  if (['antigravity', 'gemini', 'openrouter'].includes(provider)) {
    currentProvider = provider;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [LS_AI_PROVIDER]: provider });
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LS_AI_PROVIDER, provider);
      }
    } catch (e) { /* ignore */ }
  }
  return currentProvider;
}

export function isAntigravityAvailable() {
  return antigravityAvailable;
}

export async function getSavedApiKey(provider = null) {
  const p = provider || currentProvider;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const keyName = p === 'gemini' ? LS_GEMINI_KEY : LS_OPENROUTER_KEY;
      const res = await chrome.storage.local.get([keyName]);
      if (res[keyName]) return res[keyName];
    }
    if (typeof localStorage !== 'undefined') {
      if (p === 'gemini') return localStorage.getItem(LS_GEMINI_KEY) || '';
      if (p === 'openrouter') return localStorage.getItem(LS_OPENROUTER_KEY) || '';
    }
  } catch (e) { /* ignore */ }
  return '';
}

export function saveApiKey(key, provider = null) {
  const p = provider || currentProvider;
  const trimmed = (key || '').trim();
  const keyName = p === 'gemini' ? LS_GEMINI_KEY : LS_OPENROUTER_KEY;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [keyName]: trimmed });
    }
    if (typeof localStorage !== 'undefined') {
      if (trimmed) {
        localStorage.setItem(keyName, trimmed);
      } else {
        localStorage.removeItem(keyName);
      }
    }
  } catch (e) { /* ignore */ }
}

export function abortAIAnalysis() {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

function buildSystemPrompt() {
  return `You are an expert Japanese immersion tutor.
Focus strictly on HOW THE TARGET WORD FITS INTO THIS SPECIFIC CONTEXT SENTENCE.
Do NOT give generic dictionary essays or unrelated examples.

Requirements:
1. Provide accurate Romaji transcriptions for the target word and any Japanese words referenced.
2. Explain the exact grammatical connection and syntactic role of this word in THIS sentence (how it links with preceding and following words/particles).
3. Translate the full context sentence.

Respond with ONLY a raw JSON object (no markdown fences, no backticks):
{
  "contextual_meaning": "Precise meaning of the target word specifically in this sentence",
  "reading": "Hiragana reading of the word",
  "romaji": "Romaji transcription of the word",
  "jlpt_level": "N5|N4|N3|N2|N1|Vocab",
  "pos": "Part of speech in this sentence",
  "sentence_fit": {
    "phrase_connection": "How the word connects to surrounding words in this line (e.g. 書架の → 隙間に → 住まう)",
    "role_in_sentence": "Direct syntactic function in this sentence (e.g. Locative noun marked by に (ni), specifying where the subject dwells)",
    "context_nuance": "Specific contextual nuance of the word in this sentence (1-2 concise sentences, no generic trivia)"
  },
  "conjugation": {
    "is_conjugated": false,
    "form": "Inflection form name or null",
    "base_form": "Base dictionary form",
    "explanation": "Why this specific inflection/form is used in this clause"
  },
  "sentence_translation": {
    "jp": "Context sentence",
    "en": "Natural English translation of this entire context sentence"
  }
}`;
}

function resolveRomaji(explicitRomaji, reading, surface) {
  if (explicitRomaji && explicitRomaji.trim()) return explicitRomaji.trim();
  if (typeof window !== 'undefined' && window.wanakana) {
    if (reading && reading.trim()) return window.wanakana.toRomaji(reading.trim());
    if (surface && surface.trim() && /^[\u3040-\u309F\u30A0-\u30FF\s]+$/.test(surface.trim())) {
      return window.wanakana.toRomaji(surface.trim());
    }
  }
  return '';
}

/**
 * Request AI analysis from selected provider
 */
export async function requestAIAnalysis({ word, romaji, sentence, provider = null, apiKey = null, onChunk, onSuccess, onError }) {
  abortAIAnalysis();
  const activeProv = provider || currentProvider;

  activeAbortController = new AbortController();
  const signal = activeAbortController.signal;

  // 1. Antigravity CLI / Local Server
  if (activeProv === 'antigravity') {
    if (onChunk) onChunk('🤖 Invoking Local Antigravity CLI (agy) via server…');
    try {
      const serverUrl = customServerUrl || DEFAULT_LOCAL_SERVER;
      const response = await fetch(`${serverUrl}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'antigravity',
          word,
          romaji: romaji || '',
          sentence: sentence || word
        }),
        signal
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || `Server error (${response.status})`);
      }

      const resData = await response.json();
      if (resData.status === 'success' && resData.data) {
        onSuccess(resData.data);
      } else {
        throw new Error(resData.message || 'Malformed AI response');
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      onError(err.message || 'Local Antigravity Server not running. Start Server.py or switch to Gemini API in options.');
    } finally {
      activeAbortController = null;
    }
    return;
  }

  // 2. Google Gemini 2.5 Flash API (Direct or via Server)
  if (activeProv === 'gemini') {
    const key = apiKey || await getSavedApiKey('gemini');
    if (!key) {
      onError('Please provide a Google Gemini API key (AIzaSy...) in the top bar or Options page to enable Gemini explanations.');
      return;
    }

    if (onChunk) onChunk('🌟 Requesting Google Gemini 2.5 Flash breakdown…');
    try {
      const prompt = `${buildSystemPrompt()}\n\nContext Sentence: "${sentence || word}"\nTarget Word: "${word}" (Reading: ${romaji || ''})`;
      const url = `${GEMINI_API_URL}?key=${encodeURIComponent(key.trim())}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        }),
        signal
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Gemini API error (${response.status})`);
      }

      const resData = await response.json();
      const contentText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!contentText) throw new Error('Empty response from Gemini API');

      let cleanJson = contentText.trim();
      if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/```$/, '');
      if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```\s*/, '').replace(/```$/, '');

      const parsedData = JSON.parse(cleanJson);
      onSuccess(parsedData);
    } catch (err) {
      if (err.name === 'AbortError') return;
      onError(err.message || 'Gemini API call failed. Verify your API key.');
    } finally {
      activeAbortController = null;
    }
    return;
  }

  // 3. OpenRouter Streaming (DeepSeek)
  const key = apiKey || await getSavedApiKey('openrouter');
  if (!key) {
    onError('Please provide an OpenRouter API key (sk-or-...) to enable DeepSeek explanations.');
    return;
  }

  const userPrompt = `Context Sentence: "${sentence || word}"
Target Word: "${word}" (Reading: ${romaji || ''})
Please provide an in-depth linguistic and grammatical breakdown with full Romaji transcriptions in JSON format.`;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/Marsel204/LangPlay',
        'X-Title': 'LinguaPlay Japanese Immersion Chrome Extension'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: userPrompt }
        ],
        stream: true,
        temperature: 0.2
      }),
      signal
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `API Error (${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error && errJson.error.message) {
          errorMsg = errJson.error.message;
        }
      } catch (e) { /* ignore */ }
      onError(errorMsg);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let accumulatedText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.replace(/^data:\s*/, '');
        if (jsonStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            accumulatedText += delta;
            if (onChunk) onChunk(accumulatedText);
          }
        } catch (e) { /* ignore */ }
      }
    }

    let cleanJson = accumulatedText.trim();
    if (cleanJson.startsWith('```json')) cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/```$/, '');
    if (cleanJson.startsWith('```')) cleanJson = cleanJson.replace(/^```\s*/, '').replace(/```$/, '');

    try {
      const parsedData = JSON.parse(cleanJson);
      onSuccess(parsedData);
    } catch (e) {
      const match = cleanJson.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const recovered = JSON.parse(match[0]);
          onSuccess(recovered);
          return;
        } catch (e2) { /* fail */ }
      }
      onError(`Failed to parse AI response as JSON: ${e.message}`);
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    onError(`Network or server error: ${err.message}`);
  } finally {
    activeAbortController = null;
  }
}

/**
 * Render structured cards from AI analysis data into DOM container
 */
export function renderAICards(data, clickedWord, container) {
  if (!container || !data) return;
  container.innerHTML = '';
  let delay = 0;

  function addCard(icon, iconBg, label, labelColor, bodyHTML) {
    const card = document.createElement('div');
    card.className = 'ai-card ai-card-wrapper';
    card.style.animationDelay = `${delay}ms`;
    delay += 70;

    card.innerHTML = `
      <div class="ai-card-header">
        <div class="ai-card-icon ${iconBg}">${icon}</div>
        <span class="ai-card-label ${labelColor}">${label}</span>
      </div>
      <div class="ai-card-body">${bodyHTML}</div>
    `;
    container.appendChild(card);
  }

  // 1. Meaning & JLPT Badges
  const badges = [];
  if (data.jlpt_level && data.jlpt_level !== 'unknown') {
    badges.push(`<span class="ai-badge badge-jlpt">${data.jlpt_level}</span>`);
  }
  if (data.formality && data.formality !== 'neutral') {
    badges.push(`<span class="ai-badge badge-formality">${data.formality}</span>`);
  }
  const badgeRow = badges.length ? `<div class="flex gap-2 mt-2">${badges.join('')}</div>` : '';

  const wordRomaji = resolveRomaji(data.romaji, data.reading, clickedWord);
  const readingParts = [];
  if (data.reading) readingParts.push(data.reading);
  if (wordRomaji && wordRomaji !== data.reading) readingParts.push(wordRomaji);
  const readingLine = readingParts.length > 0 ? `<span class="text-rose-subtle font-mono text-xs ml-2">(${readingParts.join(' • ')})</span>` : '';

  addCard('📖', 'bg-accent/15', 'Meaning', 'text-accent-light',
    `<p class="text-[15px] text-slate-200 font-medium"><span class="jp-inline">${clickedWord}</span>${readingLine}</p>
     <p class="mt-1 leading-relaxed">${data.meaning || '—'}</p>
     ${badgeRow}`
  );

  // 2. Grammar Role
  if (data.grammar_role) {
    addCard('⚙️', 'bg-sky-500/12', 'Grammar Role', 'text-sky-400',
      `<p class="leading-relaxed">${data.grammar_role}</p>`
    );
  }

  // 3. Conjugation
  if (data.conjugation && (data.conjugation.form || data.conjugation.from_base)) {
    const conjParts = [];
    if (data.conjugation.form) {
      conjParts.push(`<span class="ai-badge badge-conjugation">${data.conjugation.form}</span>`);
    }
    if (data.conjugation.from_base) {
      const baseRomaji = resolveRomaji(data.conjugation.from_base_romaji, data.conjugation.from_base_reading, data.conjugation.from_base);
      const baseReadingParts = [];
      if (data.conjugation.from_base_reading) baseReadingParts.push(data.conjugation.from_base_reading);
      if (baseRomaji && baseRomaji !== data.conjugation.from_base_reading) baseReadingParts.push(baseRomaji);
      const baseExtra = baseReadingParts.length > 0 ? ` <span class="text-rose-subtle font-mono text-xs">(${baseReadingParts.join(' • ')})</span>` : '';

      conjParts.push(`<p class="mt-2 text-slate-300">Base form: <span class="jp-inline text-base">${data.conjugation.from_base}</span>${baseExtra}</p>`);
    }
    if (data.conjugation.explanation) {
      conjParts.push(`<p class="mt-1 text-slate-400 text-xs leading-relaxed">${data.conjugation.explanation}</p>`);
    }
    addCard('🔄', 'bg-emerald-500/12', 'Conjugation', 'text-emerald-400', conjParts.join(''));
  }

  // 4. Sentence Breakdown
  if (data.sentence_breakdown && data.sentence_breakdown.length > 0) {
    const segments = data.sentence_breakdown.map(seg => {
      const hl = seg.is_target ? ' breakdown-highlight' : '';
      const segRomaji = resolveRomaji(seg.romaji, seg.reading, seg.word);
      const romajiTag = segRomaji ? `<span class="breakdown-romaji">${segRomaji}</span>` : '';

      return `<span class="breakdown-segment${hl}" title="${seg.role || ''}">
        <span class="breakdown-jp">${seg.word}</span>
        ${romajiTag}
        <span class="breakdown-en">${seg.meaning || ''}</span>
      </span>`;
    }).join('');

    addCard('🧩', 'bg-amber-500/12', 'Sentence Breakdown', 'text-amber-400',
      `<div class="flex flex-wrap items-end gap-1 mt-1">${segments}</div>`
    );
  }

  // 5. Nuance
  if (data.nuance) {
    addCard('💡', 'bg-rose-500/12', 'Nuance & Usage', 'text-rose-300',
      `<p class="italic text-slate-300/90 leading-relaxed">${data.nuance}</p>`
    );
  }

  // 6. Example Sentence
  if (data.example && data.example.jp) {
    const exRomaji = resolveRomaji(data.example.romaji, data.example.reading, data.example.jp);
    addCard('💬', 'bg-violet-500/12', 'Example', 'text-violet-400',
      `<p class="jp-inline text-base leading-relaxed">${data.example.jp}</p>
       ${exRomaji ? `<p class="text-xs font-mono text-rose-subtle/80 mt-1">${exRomaji}</p>` : ''}
       <p class="text-slate-300 text-xs mt-1.5 leading-relaxed">${data.example.en || ''}</p>`
    );
  }
}
