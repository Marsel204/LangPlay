/**
 * LinguaPlay — UI & Interaction Module (ui.js)
 * Manages modal dialogues, drawers, toasts, and rich search results view.
 */

let toastTimeout = null;

/**
 * Show a floating toast notification
 * @param {string} message
 * @param {'info'|'success'|'warn'|'error'} type
 * @param {number} duration
 */
export function showToast(message, type = 'info', duration = 3000) {
  let toastEl = document.getElementById('lingua-toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'lingua-toast';
    toastEl.className = 'toast-notice px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 border';
    document.body.appendChild(toastEl);
  }

  const bgClasses = {
    info: 'bg-surface-200 border-accent/40 text-slate-200',
    success: 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300',
    warn: 'bg-amber-950/90 border-amber-500/50 text-amber-300',
    error: 'bg-rose-950/90 border-rose-500/50 text-rose-300'
  };

  const icons = {
    info: 'ℹ️',
    success: '✓',
    warn: '⚠️',
    error: '✕'
  };

  toastEl.className = `toast-notice px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 border ${bgClasses[type] || bgClasses.info}`;
  toastEl.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  toastEl.classList.add('show');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

/**
 * Setup modal close triggers
 */
export function setupModalTriggers() {
  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) modal.classList.add('hidden');
    });
  });
}

/**
 * Open a modal by ID
 * @param {string} modalId
 */
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
}

/**
 * Close a modal by ID
 * @param {string} modalId
 */
export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

/**
 * Render YouTube Search Results into container
 * @param {Array<object>} videos
 * @param {HTMLElement} container
 * @param {Function} onSelectVideo - Callback with (video, isFolder)
 */
export function renderSearchResults(videos, container, onSelectVideo) {
  if (!container) return;
  container.innerHTML = '';

  if (!videos || videos.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-slate-400 text-sm">
        No videos found. Try another query or paste a direct YouTube link.
      </div>
    `;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5';

  videos.forEach(v => {
    if (!v.id && !v.url) return;

    const isFolder = v.ie_key === 'YoutubeTab' || v._type === 'playlist' ||
      (v.url && (v.url.includes('/channel/') || v.url.includes('/@') || v.url.includes('playlist?list=')));

    let thumbUrl = v.id ? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg` : '';
    if (v.thumbnails && v.thumbnails.length > 0) {
      thumbUrl = v.thumbnails[v.thumbnails.length - 1].url || v.thumbnails[0].url;
    }

    let durationStr = '';
    if (v.duration_string) {
      durationStr = v.duration_string;
    } else if (v.duration) {
      durationStr = new Date(v.duration * 1000).toISOString().substr(11, 8).replace(/^00:/, '');
    } else if (isFolder) {
      durationStr = '📁 Browse';
    }

    const card = document.createElement('div');
    card.className = 'bg-surface-200/70 hover:bg-surface-100 rounded-xl overflow-hidden cursor-pointer border border-slate-700/50 hover:border-accent/60 transition-all duration-200 group flex flex-col shadow-lg';

    card.innerHTML = `
      <div class="relative aspect-video bg-black overflow-hidden shrink-0">
        ${thumbUrl ? `<img src="${thumbUrl}" alt="${v.title || ''}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">` : `<div class="w-full h-full flex items-center justify-center text-slate-600">No Preview</div>`}
        ${isFolder ? `<div class="absolute top-2 left-2 bg-accent/90 px-2 py-0.5 rounded text-[10px] text-white font-bold backdrop-blur-sm shadow-md uppercase tracking-wider">Folder</div>` : ''}
        ${durationStr ? `<div class="absolute bottom-1.5 right-1.5 bg-black/80 px-1.5 py-0.5 rounded text-[10px] text-white font-medium backdrop-blur-sm font-mono">${durationStr}</div>` : ''}
      </div>
      <div class="p-3 flex-1 flex flex-col justify-between gap-1.5">
        <h4 class="text-xs font-bold text-slate-200 line-clamp-2 leading-snug group-hover:text-accent-light transition-colors">${v.title || 'Untitled'}</h4>
        <p class="text-[11px] text-slate-400 truncate">${v.uploader || v.channel || ''}</p>
      </div>
    `;

    card.addEventListener('click', () => {
      if (onSelectVideo) onSelectVideo(v, isFolder);
    });

    grid.appendChild(card);
  });

  container.appendChild(grid);
}
