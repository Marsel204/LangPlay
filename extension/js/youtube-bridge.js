/**
 * LinguaPlay — YouTube Main World Bridge (youtube-bridge.js)
 * Executes in the MAIN execution world (page context) to directly interact
 * with movie_player and window.ytInitialPlayerResponse without CSP violations.
 */

(function () {
  'use strict';

  function isJapaneseTrack(t) {
    if (!t) return false;
    const code = (t.languageCode || t.lang || '').toLowerCase();
    if (code.startsWith('ja')) return true;
    const vss = (t.vssId || t.vss_id || '').toLowerCase();
    if (vss === '.ja' || vss === 'a.ja' || vss.endsWith('.ja') || vss.includes('ja')) return true;
    const name = (
      (t.name?.runs?.[0]?.text) ||
      (t.name?.simpleText) ||
      t.displayName ||
      t.languageName ||
      (typeof t.name === 'string' ? t.name : '')
    ).toLowerCase();
    return name.includes('japan') || name.includes('jepang') || name.includes('日本語') || name.includes('にほんご');
  }

  function getPlayer() {
    return document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  }

  function findBestJapaneseTrack(tracklist) {
    if (!Array.isArray(tracklist) || tracklist.length === 0) return null;
    const manualJa = tracklist.find(t => isJapaneseTrack(t) && t.kind !== 'asr' && !(t.vssId && t.vssId.startsWith('a.')) && !(t.vss_id && t.vss_id.startsWith('a.')));
    if (manualJa) return manualJa;
    return tracklist.find(t => isJapaneseTrack(t)) || null;
  }

  function ensureSubtitlesVisible() {
    try {
      const ccBtn = document.querySelector('.ytp-subtitles-button');
      if (ccBtn && ccBtn.getAttribute('aria-pressed') === 'false') {
        ccBtn.click();
      }
    } catch (e) {}
  }

  function ensureJapaneseTrackActive() {
    const player = getPlayer();
    if (!player) return false;

    if (typeof player.loadModule === 'function') {
      try { player.loadModule('captions'); } catch (e) {}
    }

    if (typeof player.getOption !== 'function') return false;

    const tracklist = player.getOption('captions', 'tracklist');
    const currentTrack = player.getOption('captions', 'track');

    if (Array.isArray(tracklist) && tracklist.length > 0) {
      const jaTrack = findBestJapaneseTrack(tracklist);
      if (jaTrack) {
        const isAlreadyJapanese = currentTrack && isJapaneseTrack(currentTrack);
        if (!isAlreadyJapanese || (jaTrack.kind !== 'asr' && currentTrack && currentTrack.kind === 'asr')) {
          if (typeof player.setOption === 'function') {
            player.setOption('captions', 'track', jaTrack);
            console.log('[LinguaPlay-Bridge] Switched captions to Japanese track:', jaTrack);
            window.dispatchEvent(new CustomEvent('LINGUAPLAY_TRACK_SWITCHED', {
              detail: { track: jaTrack, tracklist }
            }));
            ensureSubtitlesVisible();
            return true;
          }
        } else if (isAlreadyJapanese) {
          ensureSubtitlesVisible();
        }
      }
    }

    return false;
  }

  // Listen for requests from Isolated World (content.js)
  window.addEventListener('LINGUAPLAY_REQUEST_TRACK_SWITCH', (e) => {
    const player = getPlayer();
    if (!player) return;
    if (typeof player.loadModule === 'function') {
      try { player.loadModule('captions'); } catch (err) {}
    }
    const tracklist = typeof player.getOption === 'function' ? player.getOption('captions', 'tracklist') : null;
    const target = (Array.isArray(tracklist) && e.detail?.vssId)
      ? tracklist.find(t => (t.vssId || t.vss_id) === e.detail.vssId)
      : findBestJapaneseTrack(tracklist);

    if (target && typeof player.setOption === 'function') {
      player.setOption('captions', 'track', target);
      console.log('[LinguaPlay-Bridge] Custom switch to Japanese track:', target);
      window.dispatchEvent(new CustomEvent('LINGUAPLAY_TRACK_SWITCHED', {
        detail: { track: target, tracklist }
      }));
      ensureSubtitlesVisible();
    } else if (typeof player.setOption === 'function') {
      player.setOption('captions', 'track', { languageCode: 'ja' });
      ensureSubtitlesVisible();
    }
  });

  // Check on video load, SPA navigation, and periodical polling
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(ensureJapaneseTrackActive, 300);
    setTimeout(ensureJapaneseTrackActive, 1000);
    setTimeout(ensureJapaneseTrackActive, 2500);
  });

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(ensureJapaneseTrackActive, 500);
    setTimeout(ensureJapaneseTrackActive, 1500);
  });

  setInterval(ensureJapaneseTrackActive, 1000);

})();
