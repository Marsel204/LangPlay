/**
 * LinguaPlay — Anki Integration Module (anki.js)
 * Dual pipeline: Direct AnkiConnect (localhost:8765) with automatic fallback
 * to Server-side TSV bookmarking (/api/bookmark -> anki_cards.txt).
 */

const ANKICONNECT_URL = 'http://127.0.0.1:8765';
const DECK_NAME = 'LinguaPlay';

/**
 * Highlight a word inside a context sentence
 */
function highlightWord(sentence, word) {
  if (!sentence || !word) return sentence || '';
  const parts = sentence.split(word);
  return parts.join(`<b style="color: #a78bfa;">${word}</b>`);
}

/**
 * Add a note directly via AnkiConnect
 */
async function syncToAnkiConnect(frontText, backHTML, tags = ['linguaplay', 'immersion']) {
  // Ensure deck exists
  await fetch(ANKICONNECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'createDeck',
      version: 6,
      params: { deck: DECK_NAME }
    })
  });

  const payload = {
    action: 'addNote',
    version: 6,
    params: {
      note: {
        deckName: DECK_NAME,
        modelName: 'Basic',
        fields: {
          Front: frontText,
          Back: backHTML
        },
        tags
      }
    }
  };

  const res = await fetch(ANKICONNECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(`AnkiConnect HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  return data.result;
}

/**
 * Fallback: Save card to Server /api/bookmark (anki_cards.txt)
 */
async function saveToServerFile(cardData) {
  const res = await fetch('/api/bookmark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cardData)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Server bookmark failed: ${text}`);
  }

  return await res.json();
}

/**
 * Dual-pipeline export for a Quick Definition card
 * @param {object} params
 * @param {string} params.word - Target Japanese word
 * @param {string} params.reading - Hiragana/Katakana reading
 * @param {string} params.romaji - Romaji
 * @param {string} params.meaning - Definition / meaning HTML or text
 * @param {string} params.sentence - Context sentence
 * @param {string} params.sentenceRomaji - Context sentence in romaji
 * @returns {Promise<{success: boolean, target: 'ankiconnect'|'server_file', message: string}>}
 */
export async function addQuickCard({ word, reading, romaji, meaning, sentence, sentenceRomaji }) {
  const frontText = `${word} ${reading && reading !== word ? `[${reading}]` : ''}<br><span style="font-size: 0.8em; color: #94a3b8;">${romaji || ''}</span>`.trim();

  let backHTML = `<div><strong>Meaning:</strong> ${meaning || ''}</div><br>`;
  if (sentence) {
    backHTML += `<div><strong>Context Sentence:</strong> ${highlightWord(sentence, word)}<br><span style="font-size: 0.85em; color: #94a3b8;">${sentenceRomaji || ''}</span></div><br>`;
  }

  // 1. Try AnkiConnect
  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AnkiConnect timeout')), 2500));
    await Promise.race([
      syncToAnkiConnect(frontText, backHTML, ['linguaplay', 'immersion', 'quick-add']),
      timeoutPromise
    ]);

    return {
      success: true,
      target: 'ankiconnect',
      message: 'Added directly to Anki deck "LinguaPlay"!'
    };
  } catch (ankiErr) {
    console.warn('[Anki] AnkiConnect unavailable, falling back to server file:', ankiErr.message);

    // 2. Fallback to server file
    try {
      await saveToServerFile({
        word,
        reading: reading || '',
        meaning: meaning || '',
        sentence: sentence || ''
      });

      return {
        success: true,
        target: 'server_file',
        message: 'Saved to local anki_cards.txt (AnkiConnect was offline)'
      };
    } catch (fileErr) {
      throw new Error(`Both AnkiConnect and local file save failed: ${fileErr.message}`);
    }
  }
}

/**
 * Dual-pipeline export for an AI-Enriched card
 * @param {object} params
 * @param {string} params.word - Target Japanese word
 * @param {object} params.aiData - Full AI analysis JSON
 * @param {string} params.sentence - Context sentence
 * @returns {Promise<{success: boolean, target: 'ankiconnect'|'server_file', message: string}>}
 */
export async function addAICard({ word, aiData, sentence }) {
  const reading = aiData.reading || '';
  const frontText = `${word} ${reading && reading !== word ? `[${reading}]` : ''}<br><span style="font-size: 0.75em; color: #a78bfa;">${aiData.jlpt_level || ''} • ${aiData.formality || ''}</span>`.trim();

  let backHTML = `<div><strong>Meaning:</strong> ${aiData.meaning || ''}</div><br>`;
  if (aiData.grammar_role) {
    backHTML += `<div><strong>Grammar:</strong> ${aiData.grammar_role}</div><br>`;
  }
  if (aiData.conjugation && aiData.conjugation.form) {
    backHTML += `<div><strong>Conjugation:</strong> ${aiData.conjugation.form} (${aiData.conjugation.from_base || ''}) - ${aiData.conjugation.explanation || ''}</div><br>`;
  }
  if (sentence) {
    backHTML += `<div><strong>Context:</strong> ${highlightWord(sentence, word)}</div><br>`;
  }
  if (aiData.nuance) {
    backHTML += `<div><strong>Nuance:</strong> <em>${aiData.nuance}</em></div><br>`;
  }
  if (aiData.example && aiData.example.jp) {
    backHTML += `<div><strong>Example:</strong> ${aiData.example.jp}<br><span style="font-size: 0.85em; color: #94a3b8;">${aiData.example.en || ''}</span></div>`;
  }

  // 1. Try AnkiConnect
  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AnkiConnect timeout')), 2500));
    await Promise.race([
      syncToAnkiConnect(frontText, backHTML, ['linguaplay', 'immersion', 'ai-breakdown']),
      timeoutPromise
    ]);

    return {
      success: true,
      target: 'ankiconnect',
      message: 'AI card added directly to Anki deck "LinguaPlay"!'
    };
  } catch (ankiErr) {
    console.warn('[Anki] AnkiConnect unavailable, falling back to server file:', ankiErr.message);

    // 2. Fallback to server file
    try {
      await saveToServerFile({
        word,
        reading: reading || '',
        meaning: `${aiData.meaning || ''} [Grammar: ${aiData.grammar_role || ''}]`,
        sentence: sentence || ''
      });

      return {
        success: true,
        target: 'server_file',
        message: 'Saved to local anki_cards.txt (AnkiConnect was offline)'
      };
    } catch (fileErr) {
      throw new Error(`Both AnkiConnect and local file save failed: ${fileErr.message}`);
    }
  }
}
