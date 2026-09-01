/**
 * LinguaPlay Chrome Extension — Main Application Bootstrap (app.js)
 * Standalone Immersion Player page controller.
 */

import { JDICT, fetchGoogleTranslation } from './dict.js';
import { initTokenizer, tokenizeSentence } from './tokenizer.js';
import {
  parseSubtitleFile,
  findCueIndexAtTime,
  setTimeline,
  getTimeline,
  getCurrentCueIndex,
  setCurrentCueIndex,
  getCurrentSentence,
  renderTokens,
  adjustTimingOffset,
  setTimingOffset,
  getTimingOffset,
  setReadingMode,
  getReadingMode,
  isManualCaptionsLoaded
} from './subtitles.js';
import {
  initPlayer,
  loadLocalVideo,
  loadYouTubeVideo,
  playMedia,
  pauseMedia,
  togglePlayPause,
  isMediaPaused,
  getCurrentTime,
  seekTo,
  getMediaMode,
  setMediaMode
} from './player-controller.js';
import {
  getAIProvider,
  setAIProvider,
  checkAntigravityStatus,
  getSavedApiKey,
  saveApiKey,
  requestAIAnalysis,
  renderAICards,
  abortAIAnalysis
} from './ai.js';
import { addQuickCard, addAICard } from './anki.js';
import { showToast, openModal, closeModal, renderSearchResults } from './ui.js';

// ── DOM Elements ──
const videoPlayer = document.getElementById('player');
const videoInput = document.getElementById('video-input');
const subInput = document.getElementById('sub-input');
const videoLabel = document.getElementById('video-file-label');
const subLabel = document.getElementById('sub-file-label');

const youtubeUrlInput = document.getElementById('youtube-url-input');
const youtubeLoadBtn = document.getElementById('youtube-load-btn');
const youtubePlayerContainer = document.getElementById('youtube-player-container');
const youtubeFeedback = document.getElementById('youtube-feedback');

const overlay = document.getElementById('subtitle-overlay');
const tokensContainer = document.getElementById('tokens-container');

const readingModePills = document.querySelectorAll('[data-reading-mode]');
const timingOffsetDisplay = document.getElementById('timing-offset-display');
const offsetSub500 = document.getElementById('offset-sub-500');
const offsetSub100 = document.getElementById('offset-sub-100');
const offsetAdd100 = document.getElementById('offset-add-100');
const offsetAdd500 = document.getElementById('offset-add-500');
const offsetReset = document.getElementById('offset-reset');
const repeatCueBtn = document.getElementById('repeat-cue-btn');
const copySentenceBtn = document.getElementById('copy-sentence-btn');

const placeholderState = document.getElementById('placeholder-state');
const activeState = document.getElementById('active-state');
const activeWord = document.getElementById('active-word');
const activeRomaji = document.getElementById('active-romaji');
const activePos = document.getElementById('active-pos');
const activeDef = document.getElementById('active-def');
const dismissBtn = document.getElementById('dismiss-btn');

const askAiBtn = document.getElementById('ask-ai-btn');
const askAiBtnText = document.getElementById('ask-ai-btn-text');
const aiTriggerSection = document.getElementById('ai-trigger-section');
const aiResponseContainer = document.getElementById('ai-response-container');
const aiLoadingSkeleton = document.getElementById('ai-loading-skeleton');
const aiStreamPreview = document.getElementById('ai-stream-preview');
const aiCardsContainer = document.getElementById('ai-cards-container');
const aiErrorDisplay = document.getElementById('ai-error-display');
const aiSaveAnkiBtn = document.getElementById('ai-save-anki-btn');

const aiProviderSelect = document.getElementById('ai-provider-select');
const aiProviderIcon = document.getElementById('ai-provider-icon');
const aiKeyInputWrap = document.getElementById('ai-key-input-wrap');
const aiApiKeyInput = document.getElementById('ai-api-key');
const aiLocalBadge = document.getElementById('ai-local-badge');
const apiKeyStatus = document.getElementById('api-key-status');

const quickAnkiBtn = document.getElementById('quick-anki-btn');
const quickAnkiFeedback = document.getElementById('quick-anki-feedback');

const ytSearchModal = document.getElementById('youtube-search-modal');
const ytSearchModalClose = document.getElementById('youtube-search-modal-close');
const ytSearchResultsContainer = document.getElementById('youtube-search-results-container');
const modalSearchForm = document.getElementById('modal-search-form');
const modalSearchInput = document.getElementById('modal-search-input');
const ytdlpModal = document.getElementById('ytdlp-modal');
const ytdlpModalClose = document.getElementById('ytdlp-modal-close');
const captionsYtdlpCmd = document.getElementById('captions-ytdlp-cmd');
const captionsCopyBtn = document.getElementById('captions-copy-btn');
const captionsCopyFeedback = document.getElementById('captions-copy-feedback');

let currentActiveToken = null;
let currentLastAiData = null;
let currentYouTubeId = null;

// ── 1. Subtitle Synchronization ──
function onTimeUpdate(currentTime) {
  const timeline = getTimeline();
  if (!timeline || timeline.length === 0) return;

  const cueIdx = findCueIndexAtTime(timeline, currentTime);
  const prevIdx = getCurrentCueIndex();

  if (cueIdx === -1) {
    if (prevIdx !== -1) {
      setCurrentCueIndex(-1);
      tokensContainer.innerHTML = '';
    }
  } else if (cueIdx !== prevIdx) {
    setCurrentCueIndex(cueIdx);
    renderTokens(timeline[cueIdx].text, tokensContainer);
  }
}

// ── 2. UI Updates ──
function updateReadingModeUI() {
  const currentMode = getReadingMode();
  readingModePills.forEach(pill => {
    if (pill.dataset.readingMode === currentMode) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });

  const timeline = getTimeline();
  const currentIdx = getCurrentCueIndex();
  if (timeline && currentIdx >= 0 && currentIdx < timeline.length) {
    renderTokens(timeline[currentIdx].text, tokensContainer);
  }
}

function updateTimingOffsetUI() {
  const offset = getTimingOffset();
  if (timingOffsetDisplay) {
    const sign = offset > 0 ? '+' : '';
    timingOffsetDisplay.textContent = `${sign}${offset.toFixed(1)}s`;
    timingOffsetDisplay.className = offset === 0 ? 'text-[11px] font-mono text-slate-400 px-1.5' : 'text-[11px] font-mono font-bold text-accent-light px-1.5';
  }
}

async function updateAIProviderUI() {
  const prov = getAIProvider();
  if (aiProviderSelect) aiProviderSelect.value = prov;

  const icons = {
    antigravity: '⚡',
    gemini: '🌟',
    openrouter: '🚀'
  };

  const btnLabels = {
    antigravity: 'Ask Antigravity AI for Breakdown',
    gemini: 'Ask Gemini AI for Breakdown',
    openrouter: 'Ask DeepSeek AI for Breakdown'
  };

  const placeholders = {
    gemini: 'Gemini key (AIzaSy…)',
    openrouter: 'OpenRouter key (sk-or…)'
  };

  if (aiProviderIcon) aiProviderIcon.textContent = icons[prov] || '🤖';
  if (askAiBtnText) askAiBtnText.textContent = btnLabels[prov] || 'Ask AI for Breakdown';

  if (prov === 'antigravity') {
    if (aiLocalBadge) aiLocalBadge.classList.remove('hidden');
    if (aiKeyInputWrap) aiKeyInputWrap.classList.add('hidden');
  } else {
    if (aiLocalBadge) aiLocalBadge.classList.add('hidden');
    if (aiKeyInputWrap) aiKeyInputWrap.classList.remove('hidden');
    if (aiApiKeyInput) {
      aiApiKeyInput.placeholder = placeholders[prov] || 'Paste API key…';
      const savedKey = await getSavedApiKey(prov);
      aiApiKeyInput.value = savedKey;
      if (savedKey) {
        if (apiKeyStatus) {
          apiKeyStatus.textContent = 'Saved';
          apiKeyStatus.className = 'text-[10px] text-emerald-400 shrink-0';
          apiKeyStatus.classList.remove('hidden');
        }
      } else if (apiKeyStatus) {
        apiKeyStatus.classList.add('hidden');
      }
    }
  }
}

function showNativeUI() {
  setMediaMode('native');
  if (videoPlayer) videoPlayer.classList.remove('hidden');
  if (youtubePlayerContainer) youtubePlayerContainer.classList.add('hidden');
}

function showYouTubeUI() {
  setMediaMode('youtube');
  if (videoPlayer) {
    videoPlayer.pause();
    videoPlayer.classList.add('hidden');
  }
  if (youtubePlayerContainer) youtubePlayerContainer.classList.remove('hidden');
}

function showYoutubeFeedback(msg) {
  if (youtubeFeedback) {
    youtubeFeedback.textContent = msg;
    youtubeFeedback.classList.remove('hidden');
  }
}

function clearYoutubeFeedback() {
  if (youtubeFeedback) {
    youtubeFeedback.textContent = '';
    youtubeFeedback.classList.add('hidden');
  }
}

// ── 3. YouTube URL / Caption Extract ──
export function extractYouTubeId(input) {
  if (!input) return null;
  const trimmed = input.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed) && !trimmed.includes(' ') && !/^[a-zA-Z]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtube-nocookie.com')) {
      if (url.pathname === '/watch') return url.searchParams.get('v');
      if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2];
      if (url.pathname.startsWith('/v/')) return url.pathname.split('/')[2];
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2];
    } else if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1).split('?')[0];
    }
  } catch (e) { /* not a URL */ }

  const match = trimmed.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

async function fetchServerCaptions(videoId) {
  // 1. Try local server endpoint if running
  try {
    const res = await fetch(`http://127.0.0.1:8000/api/captions?v=${encodeURIComponent(videoId)}`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const vttText = await res.text();
      return parseSubtitleFile(vttText, 'captions.vtt');
    }
  } catch (e) { /* local server not running */ }

  // 2. Direct YouTube timedtext API fetch (Works directly in extension via host permissions!)
  try {
    const infoUrl = `https://www.youtube.com/watch?v=${videoId}&hl=ja`;
    const pageRes = await fetch(infoUrl);
    if (pageRes.ok) {
      const html = await pageRes.text();
      const m = html.match(/"captionTracks":\s*(\[.*?\])/);
      if (m) {
        const tracks = JSON.parse(m[1]);
        const jaTrack = tracks.find(t => t.languageCode?.startsWith('ja')) || tracks[0];
        if (jaTrack && jaTrack.baseUrl) {
          const sep = jaTrack.baseUrl.includes('?') ? '&' : '?';
          const vttRes = await fetch(`${jaTrack.baseUrl}${sep}fmt=vtt`);
          if (vttRes.ok) {
            const vtt = await vttRes.text();
            return parseSubtitleFile(vtt, 'captions.vtt');
          }
        }
      }
    }
  } catch (e) {
    console.warn('[Captions] Direct caption fetch failed:', e);
  }

  return null;
}

async function loadYouTube(input) {
  clearYoutubeFeedback();
  const videoId = extractYouTubeId(input);

  if (!videoId) {
    await executeYouTubeSearch(input);
    return;
  }

  currentYouTubeId = videoId;
  showYouTubeUI();
  setTimeline([], false);
  tokensContainer.innerHTML = '';
  subLabel.textContent = 'Fetching subs…';

  try {
    await loadYouTubeVideo(videoId, async (errorCode, vidId) => {
      showYoutubeFeedback(`YouTube playback notice (${errorCode}). If video is restricted, try another link.`);
    });
  } catch (err) {
    showYoutubeFeedback(`Error initializing YouTube player: ${err.message}`);
  }

  const cues = await fetchServerCaptions(videoId);
  if (cues && cues.length > 0) {
    if (!isManualCaptionsLoaded()) {
      setTimeline(cues, false);
      subLabel.textContent = `Auto Sub (${cues.length})`;
      showToast(`Loaded ${cues.length} Japanese subtitle cues!`, 'success');
    }
  } else {
    subLabel.textContent = 'No Japanese subs';
    showToast('No auto subtitles found. Upload a .srt/.vtt file manually.', 'warn', 4000);
    if (captionsYtdlpCmd) {
      captionsYtdlpCmd.textContent = `yt-dlp --write-auto-subs --sub-langs ja --convert-subs vtt https://www.youtube.com/watch?v=${videoId}`;
    }
  }
}

async function executeYouTubeSearch(query) {
  if (!query || !query.trim()) return;

  const btn = document.getElementById('youtube-load-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Searching…';
  }

  openModal('youtube-search-modal');
  ytSearchResultsContainer.innerHTML = `
    <div class="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
      <div class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" style="width: 32px; height: 32px; border: 2px solid #a78bfa; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <p class="text-xs">Searching YouTube for "<span class="text-accent-light">${query}</span>"…</p>
    </div>
  `;

  if (modalSearchInput) modalSearchInput.value = query;

  try {
    // 1. Try local server search if available
    const res = await fetch(`http://127.0.0.1:8000/api/search?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const videos = await res.json();
      renderSearchResults(videos, ytSearchResultsContainer, (selected) => {
        closeModal('youtube-search-modal');
        const targetId = selected.id || extractYouTubeId(selected.url);
        if (targetId) {
          youtubeUrlInput.value = `https://www.youtube.com/watch?v=${targetId}`;
          loadYouTube(targetId);
        }
      });
      return;
    }
  } catch (e) { /* server not online, fallback to direct search scrape */ }

  try {
    // Direct YouTube search results page parsing
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const m = html.match(/ytInitialData\s*=\s*(\{.+?\});/);
    if (m) {
      const data = JSON.parse(m[1]);
      const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
      const videos = [];
      for (const item of contents) {
        const v = item.videoRenderer;
        if (v && v.videoId) {
          videos.push({
            id: v.videoId,
            title: v.title?.runs?.[0]?.text || '',
            uploader: v.ownerText?.runs?.[0]?.text || '',
            duration_string: v.lengthText?.simpleText || '',
            thumbnails: v.thumbnail?.thumbnails || []
          });
        }
      }
      if (videos.length > 0) {
        renderSearchResults(videos, ytSearchResultsContainer, (selected) => {
          closeModal('youtube-search-modal');
          const targetId = selected.id;
          if (targetId) {
            youtubeUrlInput.value = `https://www.youtube.com/watch?v=${targetId}`;
            loadYouTube(targetId);
          }
        });
        return;
      }
    }
  } catch (err) {
    console.warn('[Search] Direct scrape search fallback error:', err);
  }

  ytSearchResultsContainer.innerHTML = `
    <div class="text-center py-12 text-slate-400 text-xs">
      Could not retrieve automated search results. You can paste any direct YouTube video URL in the top input.
    </div>
  `;
}

// ── 4. Token Click & Analysis Workflow ──
function handleTokenClick(tokenEl) {
  if (!tokenEl) return;

  if (currentActiveToken) currentActiveToken.classList.remove('active');
  tokenEl.classList.add('active');
  currentActiveToken = tokenEl;

  const word = tokenEl.dataset.word;
  const romaji = tokenEl.dataset.romaji;
  const reading = tokenEl.dataset.reading;
  const furigana = tokenEl.dataset.furigana;
  const pos = tokenEl.dataset.pos;
  const posDetail = tokenEl.dataset.posDetail;
  const baseform = tokenEl.dataset.baseform || word;

  activeWord.textContent = word;
  activeRomaji.textContent = romaji;
  activePos.textContent = `Part of Speech: ${pos || '—'} ${posDetail ? `(${posDetail})` : ''} • Base: ${baseform}`;

  const localDef = JDICT[baseform] || JDICT[word];
  if (localDef) {
    activeDef.innerHTML = `${baseform !== word ? baseform + ' — ' : ''}${localDef}`;
  } else {
    activeDef.innerHTML = '<span class="animate-pulse">Fetching translation…</span>';
    fetchGoogleTranslation(baseform).then(translation => {
      if (translation) {
        activeDef.innerHTML = `${baseform !== word ? baseform + ' — ' : ''}${translation}`;
      } else {
        activeDef.textContent = `No local definition for "${baseform}". Click "Ask AI" below for deep analysis.`;
      }
    });
  }

  abortAIAnalysis();
  aiTriggerSection.classList.remove('hidden');
  aiResponseContainer.classList.add('hidden');
  aiCardsContainer.innerHTML = '';
  aiErrorDisplay.classList.add('hidden');
  currentLastAiData = null;

  quickAnkiBtn.disabled = false;
  quickAnkiBtn.innerHTML = '🗃️ Quick Add to Anki';
  quickAnkiBtn.className = 'w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-slate-300 bg-surface-200 border border-slate-700/60 hover:bg-slate-800 hover:border-slate-500 hover:text-white transition-all duration-200 flex items-center justify-center gap-2';
  quickAnkiFeedback.classList.add('hidden');

  placeholderState.classList.add('hidden');
  activeState.classList.remove('hidden');
}

// ── 5. App Initialization ──
export async function initApp() {
  initPlayer(videoPlayer, onTimeUpdate);

  initTokenizer((status, msg) => {
    if (status === 'loading') {
      videoLabel.innerHTML = '<span class="animate-pulse">Loading dictionary…</span>';
      subLabel.innerHTML = '<span class="animate-pulse">Please wait…</span>';
    } else if (status === 'ready') {
      videoLabel.textContent = 'Local Video';
      subLabel.textContent = 'Subtitles';
      console.log('[LinguaPlay Extension] Tokenizer ready.');
    } else if (status === 'error') {
      videoLabel.textContent = 'Local Video';
      subLabel.textContent = 'Subtitles';
    }
  });

  await updateAIProviderUI();
  const agyStatus = await checkAntigravityStatus();
  if (agyStatus.available) {
    console.log('[AI] Local Antigravity CLI detected:', agyStatus.path);
  }

  // Check URL params for initial video (e.g. ?v=VIDEO_ID)
  const urlParams = new URLSearchParams(window.location.search);
  const vParam = urlParams.get('v');
  if (vParam) {
    youtubeUrlInput.value = `https://www.youtube.com/watch?v=${vParam}`;
    loadYouTube(vParam);
  }

  if (aiProviderSelect) {
    aiProviderSelect.addEventListener('change', (e) => {
      setAIProvider(e.target.value);
      updateAIProviderUI();
      showToast(`AI Engine set to: ${e.target.options[e.target.selectedIndex].text}`, 'info', 1800);
    });
  }

  if (aiApiKeyInput) {
    aiApiKeyInput.addEventListener('input', () => {
      const val = aiApiKeyInput.value.trim();
      saveApiKey(val, getAIProvider());
      if (val) {
        if (apiKeyStatus) {
          apiKeyStatus.textContent = 'Saved';
          apiKeyStatus.className = 'text-[10px] text-emerald-400 shrink-0';
          apiKeyStatus.classList.remove('hidden');
        }
      } else if (apiKeyStatus) {
        apiKeyStatus.classList.add('hidden');
      }
    });
  }

  videoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    videoLabel.textContent = file.name;
    showNativeUI();
    loadLocalVideo(file);
  });

  subInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    subLabel.textContent = file.name;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const cues = parseSubtitleFile(evt.target.result, file.name);
      setTimeline(cues, true);
      tokensContainer.innerHTML = '';
      if (cues.length === 0) {
        showToast('Parsed 0 cues. Verify file syntax (.srt/.vtt)', 'error');
      } else {
        showToast(`Parsed ${cues.length} subtitle cues.`, 'success');
      }
    };
    reader.readAsText(file);
  });

  youtubeLoadBtn.addEventListener('click', () => {
    loadYouTube(youtubeUrlInput.value);
  });

  youtubeUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      loadYouTube(youtubeUrlInput.value);
    }
  });

  if (modalSearchForm) {
    modalSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = modalSearchInput.value.trim();
      if (q) {
        youtubeUrlInput.value = q;
        executeYouTubeSearch(q);
      }
    });
  }

  overlay.addEventListener('click', (e) => {
    const token = e.target.closest('.token-group');
    if (token) {
      handleTokenClick(token);
    }
  });

  readingModePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const mode = pill.dataset.readingMode;
      setReadingMode(mode);
      updateReadingModeUI();
      showToast(`Reading display set to: ${mode.toUpperCase()}`, 'info', 1500);
    });
  });
  updateReadingModeUI();

  if (offsetSub500) offsetSub500.addEventListener('click', () => { adjustTimingOffset(-0.5); updateTimingOffsetUI(); });
  if (offsetSub100) offsetSub100.addEventListener('click', () => { adjustTimingOffset(-0.1); updateTimingOffsetUI(); });
  if (offsetAdd100) offsetAdd100.addEventListener('click', () => { adjustTimingOffset(+0.1); updateTimingOffsetUI(); });
  if (offsetAdd500) offsetAdd500.addEventListener('click', () => { adjustTimingOffset(+0.5); updateTimingOffsetUI(); });
  if (offsetReset) offsetReset.addEventListener('click', () => { setTimingOffset(0); updateTimingOffsetUI(); });
  updateTimingOffsetUI();

  if (repeatCueBtn) {
    repeatCueBtn.addEventListener('click', () => {
      const timeline = getTimeline();
      const currentIdx = getCurrentCueIndex();
      if (timeline && currentIdx >= 0 && currentIdx < timeline.length) {
        seekTo(timeline[currentIdx].start);
        playMedia();
        showToast('Repeating subtitle cue', 'info', 1200);
      }
    });
  }

  if (copySentenceBtn) {
    copySentenceBtn.addEventListener('click', () => {
      const sentence = getCurrentSentence();
      if (sentence) {
        navigator.clipboard.writeText(sentence).then(() => {
          showToast('Sentence copied to clipboard!', 'success', 2000);
        });
      }
    });
  }

  askAiBtn.addEventListener('click', () => {
    aiTriggerSection.classList.add('hidden');
    aiResponseContainer.classList.remove('hidden');
    aiLoadingSkeleton.classList.remove('hidden');
    aiStreamPreview.classList.add('hidden');
    aiCardsContainer.innerHTML = '';
    aiErrorDisplay.classList.add('hidden');

    const word = activeWord.textContent;
    const romaji = activeRomaji.textContent;
    const sentence = getCurrentSentence();
    const provider = getAIProvider();
    const apiKey = aiApiKeyInput ? aiApiKeyInput.value.trim() : '';

    requestAIAnalysis({
      word,
      romaji,
      sentence,
      provider,
      apiKey,
      onChunk: (text) => {
        aiLoadingSkeleton.classList.add('hidden');
        aiStreamPreview.classList.remove('hidden');
        aiStreamPreview.textContent = text;
      },
      onSuccess: (data) => {
        currentLastAiData = data;
        aiLoadingSkeleton.classList.add('hidden');
        aiStreamPreview.classList.add('hidden');
        renderAICards(data, word, aiCardsContainer);
      },
      onError: (msg) => {
        aiLoadingSkeleton.classList.add('hidden');
        aiStreamPreview.classList.add('hidden');
        aiErrorDisplay.textContent = msg;
        aiErrorDisplay.classList.remove('hidden');
      }
    });
  });

  quickAnkiBtn.addEventListener('click', async () => {
    quickAnkiBtn.disabled = true;
    quickAnkiBtn.innerHTML = '⏳ Syncing...';
    quickAnkiFeedback.classList.add('hidden');

    const word = activeWord.textContent;
    const romaji = activeRomaji.textContent;
    const token = currentActiveToken;
    const reading = token ? (token.dataset.reading || token.dataset.furigana || '') : '';
    const meaning = activeDef.innerHTML;
    const sentence = getCurrentSentence();

    try {
      const res = await addQuickCard({
        word,
        reading,
        romaji,
        meaning,
        sentence,
        sentenceRomaji: ''
      });

      quickAnkiBtn.innerHTML = '✓ Added to Anki';
      quickAnkiBtn.className = 'w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center gap-2 cursor-default';
      showToast(res.message, 'success', 3500);
    } catch (err) {
      quickAnkiBtn.disabled = false;
      quickAnkiBtn.innerHTML = '⚠ Sync Failed';
      quickAnkiFeedback.innerHTML = `<strong>Action Required:</strong> ${err.message}`;
      quickAnkiFeedback.classList.remove('hidden');
      showToast(err.message, 'error', 4000);
    }
  });

  if (aiSaveAnkiBtn) {
    aiSaveAnkiBtn.addEventListener('click', async () => {
      if (!currentLastAiData) return;
      aiSaveAnkiBtn.disabled = true;
      aiSaveAnkiBtn.innerHTML = '⏳ Saving AI Card...';

      try {
        const res = await addAICard({
          word: activeWord.textContent,
          aiData: currentLastAiData,
          sentence: getCurrentSentence()
        });
        aiSaveAnkiBtn.innerHTML = '✓ AI Card Saved';
        aiSaveAnkiBtn.className = 'w-full py-2 px-3 rounded-lg text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center gap-1 cursor-default';
        showToast(res.message, 'success', 3500);
      } catch (err) {
        aiSaveAnkiBtn.disabled = false;
        aiSaveAnkiBtn.innerHTML = '⚠ Save Failed';
        showToast(err.message, 'error', 3500);
      }
    });
  }

  dismissBtn.addEventListener('click', () => {
    abortAIAnalysis();
    activeState.classList.add('hidden');
    placeholderState.classList.remove('hidden');
    if (currentActiveToken) currentActiveToken.classList.remove('active');
    currentActiveToken = null;
    playMedia();
  });

  if (ytSearchModalClose) ytSearchModalClose.addEventListener('click', () => closeModal('youtube-search-modal'));
  if (ytdlpModalClose) ytdlpModalClose.addEventListener('click', () => closeModal('ytdlp-modal'));
  if (captionsCopyBtn && captionsYtdlpCmd) {
    captionsCopyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(captionsYtdlpCmd.textContent).then(() => {
        captionsCopyFeedback.classList.remove('hidden');
        setTimeout(() => captionsCopyFeedback.classList.add('hidden'), 2500);
      });
    });
  }

  // Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case ' ':
        if (getMediaMode() === 'native' && tag === 'VIDEO') return;
        if (tag === 'BUTTON') document.activeElement.blur();
        e.preventDefault();
        togglePlayPause();
        break;

      case 'ArrowLeft':
        e.preventDefault();
        seekTo(getCurrentTime() - 5);
        break;

      case 'ArrowRight':
        e.preventDefault();
        seekTo(getCurrentTime() + 5);
        break;

      case 'ArrowUp': {
        e.preventDefault();
        const timeline = getTimeline();
        if (!timeline || timeline.length === 0) break;
        const ct = getCurrentTime();
        let prev = -1;
        for (let i = timeline.length - 1; i >= 0; i--) {
          if (timeline[i].start < ct - 0.2) {
            prev = i;
            break;
          }
        }
        if (prev >= 0) seekTo(timeline[prev].start);
        break;
      }

      case 'ArrowDown': {
        e.preventDefault();
        const timeline = getTimeline();
        if (!timeline || timeline.length === 0) break;
        const ct = getCurrentTime();
        let next = -1;
        for (let i = 0; i < timeline.length; i++) {
          if (timeline[i].start > ct + 0.2) {
            next = i;
            break;
          }
        }
        if (next >= 0) seekTo(timeline[next].start);
        break;
      }

      case 'r':
      case 'R': {
        e.preventDefault();
        const timeline = getTimeline();
        const currentIdx = getCurrentCueIndex();
        if (timeline && currentIdx >= 0 && currentIdx < timeline.length) {
          seekTo(timeline[currentIdx].start);
          playMedia();
        }
        break;
      }

      case 'c':
      case 'C': {
        const sentence = getCurrentSentence();
        if (sentence) {
          navigator.clipboard.writeText(sentence).then(() => {
            showToast('Sentence copied to clipboard!', 'success', 1500);
          });
        }
        break;
      }

      case 's':
      case 'S':
        overlay.classList.toggle('hidden');
        break;

      case '[':
        adjustTimingOffset(-0.1);
        updateTimingOffsetUI();
        showToast(`Subtitle timing: ${getTimingOffset() > 0 ? '+' : ''}${getTimingOffset().toFixed(1)}s`, 'info', 1000);
        break;

      case ']':
        adjustTimingOffset(+0.1);
        updateTimingOffsetUI();
        showToast(`Subtitle timing: ${getTimingOffset() > 0 ? '+' : ''}${getTimingOffset().toFixed(1)}s`, 'info', 1000);
        break;
    }
  });

  console.log('🚀 LinguaPlay Chrome Extension player ready.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
