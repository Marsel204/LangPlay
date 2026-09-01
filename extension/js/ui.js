/**
 * LinguaPlay Chrome Extension — UI & Interaction Module (ui.js)
 * Modals, toasts, and search results view.
 */

let toastTimeout = null;

export function showToast(message, type = 'info', duration = 3000) {
  let toastEl = document.getElementById('lingua-toast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'lingua-toast';
    toastEl.className = 'toast-notice px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 border';
    document.body.appendChild(toastEl);
  }

  const bgStyles = {
    info: 'background-color: #16132a; border-color: rgba(167,139,250,0.4); color: #e2e8f0;',
    success: 'background-color: rgba(6, 78, 59, 0.95); border-color: rgba(52, 211, 153, 0.5); color: #6ee7b7;',
    warn: 'background-color: rgba(120, 53, 15, 0.95); border-color: rgba(245, 158, 11, 0.5); color: #fde68a;',
    error: 'background-color: rgba(136, 19, 55, 0.95); border-color: rgba(244, 63, 94, 0.5); color: #fecdd3;'
  };

  const icons = {
    info: 'ℹ️',
    success: '✓',
    warn: '⚠️',
    error: '✕'
  };

  toastEl.style.cssText = bgStyles[type] || bgStyles.info;
  toastEl.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  toastEl.classList.add('show');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

export function setupModalTriggers() {
  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) modal.classList.add('hidden');
    });
  });
}

export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

export function renderSearchResults(videos, container, onSelectVideo) {
  if (!container) return;
  container.innerHTML = '';

  if (!videos || videos.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-slate-400 text-sm">
        No videos found. Try another search query or paste a direct YouTube URL.
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
      <div class="relative aspect-video bg-black overflow-hidden shrink-0" style="aspect-ratio: 16/9;">
        ${thumbUrl ? `<img src="${thumbUrl}" alt="${v.title || ''}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" style="object-fit: cover;">` : `<div class="w-full h-full flex items-center justify-center text-slate-600">No Preview</div>`}
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
