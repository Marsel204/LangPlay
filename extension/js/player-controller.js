/**
 * LinguaPlay Chrome Extension — Player Controller Module (player-controller.js)
 * Unifies HTML5 native <video> element and YouTube IFrame Player API.
 */

let mediaMode = 'native'; // 'native' | 'youtube'
let videoEl = null;
let ytPlayer = null;
let ytApiReadyPromise = null;
let ytPollInterval = null;
let onTimeUpdateCallback = null;
let ytPlayerReady = false;

function ensureYouTubeApiReady() {
  if (ytApiReadyPromise) return ytApiReadyPromise;

  ytApiReadyPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') {
      return resolve();
    }
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    const checkInterval = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 60);

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearInterval(checkInterval);
      if (typeof prevCallback === 'function') prevCallback();
      resolve();
    };

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });

  return ytApiReadyPromise;
}

export function initPlayer(videoElement, timeUpdateHandler) {
  videoEl = videoElement;
  onTimeUpdateCallback = timeUpdateHandler;

  if (videoEl) {
    videoEl.addEventListener('timeupdate', () => {
      if (mediaMode === 'native' && onTimeUpdateCallback) {
        onTimeUpdateCallback(videoEl.currentTime);
      }
    });
  }

  ensureYouTubeApiReady();
}

export function loadLocalVideo(file) {
  if (!videoEl || !file) return;
  mediaMode = 'native';
  stopYTPolling();

  if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
    try { ytPlayer.pauseVideo(); } catch (e) { /* ignore */ }
  }

  const container = document.getElementById('youtube-player-container');
  if (container) container.classList.add('hidden');
  if (videoEl) {
    videoEl.classList.remove('hidden');
    videoEl.src = URL.createObjectURL(file);
    videoEl.load();
  }
}

export async function loadYouTubeVideo(videoId, onErrorCallback = null) {
  await ensureYouTubeApiReady();
  mediaMode = 'youtube';

  if (videoEl) {
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
    videoEl.classList.add('hidden');
  }

  const container = document.getElementById('youtube-player-container');
  if (container) container.classList.remove('hidden');

  return new Promise((resolve) => {
    if (ytPlayer && typeof ytPlayer.loadVideoById === 'function' && ytPlayerReady) {
      try {
        ytPlayer.loadVideoById(videoId);
        startYTPolling();
        resolve();
        return;
      } catch (e) {
        console.warn('[Player] loadVideoById failed, re-initializing player:', e);
      }
    }

    let playerDiv = document.getElementById('youtube-player');
    if (!playerDiv && container) {
      container.innerHTML = '<div id="youtube-player" class="w-full h-full"></div>';
    }

    ytPlayer = new window.YT.Player('youtube-player', {
      videoId,
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: 1,
        controls: 1,
        rel: 0,
        playsinline: 1,
        modestbranding: 1,
        fs: 1,
        enablejsapi: 1,
        origin: window.location.origin
      },
      events: {
        onReady: () => {
          ytPlayerReady = true;
          startYTPolling();
          resolve();
        },
        onStateChange: (event) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            startYTPolling();
          } else {
            stopYTPolling();
            if (onTimeUpdateCallback) {
              onTimeUpdateCallback(getCurrentTime());
            }
          }
        },
        onError: async (e) => {
          console.error('[Player] YouTube player error code:', e.data);
          if (onErrorCallback) {
            onErrorCallback(e.data, videoId);
          }
        }
      }
    });
  });
}

function startYTPolling() {
  stopYTPolling();
  ytPollInterval = setInterval(() => {
    if (mediaMode === 'youtube' && onTimeUpdateCallback) {
      onTimeUpdateCallback(getCurrentTime());
    }
  }, 200);
}

function stopYTPolling() {
  if (ytPollInterval) {
    clearInterval(ytPollInterval);
    ytPollInterval = null;
  }
}

export function getCurrentTime() {
  if (mediaMode === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
    try {
      return ytPlayer.getCurrentTime() || 0;
    } catch (e) {
      return 0;
    }
  }
  return videoEl ? videoEl.currentTime : 0;
}

export function seekTo(seconds) {
  const target = Math.max(0, seconds);
  if (mediaMode === 'youtube' && ytPlayer && typeof ytPlayer.seekTo === 'function') {
    try {
      ytPlayer.seekTo(target, true);
    } catch (e) { /* ignore */ }
  } else if (videoEl) {
    videoEl.currentTime = target;
  }
}

export function playMedia() {
  if (mediaMode === 'youtube' && ytPlayer && typeof ytPlayer.playVideo === 'function') {
    try { ytPlayer.playVideo(); } catch (e) { /* ignore */ }
  } else if (videoEl) {
    videoEl.play().catch(() => {});
  }
}

export function pauseMedia() {
  if (mediaMode === 'youtube' && ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
    try { ytPlayer.pauseVideo(); } catch (e) { /* ignore */ }
  } else if (videoEl) {
    videoEl.pause();
  }
}

export function togglePlayPause() {
  if (isMediaPaused()) {
    playMedia();
  } else {
    pauseMedia();
  }
}

export function isMediaPaused() {
  if (mediaMode === 'youtube' && ytPlayer && typeof ytPlayer.getPlayerState === 'function') {
    try {
      return ytPlayer.getPlayerState() !== window.YT.PlayerState.PLAYING;
    } catch (e) {
      return true;
    }
  }
  return videoEl ? videoEl.paused : true;
}

export function getMediaMode() {
  return mediaMode;
}

export function setMediaMode(mode) {
  mediaMode = mode;
}

export { isMediaPaused as isPaused };
