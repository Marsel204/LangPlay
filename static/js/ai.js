/**
 * LinguaPlay — AI Analysis Module (ai.js)
 * Multi-provider AI linguistic tutor:
 * 1. Antigravity CLI ('agy') - Zero configuration local engine
 * 2. Google Gemini API - Direct/backend Gemini 2.5 Flash
 * 3. OpenRouter API - Streaming DeepSeek/Claude
 */

import { toRomaji } from './tokenizer.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash';

const LS_AI_PROVIDER = 'linguaplay_ai_provider';
const LS_OPENROUTER_KEY = 'linguaplay_openrouter_key';
const LS_GEMINI_KEY = 'linguaplay_gemini_key';

let activeAbortController = null;
let currentProvider = 'antigravity'; // 'antigravity' | 'gemini' | 'openrouter'
let antigravityAvailable = false;

try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem) {
    currentProvider = localStorage.getItem(LS_AI_PROVIDER) || 'antigravity';
  }
} catch (e) { /* ignore */ }

/**
 * Check backend Antigravity CLI status
 * @returns {Promise<{available: boolean, path: string|null}>}
 */
export async function checkAntigravityStatus() {
  try {
    const res = await fetch('/api/ai/status');
    if (res.ok) {
      const data = await res.json();
      antigravityAvailable = !!data.antigravity_available;
      if (antigravityAvailable && !localStorage.getItem(LS_AI_PROVIDER)) {
        currentProvider = 'antigravity';
      }
      return { available: antigravityAvailable, path: data.antigravity_path };
    }
  } catch (e) {
    console.warn('[AI] Could not check Antigravity CLI status:', e);
  }
  return { available: false, path: null };
}

export function getAIProvider() {
  return currentProvider;
}

export function setAIProvider(provider) {
  if (['antigravity', 'gemini', 'openrouter'].includes(provider)) {
    currentProvider = provider;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.setItem) {
        localStorage.setItem(LS_AI_PROVIDER, provider);
      }
    } catch (e) { /* ignore */ }
  }
  return currentProvider;
}

export function isAntigravityAvailable() {
  return antigravityAvailable;
}

/**
 * Load saved API key for active provider from localStorage
 * @returns {string}
 */
export function getSavedApiKey(provider = null) {
  const p = provider || currentProvider;
  try {
    if (typeof localStorage === 'undefined' || !localStorage.getItem) return '';
    if (p === 'gemini') return localStorage.getItem(LS_GEMINI_KEY) || '';
    if (p === 'openrouter') return localStorage.getItem(LS_OPENROUTER_KEY) || '';
  } catch (e) { /* ignore */ }
  return '';
}

/**
 * Save API key for active provider to localStorage
 * @param {string} key
 * @param {string} provider
 */
export function saveApiKey(key, provider = null) {
  const p = provider || currentProvider;
  const trimmed = (key || '').trim();
  try {
    if (typeof localStorage === 'undefined' || !localStorage.setItem) return;
    const lsKey = p === 'gemini' ? LS_GEMINI_KEY : LS_OPENROUTER_KEY;
    if (trimmed) {
      localStorage.setItem(lsKey, trimmed);
    } else {
      localStorage.removeItem(lsKey);
    }
  } catch (e) {
    console.warn('[AI] Could not save API key:', e);
  }
}

/**
 * Abort any ongoing AI generation
 */
export function abortAIAnalysis() {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

/**
 * Build system prompt for Japanese pedagogical analysis with strict Romaji requirements
 */
function buildSystemPrompt() {
  return `You are an expert Japanese linguist and immersion tutor.
Analyze the target word/token in the given context sentence for a language learner.
IMPORTANT: Provide accurate Romaji transcriptions for the target word, all base forms, every sentence breakdown segment, and any Japanese words mentioned.

Respond with ONLY a raw JSON object (no markdown fences, no backticks, no introductory text).

Required JSON structure:
{
  "meaning": "Clear, concise definition of the word as used in this specific context",
  "reading": "Hiragana reading of the word (e.g. かなしま)",
  "romaji": "Accurate Romaji transcription of the word (e.g. kanashima)",
  "jlpt_level": "N5 | N4 | N3 | N2 | N1 | unknown",
  "formality": "casual | polite | formal | slang | neutral",
  "grammar_role": "Explain how this word functions grammatically in this sentence (include romaji in parentheses for Japanese words)",
  "conjugation": {
    "form": "e.g. Negative Stem (未然形, Mizenkei) (or null if not applicable)",
    "from_base": "Base dictionary form of the verb/adjective (e.g. 悲しむ)",
    "from_base_reading": "Hiragana reading of base form (e.g. かなしむ)",
    "from_base_romaji": "Romaji reading of base form (e.g. kanashimu)",
    "explanation": "Brief explanation of how the base morphed into this form (include romaji for transformed sounds)"
  },
  "sentence_breakdown": [
    {
      "word": "Segment Japanese (e.g. 悲しま)",
      "reading": "Hiragana reading (e.g. かなしま)",
      "romaji": "Romaji transcription (e.g. kanashima)",
      "meaning": "English gloss (e.g. feel sad / grieve)",
      "role": "Grammar function (e.g. negative verb stem)",
      "is_target": true
    }
  ],
  "nuance": "Cultural, emotional, or conversational nuance of this word in real-world spoken Japanese (include romaji for Japanese terms)",
  "example": {
    "jp": "A natural, simple Japanese sentence using this word",
    "reading": "Hiragana reading of example sentence",
    "romaji": "Accurate Romaji transcription",
    "en": "Natural English translation"
  }
}`;
}

/**
 * Helper to compute Romaji with robust fallbacks
 */
function resolveRomaji(explicitRomaji, reading, surface) {
  if (explicitRomaji && explicitRomaji.trim()) {
    return explicitRomaji.trim();
  }
  if (typeof window !== 'undefined' && window.wanakana) {
    if (reading && reading.trim()) {
      return window.wanakana.toRomaji(reading.trim());
    }
    if (surface && surface.trim() && /^[\u3040-\u309F\u30A0-\u30FF\s]+$/.test(surface.trim())) {
      return window.wanakana.toRomaji(surface.trim());
    }
  }
  return '';
}

/**
 * Request AI analysis from the selected provider (Antigravity CLI, Gemini, or OpenRouter)
 * @param {object} params
 * @param {string} params.word - Target word
 * @param {string} params.romaji - Romaji
 * @param {string} params.sentence - Context sentence
 * @param {string} [params.provider] - 'antigravity' | 'gemini' | 'openrouter'
 * @param {string} [params.apiKey] - API key (if needed)
 * @param {Function} params.onChunk - Progress/streaming text callback
 * @param {Function} params.onSuccess - Success callback with parsed JSON
 * @param {Function} params.onError - Error callback with error message
 */
export async function requestAIAnalysis({ word, romaji, sentence, provider = null, apiKey = null, onChunk, onSuccess, onError }) {
  abortAIAnalysis();
  const activeProv = provider || currentProvider;

  activeAbortController = new AbortController();
  const signal = activeAbortController.signal;

  // ══════════════════════════════════════════════════════════════════════
  // 1. Antigravity CLI / Local Server Engine (No API Key Required!)
  // ══════════════════════════════════════════════════════════════════════
  if (activeProv === 'antigravity') {
    if (onChunk) onChunk('🤖 Invoking Google Antigravity CLI (agy) for linguistic breakdown…');
    try {
      const response = await fetch('/api/ai/analyze', {
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
      onError(err.message || 'Antigravity CLI analysis failed. You can switch to Gemini API or OpenRouter in the top bar.');
    } finally {
      activeAbortController = null;
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════
  // 2. Google Gemini API
  // ══════════════════════════════════════════════════════════════════════
  if (activeProv === 'gemini') {
    const key = apiKey || getSavedApiKey('gemini');
    if (!key) {
      onError('Please provide a Google Gemini API key (AIzaSy...) in the top bar to enable Gemini explanations.');
      return;
    }

    if (onChunk) onChunk('🌟 Requesting Google Gemini 2.5 Flash breakdown…');
    try {
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'gemini',
          apiKey: key,
          word,
          romaji: romaji || '',
          sentence: sentence || word
        }),
        signal
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || `Gemini API error (${response.status})`);
      }

      const resData = await response.json();
      if (resData.status === 'success' && resData.data) {
        onSuccess(resData.data);
      } else {
        throw new Error(resData.message || 'Malformed Gemini API response');
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      onError(err.message || 'Gemini API call failed. Verify your API key.');
    } finally {
      activeAbortController = null;
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════
  // 3. OpenRouter Streaming (DeepSeek)
  // ══════════════════════════════════════════════════════════════════════
  const key = apiKey || getSavedApiKey('openrouter');
  if (!key) {
    onError('Please provide an OpenRouter API key (sk-or-...) in the top bar to enable DeepSeek explanations.');
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
        'HTTP-Referer': window.location.origin || 'http://127.0.0.1:8000',
        'X-Title': 'LinguaPlay Japanese Immersion'
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
 * Render structured cards from AI analysis data into DOM container with comprehensive Romaji
 * @param {object} data - Parsed AI JSON
 * @param {string} clickedWord - Target word
 * @param {HTMLElement} container - DOM Container
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

  // 1. Meaning & JLPT Badges (with Romaji)
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

  // 3. Conjugation (with Romaji on Base Form)
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

  // 4. Sentence Breakdown (with Romaji on EVERY segment)
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

  // 6. Example Sentence (with Romaji)
  if (data.example && data.example.jp) {
    const exRomaji = resolveRomaji(data.example.romaji, data.example.reading, data.example.jp);
    addCard('💬', 'bg-violet-500/12', 'Example', 'text-violet-400',
      `<p class="jp-inline text-base leading-relaxed">${data.example.jp}</p>
       ${exRomaji ? `<p class="text-xs font-mono text-rose-subtle/80 mt-1">${exRomaji}</p>` : ''}
       <p class="text-slate-300 text-xs mt-1.5 leading-relaxed">${data.example.en || ''}</p>`
    );
  }
}
