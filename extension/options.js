/**
 * LinguaPlay Chrome Extension — Options Script (options.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  const aiProvider = document.getElementById('ai-provider');
  const geminiKey = document.getElementById('gemini-key');
  const deepseekKey = document.getElementById('deepseek-key');
  const openrouterKey = document.getElementById('openrouter-key');
  const openrouterModel = document.getElementById('openrouter-model');
  const opencodeUrl = document.getElementById('opencode-url');
  const opencodeKey = document.getElementById('opencode-key');
  const opencodeModel = document.getElementById('opencode-model');
  const serverUrl = document.getElementById('server-url');
  const ankiDeck = document.getElementById('anki-deck');
  const ankiConnectUrl = document.getElementById('ankiconnect-url');
  const readingMode = document.getElementById('reading-mode');
  const savedCardCounter = document.getElementById('saved-card-counter');
  
  const testServerBtn = document.getElementById('test-server-btn');
  const serverStatusText = document.getElementById('server-status-text');
  const testGeminiBtn = document.getElementById('test-gemini-btn');
  const geminiStatusText = document.getElementById('gemini-status-text');
  const testDeepseekBtn = document.getElementById('test-deepseek-btn');
  const deepseekStatusText = document.getElementById('deepseek-status-text');
  const testOpenrouterBtn = document.getElementById('test-openrouter-btn');
  const openrouterStatusText = document.getElementById('openrouter-status-text');
  const testOpencodeBtn = document.getElementById('test-opencode-btn');
  const opencodeStatusText = document.getElementById('opencode-status-text');
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
    'linguaplay_deepseek_key',
    'linguaplay_openrouter_key',
    'linguaplay_openrouter_model',
    'linguaplay_opencode_url',
    'linguaplay_opencode_key',
    'linguaplay_opencode_model',
    'linguaplay_server_url',
    'linguaplay_anki_deck',
    'linguaplay_ankiconnect_url',
    'linguaplay_reading_mode',
    'linguaplay_cards'
  ], (res) => {
    aiProvider.value = res.linguaplay_ai_provider || 'gemini';
    if (res.linguaplay_gemini_key) geminiKey.value = res.linguaplay_gemini_key;
    if (res.linguaplay_deepseek_key) deepseekKey.value = res.linguaplay_deepseek_key;
    if (res.linguaplay_openrouter_key) openrouterKey.value = res.linguaplay_openrouter_key;
    if (res.linguaplay_openrouter_model) openrouterModel.value = res.linguaplay_openrouter_model;
    if (res.linguaplay_opencode_url) opencodeUrl.value = res.linguaplay_opencode_url;
    if (res.linguaplay_opencode_key) opencodeKey.value = res.linguaplay_opencode_key;
    if (res.linguaplay_opencode_model) opencodeModel.value = res.linguaplay_opencode_model;
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
      linguaplay_deepseek_key: deepseekKey.value.trim(),
      linguaplay_openrouter_key: openrouterKey.value.trim(),
      linguaplay_openrouter_model: openrouterModel.value.trim() || 'deepseek/deepseek-chat',
      linguaplay_opencode_url: opencodeUrl.value.trim() || 'http://127.0.0.1:11434/v1',
      linguaplay_opencode_key: opencodeKey.value.trim(),
      linguaplay_opencode_model: opencodeModel.value.trim() || 'deepseek-chat',
      linguaplay_server_url: serverUrl.value.trim() || 'http://127.0.0.1:8000',
      linguaplay_anki_deck: ankiDeck.value.trim() || 'LinguaPlay',
      linguaplay_ankiconnect_url: ankiConnectUrl.value.trim() || 'http://127.0.0.1:8765',
      linguaplay_reading_mode: readingMode.value
    }, () => {
      saveToast.classList.add('show');
      setTimeout(() => saveToast.classList.remove('show'), 2500);
    });
  });

  // 3. Test Gemini API Key
  if (testGeminiBtn) {
    testGeminiBtn.addEventListener('click', async () => {
      const key = geminiKey.value.trim();
      if (!key) {
        geminiStatusText.textContent = '❌ Please enter a Gemini API key first.';
        geminiStatusText.style.color = '#f87171';
        return;
      }
      geminiStatusText.textContent = 'Testing Gemini 2.5 Flash connection…';
      geminiStatusText.style.color = '#a78bfa';
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Respond with the single word: OK' }] }]
          }),
          signal: AbortSignal.timeout(5000)
        });
        if (res.ok) {
          geminiStatusText.textContent = '✓ Gemini 2.5 Flash API Key is Valid & Working!';
          geminiStatusText.style.color = '#34d399';
        } else {
          const err = await res.json().catch(() => ({}));
          geminiStatusText.textContent = `❌ API Error: ${err.error?.message || 'Status ' + res.status}`;
          geminiStatusText.style.color = '#f87171';
        }
      } catch (e) {
        geminiStatusText.textContent = `❌ Network Error: ${e.message}`;
        geminiStatusText.style.color = '#f87171';
      }
    });
  }

  // 4. Test DeepSeek API Key
  if (testDeepseekBtn) {
    testDeepseekBtn.addEventListener('click', async () => {
      const key = deepseekKey.value.trim();
      if (!key) {
        deepseekStatusText.textContent = '❌ Please enter a DeepSeek API key first.';
        deepseekStatusText.style.color = '#f87171';
        return;
      }
      deepseekStatusText.textContent = 'Testing DeepSeek API connection…';
      deepseekStatusText.style.color = '#a78bfa';
      try {
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: 'Respond with the word OK' }],
            max_tokens: 10
          }),
          signal: AbortSignal.timeout(5000)
        });
        if (res.ok) {
          deepseekStatusText.textContent = '✓ DeepSeek API Key is Valid & Working!';
          deepseekStatusText.style.color = '#34d399';
        } else {
          const err = await res.json().catch(() => ({}));
          deepseekStatusText.textContent = `❌ API Error: ${err.error?.message || 'Status ' + res.status}`;
          deepseekStatusText.style.color = '#f87171';
        }
      } catch (e) {
        deepseekStatusText.textContent = `❌ Network Error: ${e.message}`;
        deepseekStatusText.style.color = '#f87171';
      }
    });
  }

  // 5. Test OpenRouter API Key
  if (testOpenrouterBtn) {
    testOpenrouterBtn.addEventListener('click', async () => {
      const key = openrouterKey.value.trim();
      const model = openrouterModel.value.trim() || 'deepseek/deepseek-chat';
      if (!key) {
        openrouterStatusText.textContent = '❌ Please enter an OpenRouter API key first.';
        openrouterStatusText.style.color = '#f87171';
        return;
      }
      openrouterStatusText.textContent = `Testing OpenRouter (${model})…`;
      openrouterStatusText.style.color = '#a78bfa';
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
            'HTTP-Referer': 'https://linguaplay.app',
            'X-Title': 'LinguaPlay'
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: 'Respond with the word OK' }],
            max_tokens: 10
          }),
          signal: AbortSignal.timeout(6000)
        });
        if (res.ok) {
          openrouterStatusText.textContent = `✓ OpenRouter (${model}) is Valid & Working!`;
          openrouterStatusText.style.color = '#34d399';
        } else {
          const err = await res.json().catch(() => ({}));
          openrouterStatusText.textContent = `❌ API Error: ${err.error?.message || 'Status ' + res.status}`;
          openrouterStatusText.style.color = '#f87171';
        }
      } catch (e) {
        openrouterStatusText.textContent = `❌ Network Error: ${e.message}`;
        openrouterStatusText.style.color = '#f87171';
      }
    });
  }

  // 6. Test OpenCode / Custom OpenAI Endpoint
  if (testOpencodeBtn) {
    testOpencodeBtn.addEventListener('click', async () => {
      const baseUrl = opencodeUrl.value.trim() || 'http://127.0.0.1:11434/v1';
      const key = opencodeKey.value.trim();
      const model = opencodeModel.value.trim() || 'deepseek-chat';
      opencodeStatusText.textContent = `Testing Custom Endpoint (${baseUrl})…`;
      opencodeStatusText.style.color = '#a78bfa';
      const targetUrl = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/chat/completions`;
      const headers = { 'Content-Type': 'application/json' };
      if (key) headers['Authorization'] = `Bearer ${key}`;

      try {
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: 'Respond with the word OK' }],
            max_tokens: 10
          }),
          signal: AbortSignal.timeout(5000)
        });
        if (res.ok) {
          opencodeStatusText.textContent = `✓ Custom OpenAI Endpoint is Online & Working!`;
          opencodeStatusText.style.color = '#34d399';
        } else {
          const err = await res.json().catch(() => ({}));
          opencodeStatusText.textContent = `❌ Error: ${err.error?.message || 'Status ' + res.status}`;
          opencodeStatusText.style.color = '#f87171';
        }
      } catch (e) {
        opencodeStatusText.textContent = `❌ Connection Error: ${e.message}. Ensure local model server is running.`;
        opencodeStatusText.style.color = '#f87171';
      }
    });
  }

  // 7. Test Local Server
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

  // 8. Test AnkiConnect
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

  // 9. Export TSV
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
        const sentEn = (c.sentence_en || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
        const word = (c.word || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
        const reading = (c.reading || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
        const meaning = (c.meaning || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
        const boldSent = word && sent.includes(word) ? sent.split(word).join(`<b>${word}</b>`) : sent;
        const fullMeaning = sentEn ? `${meaning}<br><small style="color:#94a3b8">${sentEn}</small>` : meaning;
        tsv += `${boldSent}\t${word}\t${reading}\t${fullMeaning}\n`;
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

  // 10. Clear cards
  clearCardsBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all locally saved cards in extension storage?')) {
      chrome.storage.local.set({ linguaplay_cards: [] }, () => {
        savedCardCounter.textContent = '0 cards in storage';
      });
    }
  });
});
