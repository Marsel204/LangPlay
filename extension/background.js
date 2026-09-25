/**
 * LinguaPlay Chrome Extension — Service Worker (background.js)
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 LinguaPlay Extension installed.');

  // Create context menu for analyzing selected Japanese text
  try {
    if (typeof chrome !== 'undefined' && chrome.contextMenus && chrome.contextMenus.create) {
      chrome.contextMenus.create({
        id: 'linguaplay-analyze-selection',
        title: 'Analyze "%s" in LinguaPlay',
        contexts: ['selection']
      }, () => {
        if (chrome.runtime.lastError) {
          // Ignore duplicate item error on reload
        }
      });
    }
  } catch (e) {
    console.warn('[LinguaPlay Background] Failed to create context menu:', e);
  }
});

try {
  if (typeof chrome !== 'undefined' && chrome.contextMenus && chrome.contextMenus.onClicked) {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'linguaplay-analyze-selection' && info.selectionText) {
        const word = encodeURIComponent(info.selectionText.trim());
        chrome.tabs.create({
          url: chrome.runtime.getURL(`player.html?word=${word}`)
        });
      }
    });
  }
} catch (e) {
  console.warn('[LinguaPlay Background] Failed to register contextMenus onClicked listener:', e);
}

// Innertube Android VR Caption Extraction Bridge in Background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FETCH_YOUTUBE_CAPTIONS' && request.videoId) {
    (async () => {
      try {
        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
          'X-YouTube-Client-Name': '28',
          'X-YouTube-Client-Version': '1.65.10',
          'Origin': 'https://www.youtube.com'
        };
        if (request.visitorData) headers['X-Goog-Visitor-Id'] = request.visitorData;

        const payload = {
          context: {
            client: {
              clientName: 'ANDROID_VR',
              clientVersion: '1.65.10',
              deviceMake: 'Oculus',
              deviceModel: 'Quest 3',
              androidSdkVersion: 32,
              osName: 'Android',
              osVersion: '12L',
              hl: 'en',
              timeZone: 'UTC',
              utcOffsetMinutes: 0
            }
          },
          videoId: request.videoId,
          playbackContext: {
            contentPlaybackContext: {
              html5Preference: 'HTML5_PREF_WANTS',
              signatureTimestamp: 20717
            }
          },
          contentCheckOk: true,
          racyCheckOk: true
        };

        const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
          sendResponse({ success: true, tracks: tracks });
          return;
        }
        sendResponse({ success: false, error: `Status ${res.status}` });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // async sendResponse
  }

  if (request.action === 'OPEN_OPTIONS_PAGE') {
    const optionsUrl = chrome.runtime.getURL('options.html');
    if (chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: optionsUrl, active: true }, (tab) => {
        sendResponse({ success: true, tabId: tab ? tab.id : null });
      });
      return true;
    }
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
    sendResponse({ success: true });
    return false;
  }
});

