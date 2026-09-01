/**
 * LinguaPlay Chrome Extension — Service Worker (background.js)
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('🚀 LinguaPlay Extension installed.');

  // Create context menu for analyzing selected Japanese text
  chrome.contextMenus.create({
    id: 'linguaplay-analyze-selection',
    title: 'Analyze "%s" in LinguaPlay',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'linguaplay-analyze-selection' && info.selectionText) {
    const word = encodeURIComponent(info.selectionText.trim());
    chrome.tabs.create({
      url: chrome.runtime.getURL(`player.html?word=${word}`)
    });
  }
});
