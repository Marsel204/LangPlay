/**
 * LinguaPlay Chrome Extension — Options Script (options.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  const aiProvider = document.getElementById('ai-provider');
  const geminiKey = document.getElementById('gemini-key');
  const openrouterKey = document.getElementById('openrouter-key');
  const serverUrl = document.getElementById('server-url');
  const ankiDeck = document.getElementById('anki-deck');
  const ankiConnectUrl = document.getElementById('ankiconnect-url');
  const readingMode = document.getElementById('reading-mode');
  const savedCardCounter = document.getElementById('saved-card-counter');
  
  const testServerBtn = document.getElementById('test-server-btn');
  const serverStatusText = document.getElementById('server-status-text');
  const testAnkiBtn = document.getElementById('test-anki-btn');
  const ankiStatusText = document.getElementById('anki-status-text');
  
  const exportTsvBtn = document.getElementById('export-tsv-btn');
  const clearCardsBtn = document.getElementById('clear-cards-btn');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const saveToast = document.getElementById('save-toast');

  // 1. Load saved settings
  chrome.storage.local.get([
    'linguaplay_ai_provider',
    'linguaplay_gemini_key',
    'linguaplay_openrouter_key',
    'linguaplay_server_url',
    'linguaplay_anki_deck',
    'linguaplay_ankiconnect_url',
    'linguaplay_reading_mode',
    'linguaplay_cards'
  ], (res) => {
    aiProvider.value = res.linguaplay_ai_provider || 'antigravity';
    if (res.linguaplay_gemini_key) geminiKey.value = res.linguaplay_gemini_key;
    if (res.linguaplay_openrouter_key) openrouterKey.value = res.linguaplay_openrouter_key;
    if (res.linguaplay_server_url) serverUrl.value = res.linguaplay_server_url;
    if (res.linguaplay_anki_deck) ankiDeck.value = res.linguaplay_anki_deck;
    if (res.linguaplay_ankiconnect_url) ankiConnectUrl.value = res.linguaplay_ankiconnect_url;
    if (res.linguaplay_reading_mode) readingMode.value = res.linguaplay_reading_mode;

    const cards = res.linguaplay_cards || [];
    savedCardCounter.textContent = `${cards.length} card${cards.length === 1 ? '' : 's'} in storage`;
  });

  // 2. Save settings
  saveSettingsBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      linguaplay_ai_provider: aiProvider.value,
      linguaplay_gemini_key: geminiKey.value.trim(),
      linguaplay_openrouter_key: openrouterKey.value.trim(),
      linguaplay_server_url: serverUrl.value.trim() || 'http://127.0.0.1:8000',
      linguaplay_anki_deck: ankiDeck.value.trim() || 'LinguaPlay',
      linguaplay_ankiconnect_url: ankiConnectUrl.value.trim() || 'http://127.0.0.1:8765',
      linguaplay_reading_mode: readingMode.value
    }, () => {
      saveToast.classList.add('show');
      setTimeout(() => saveToast.classList.remove('show'), 2500);
    });
  });

  // 3. Test Local Server
  testServerBtn.addEventListener('click', async () => {
    serverStatusText.textContent = 'Testing connection…';
    serverStatusText.style.color = '#a78bfa';
    const url = serverUrl.value.trim() || 'http://127.0.0.1:8000';
    try {
      const res = await fetch(`${url}/api/ai/status`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        serverStatusText.textContent = `✓ Server Online! Antigravity CLI: ${data.antigravity_available ? 'Detected (' + data.antigravity_path + ')' : 'Not in PATH'}`;
        serverStatusText.style.color = '#34d399';
      } else {
        serverStatusText.textContent = `Server replied with HTTP ${res.status}`;
        serverStatusText.style.color = '#f87171';
      }
    } catch (e) {
      serverStatusText.textContent = `❌ Cannot reach server at ${url}. Ensure Server.py is running.`;
      serverStatusText.style.color = '#f87171';
    }
  });

  // 4. Test AnkiConnect
  testAnkiBtn.addEventListener('click', async () => {
    ankiStatusText.textContent = 'Testing AnkiConnect…';
    ankiStatusText.style.color = '#a78bfa';
    const url = ankiConnectUrl.value.trim() || 'http://127.0.0.1:8765';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'version', version: 6 }),
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const data = await res.json();
        ankiStatusText.textContent = `✓ AnkiConnect is active (API version ${data.result})!`;
        ankiStatusText.style.color = '#34d399';
      } else {
        ankiStatusText.textContent = `HTTP error ${res.status}`;
        ankiStatusText.style.color = '#f87171';
      }
    } catch (e) {
      ankiStatusText.textContent = '❌ AnkiConnect not reachable. Make sure Anki is open with AnkiConnect add-on installed.';
      ankiStatusText.style.color = '#f87171';
    }
  });

  // 5. Export TSV
  exportTsvBtn.addEventListener('click', () => {
    chrome.storage.local.get(['linguaplay_cards'], (res) => {
      const cards = res.linguaplay_cards || [];
      if (cards.length === 0) {
        alert('No cards in collection yet.');
        return;
      }

      let tsv = "#separator:Tab\n#html:true\n#deck:LinguaPlay Japanese Immersion\n";
      cards.forEach(c => {
        const sent = (c.sentence || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
        const word = (c.word || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
        const reading = (c.reading || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
        const meaning = (c.meaning || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
        const boldSent = word && sent.includes(word) ? sent.replace(word, `<b>${word}</b>`) : sent;
        tsv += `${boldSent}\t${word}\t${reading}\t${meaning}\n`;
      });

      const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lingua_anki_cards.txt';
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  // 6. Clear cards
  clearCardsBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all locally saved cards in extension storage?')) {
      chrome.storage.local.set({ linguaplay_cards: [] }, () => {
        savedCardCounter.textContent = '0 cards in storage';
      });
    }
  });
});
