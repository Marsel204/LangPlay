/**
 * LinguaPlay Chrome Extension — Popup Script (popup.js)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const openPlayerBtn = document.getElementById('open-player-btn');
  const openOptionsBtn = document.getElementById('open-options-btn');
  const exportTsvBtn = document.getElementById('export-tsv-btn');
  const ankiCardCount = document.getElementById('anki-card-count');
  const popupSearchForm = document.getElementById('popup-search-form');
  const popupSearchInput = document.getElementById('popup-search-input');
  const ytActiveBox = document.getElementById('yt-active-box');
  const launchCurrentYtBtn = document.getElementById('launch-current-yt-btn');

  let activeYouTubeId = null;

  // 1. Open Player Tab
  openPlayerBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('player.html') });
  });

  // 2. Open Options Page
  openOptionsBtn.addEventListener('click', () => {
    try {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage(() => {
          if (chrome.runtime.lastError) {
            chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
          }
        });
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
      }
    } catch (e) {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    }
  });

  // 3. Check Active Tab for YouTube Video ID
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('youtube.com/watch')) {
      const url = new URL(tab.url);
      const v = url.searchParams.get('v');
      if (v) {
        activeYouTubeId = v;
        ytActiveBox.style.display = 'block';
      }
    }
  } catch (e) { /* ignore */ }

  if (launchCurrentYtBtn && activeYouTubeId) {
    launchCurrentYtBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL(`player.html?v=${activeYouTubeId}`) });
    });
  }

  // 4. Update Saved Anki Card Count
  try {
    chrome.storage.local.get(['linguaplay_cards'], (res) => {
      const cards = res.linguaplay_cards || [];
      ankiCardCount.textContent = `${cards.length} card${cards.length === 1 ? '' : 's'}`;
    });
  } catch (e) { /* ignore */ }

  // 5. Export TSV Button
  exportTsvBtn.addEventListener('click', () => {
    chrome.storage.local.get(['linguaplay_cards'], (res) => {
      const cards = res.linguaplay_cards || [];
      if (cards.length === 0) {
        alert('No cards saved yet. Click words in subtitles and add them to Anki!');
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

  // 6. Search Form
  if (popupSearchForm) {
    popupSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = popupSearchInput.value.trim();
      if (q) {
        chrome.tabs.create({ url: chrome.runtime.getURL(`player.html?search=${encodeURIComponent(q)}`) });
      }
    });
  }
});
