/**
 * LinguaPlay Chrome Extension — Anki Integration Module (anki.js)
 * Dual-pipeline:
 * 1. Direct AnkiConnect (http://127.0.0.1:8765)
 * 2. Extension Local Storage & TSV Export / Server Bookmark (/api/bookmark)
 */

const ANKICONNECT_URL = 'http://127.0.0.1:8765';
const DEFAULT_DECK_NAME = 'LinguaPlay';
const DEFAULT_SERVER_URL = 'http://127.0.0.1:8000';

function highlightWord(sentence, word) {
  if (!sentence || !word) return sentence || '';
  const parts = sentence.split(word);
  return parts.join(`<b style="color: #a78bfa;">${word}</b>`);
}

async function getDeckName() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(['linguaplay_anki_deck']);
      if (res.linguaplay_anki_deck) return res.linguaplay_anki_deck;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('linguaplay_anki_deck') || DEFAULT_DECK_NAME;
    }
  } catch (e) { /* ignore */ }
  return DEFAULT_DECK_NAME;
}

async function syncToAnkiConnect(frontText, backHTML, tags = ['linguaplay', 'immersion']) {
  const deck = await getDeckName();
  
  // Ensure deck exists
  await fetch(ANKICONNECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'createDeck',
      version: 6,
      params: { deck }
    })
  });

  const payload = {
    action: 'addNote',
    version: 6,
    params: {
      note: {
        deckName: deck,
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

async function saveToExtensionStorage(card) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(['linguaplay_cards']);
      const cards = res.linguaplay_cards || [];
      cards.push({ ...card, date: new Date().toISOString() });
      await chrome.storage.local.set({ linguaplay_cards: cards });
      return cards.length;
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('linguaplay_cards');
      const cards = raw ? JSON.parse(raw) : [];
      cards.push({ ...card, date: new Date().toISOString() });
      localStorage.setItem('linguaplay_cards', JSON.stringify(cards));
      return cards.length;
    }
  } catch (e) {
    console.warn('[Anki] Could not save card to extension storage:', e);
  }
  return 0;
}

async function tryServerBookmark(cardData) {
  try {
    const res = await fetch(`${DEFAULT_SERVER_URL}/api/bookmark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cardData),
      signal: AbortSignal.timeout(1500)
    });
    if (res.ok) return await res.json();
  } catch (e) {
    // server not running
  }
  return null;
}

export async function addQuickCard({ word, reading, romaji, meaning, sentence, sentenceRomaji }) {
  const frontText = `${word} ${reading && reading !== word ? `[${reading}]` : ''}<br><span style="font-size: 0.8em; color: #94a3b8;">${romaji || ''}</span>`.trim();

  let backHTML = `<div><strong>Meaning:</strong> ${meaning || ''}</div><br>`;
  if (sentence) {
    backHTML += `<div><strong>Context Sentence:</strong> ${highlightWord(sentence, word)}<br><span style="font-size: 0.85em; color: #94a3b8;">${sentenceRomaji || ''}</span></div><br>`;
  }

  // 1. Try AnkiConnect
  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AnkiConnect timeout')), 2000));
    await Promise.race([
      syncToAnkiConnect(frontText, backHTML, ['linguaplay', 'immersion', 'quick-add']),
      timeoutPromise
    ]);

    await saveToExtensionStorage({ word, reading, meaning, sentence, type: 'quick' });

    return {
      success: true,
      target: 'ankiconnect',
      message: 'Added directly to Anki deck!'
    };
  } catch (ankiErr) {
    console.warn('[Anki] AnkiConnect offline, saving to extension collection:', ankiErr.message);

    // 2. Try Local Server
    await tryServerBookmark({ word, reading, meaning, sentence });

    // 3. Save to Extension Storage
    const total = await saveToExtensionStorage({ word, reading, meaning, sentence, type: 'quick' });

    return {
      success: true,
      target: 'storage',
      message: `Saved to LinguaPlay Card Collection (${total} cards). You can export TSV anytime.`
    };
  }
}

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
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AnkiConnect timeout')), 2000));
    await Promise.race([
      syncToAnkiConnect(frontText, backHTML, ['linguaplay', 'immersion', 'ai-breakdown']),
      timeoutPromise
    ]);

    await saveToExtensionStorage({ word, reading, meaning: aiData.meaning, sentence, aiData, type: 'ai' });

    return {
      success: true,
      target: 'ankiconnect',
      message: 'AI card added directly to Anki deck!'
    };
  } catch (ankiErr) {
    console.warn('[Anki] AnkiConnect offline, saving to extension collection:', ankiErr.message);

    await tryServerBookmark({
      word,
      reading,
      meaning: `${aiData.meaning || ''} [Grammar: ${aiData.grammar_role || ''}]`,
      sentence
    });

    const total = await saveToExtensionStorage({ word, reading, meaning: aiData.meaning, sentence, aiData, type: 'ai' });

    return {
      success: true,
      target: 'storage',
      message: `Saved AI card to LinguaPlay Collection (${total} cards).`
    };
  }
}

export async function getStoredCards() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(['linguaplay_cards']);
      return res.linguaplay_cards || [];
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('linguaplay_cards');
      return raw ? JSON.parse(raw) : [];
    }
  } catch (e) { /* ignore */ }
  return [];
}

export function exportCardsAsTSV(cards) {
  if (!cards || cards.length === 0) return '';
  let tsv = "#separator:Tab\n#html:true\n#deck:LinguaPlay Japanese Immersion\n";
  cards.forEach(c => {
    const sent = (c.sentence || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
    const word = (c.word || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
    const reading = (c.reading || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
    const meaning = (c.meaning || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
    const boldSent = word && sent.includes(word) ? sent.replace(word, `<b>${word}</b>`) : sent;
    tsv += `${boldSent}\t${word}\t${reading}\t${meaning}\n`;
  });
  return tsv;
}
