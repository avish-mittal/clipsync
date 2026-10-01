/**
 * ClipSync - Main Frontend Application Controller
 */

import { socket } from './websocket.js';
import {
  getDeviceInfo,
  detectContentType,
  copyToClipboard,
  formatRelativeTime,
  formatBytes,
} from './clipboard.js';

// Application State
const state = {
  items: [],
  peerCount: 1,
  serverInfo: null,
  isUploading: false,
};

// DOM Elements
const elements = {
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  peerCountText: document.getElementById('peer-count-text'),
  feedList: document.getElementById('feed-list'),
  feedCount: document.getElementById('feed-count'),
  emptyState: document.getElementById('empty-state'),
  inputArea: document.getElementById('input-area'),
  broadcastBtn: document.getElementById('broadcast-btn'),
  uploadBtn: document.getElementById('upload-btn'),
  fileInput: document.getElementById('file-input'),
  clearBtn: document.getElementById('clear-btn'),
  dropOverlay: document.getElementById('drop-overlay'),
  qrModal: document.getElementById('qr-modal'),
  qrBtn: document.getElementById('qr-btn'),
  closeQrBtn: document.getElementById('close-qr-btn'),
  qrImage: document.getElementById('qr-image'),
  qrUrlText: document.getElementById('qr-url-text'),
  copyQrUrlBtn: document.getElementById('copy-qr-url-btn'),
  toastContainer: document.getElementById('toast-container'),
};

/**
 * Toast Notification System
 */
export function showToast(message, type = 'info', duration = 2500) {
  const toast = document.createElement('div');
  toast.className = 'toast';

  const icons = {
    success: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`,
    info: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
    error: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  };

  toast.innerHTML = `${icons[type] || icons.info}<span>${escapeHtml(message)}</span>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * SVG Icons mapping
 */
const ICONS = {
  desktop: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
  mobile: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
  check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`,
  trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`,
  download: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  externalLink: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  file: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`,
};

/**
 * Render all feed items
 */
function renderFeed() {
  const items = state.items;
  elements.feedCount.textContent = items.length;

  if (items.length === 0) {
    elements.emptyState.style.display = 'flex';
    elements.feedList.innerHTML = '';
    return;
  }

  elements.emptyState.style.display = 'none';
  elements.feedList.innerHTML = '';

  for (const item of items) {
    const card = createItemCard(item);
    elements.feedList.appendChild(card);
  }
}

/**
 * Create a single item DOM element
 */
function createItemCard(item) {
  const card = document.createElement('div');
  card.className = 'item-card';
  card.dataset.id = item.id;

  const deviceIcon = item.sender?.type === 'mobile' ? ICONS.mobile : ICONS.desktop;
  const senderName = item.sender?.name || 'Peer';
  const typeClass = `type-${(item.type || 'text').toLowerCase()}`;
  const relativeTime = formatRelativeTime(item.createdAt);

  // Card Header
  let headerHtml = `
    <div class="item-header">
      <div class="item-meta-left">
        <span class="type-badge ${typeClass}">${item.type}</span>
        <span class="device-badge" title="${escapeHtml(item.sender?.os || '')}">${deviceIcon} ${escapeHtml(senderName)}</span>
      </div>
      <div class="item-meta-right">
        <span class="item-time" data-timestamp="${item.createdAt}">${relativeTime}</span>
      </div>
    </div>
  `;

  // Card Content Body
  let bodyHtml = `<div class="item-body">`;
  let copyValue = item.content;

  if (item.type === 'LINK') {
    const safeUrl = escapeHtml(item.content);
    bodyHtml += `
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="link-preview">
        ${ICONS.externalLink}
        <span>${safeUrl}</span>
      </a>
    `;
  } else if (item.type === 'CODE') {
    bodyHtml += `<pre class="code-preview"><code>${escapeHtml(item.content)}</code></pre>`;
  } else if (item.type === 'IMAGE') {
    const imgUrl = item.metadata?.url || `/api/v1/download/${item.metadata?.fileId}`;
    copyValue = window.location.origin + imgUrl;
    bodyHtml += `
      <div class="file-card-inner">
        <div class="file-info">
          <div class="file-icon">${ICONS.file}</div>
          <div class="file-meta-details">
            <span class="file-name" title="${escapeHtml(item.metadata?.filename || item.content)}">${escapeHtml(item.metadata?.filename || item.content)}</span>
            <span class="file-size">${formatBytes(item.metadata?.size)} • ${escapeHtml(item.metadata?.mimeType || 'image')}</span>
          </div>
        </div>
      </div>
      <div class="image-preview-wrap">
        <img src="${imgUrl}" alt="${escapeHtml(item.metadata?.filename || 'Pasted image')}" loading="lazy" />
      </div>
    `;
  } else if (item.type === 'FILE') {
    const fileUrl = item.metadata?.url || `/api/v1/download/${item.metadata?.fileId}`;
    copyValue = window.location.origin + fileUrl;
    bodyHtml += `
      <div class="file-card-inner">
        <div class="file-info">
          <div class="file-icon">${ICONS.file}</div>
          <div class="file-meta-details">
            <span class="file-name" title="${escapeHtml(item.metadata?.filename || item.content)}">${escapeHtml(item.metadata?.filename || item.content)}</span>
            <span class="file-size">${formatBytes(item.metadata?.size)}</span>
          </div>
        </div>
      </div>
    `;
  } else {
    // TEXT default
    bodyHtml += `<div class="text-preview">${escapeHtml(item.content)}</div>`;
  }
  bodyHtml += `</div>`;

  // Card Footer Actions
  let footerHtml = `
    <div class="item-footer">
      <button class="btn btn-icon delete-btn" title="Delete clip" data-id="${item.id}">
        ${ICONS.trash}
      </button>
  `;

  if (item.type === 'FILE' || item.type === 'IMAGE') {
    const fileUrl = item.metadata?.url || `/api/v1/download/${item.metadata?.fileId}?download=1`;
    footerHtml += `
      <a href="${fileUrl}" download="${escapeHtml(item.metadata?.filename || 'download')}" class="btn" title="Download file">
        ${ICONS.download}
        <span>Download</span>
      </a>
    `;
  }

  footerHtml += `
      <button class="btn copy-btn" data-copy="${escapeHtml(copyValue)}" title="Copy to clipboard">
        ${ICONS.copy}
        <span class="copy-label">Copy</span>
      </button>
    </div>
  `;

  card.innerHTML = headerHtml + bodyHtml + footerHtml;

  // Bind Actions for this card
  const copyBtn = card.querySelector('.copy-btn');
  copyBtn.addEventListener('click', async () => {
    const textToCopy = copyBtn.getAttribute('data-copy');
    const success = await copyToClipboard(textToCopy);
    if (success) {
      copyBtn.innerHTML = `${ICONS.check} <span class="copy-label" style="color:#10b981;">Copied!</span>`;
      setTimeout(() => {
        copyBtn.innerHTML = `${ICONS.copy} <span class="copy-label">Copy</span>`;
      }, 1800);
      showToast('Copied to clipboard', 'success', 1500);
    } else {
      showToast('Failed to copy', 'error');
    }
  });

  const deleteBtn = card.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', () => {
    socket.send('sync:delete', { id: item.id });
  });

  return card;
}

/**
 * Broadcast current text input
 */
function broadcastCurrentInput() {
  const text = elements.inputArea.value.trim();
  if (!text) return;

  const type = detectContentType(text);
  const deviceInfo = getDeviceInfo();

  socket.send('sync:new_item', {
    type,
    content: text,
    metadata: {
      url: type === 'LINK' ? text : undefined,
    },
    sender: deviceInfo,
  });

  elements.inputArea.value = '';
  elements.inputArea.style.height = 'auto';
  showToast('Broadcasted to all devices', 'success', 1200);
}

/**
 * Upload single or multiple files
 */
async function uploadFiles(files) {
  if (!files || files.length === 0) return;

  state.isUploading = true;
  elements.broadcastBtn.disabled = true;

  for (const file of files) {
    showToast(`Uploading ${file.name}...`, 'info', 2000);
    const formData = new FormData();
    formData.append('file', file);
    const dev = getDeviceInfo();
    formData.append('senderName', dev.name);
    formData.append('senderType', dev.type);
    formData.append('senderOs', dev.os);

    try {
      const res = await fetch('/api/v1/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Upload failed with status ${res.status}`);
      }

      showToast(`Shared ${file.name}`, 'success', 2000);
    } catch (err) {
      console.error('[ClipSync] Upload error:', err);
      showToast(`Upload failed for ${file.name}`, 'error', 3000);
    }
  }

  state.isUploading = false;
  elements.broadcastBtn.disabled = false;
}

/**
 * Handle global CMD/CTRL+V anywhere on page
 */
function handleGlobalPaste(e) {
  // If user pasted files or images
  const items = e.clipboardData?.items;
  const files = e.clipboardData?.files;

  if (files && files.length > 0) {
    e.preventDefault();
    uploadFiles(files);
    return;
  }

  // Handle pasted text
  const pastedText = e.clipboardData?.getData('text');
  if (pastedText) {
    // If not focused on another interactive input, immediately broadcast
    const activeEl = document.activeElement;
    const isTargetInput = activeEl === elements.inputArea;

    if (!isTargetInput) {
      e.preventDefault();
      const type = detectContentType(pastedText);
      const deviceInfo = getDeviceInfo();

      socket.send('sync:new_item', {
        type,
        content: pastedText,
        metadata: {
          url: type === 'LINK' ? pastedText.trim() : undefined,
        },
        sender: deviceInfo,
      });

      showToast('Pasted & Synced!', 'success', 1500);
    }
  }
}

/**
 * Drag and Drop handlers
 */
function initDragAndDrop() {
  let dragCounter = 0;

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    elements.dropOverlay.classList.add('active');
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      elements.dropOverlay.classList.remove('active');
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    elements.dropOverlay.classList.remove('active');

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      uploadFiles(files);
    }
  });
}

/**
 * Fetch and open QR Code Modal
 */
async function openQrModal() {
  try {
    const res = await fetch('/api/v1/info');
    const info = await res.json();
    state.serverInfo = info;

    elements.qrUrlText.textContent = info.primaryUrl;
    elements.qrImage.src = `/api/v1/qr?url=${encodeURIComponent(info.primaryUrl)}&format=png&t=${Date.now()}`;
    elements.qrModal.classList.add('open');
  } catch (err) {
    console.error('[ClipSync] Failed to fetch server info:', err);
    showToast('Failed to load connection info', 'error');
  }
}

function closeQrModal() {
  elements.qrModal.classList.remove('open');
}

/**
 * Setup WebSocket Listeners
 */
function initWebSocketListeners() {
  socket.on('connected', () => {
    elements.statusDot.className = 'status-dot connected';
    elements.statusText.textContent = 'Connected';
  });

  socket.on('disconnected', () => {
    elements.statusDot.className = 'status-dot disconnected';
    elements.statusText.textContent = 'Disconnected';
  });

  socket.on('peer_count', (data) => {
    state.peerCount = data.count || 1;
    const text = state.peerCount === 1 ? '1 device' : `${state.peerCount} devices`;
    elements.peerCountText.textContent = text;
  });

  socket.on('sync:history', (items) => {
    state.items = items || [];
    renderFeed();
  });

  socket.on('sync:new_item', (item) => {
    // Add to top of local items
    state.items = [item, ...state.items.filter((i) => i.id !== item.id)];
    renderFeed();
  });

  socket.on('sync:delete', (data) => {
    state.items = state.items.filter((i) => i.id !== data.id);
    renderFeed();
  });

  socket.on('sync:clear', () => {
    state.items = [];
    renderFeed();
    showToast('Clipboard history cleared', 'info');
  });
}

/**
 * Initialize event bindings
 */
function initEventBindings() {
  // Global paste handler
  window.addEventListener('paste', handleGlobalPaste);

  // Broadcast button
  elements.broadcastBtn.addEventListener('click', broadcastCurrentInput);

  // Textarea keyboard shortcuts: Enter / Cmd+Enter
  elements.inputArea.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      broadcastCurrentInput();
    }
  });

  // Auto-resize textarea
  elements.inputArea.addEventListener('input', () => {
    elements.inputArea.style.height = 'auto';
    elements.inputArea.style.height = `${Math.min(elements.inputArea.scrollHeight, 320)}px`;
  });

  // File upload button
  elements.uploadBtn.addEventListener('click', () => {
    elements.fileInput.click();
  });

  elements.fileInput.addEventListener('change', (e) => {
    uploadFiles(e.target.files);
    elements.fileInput.value = '';
  });

  // Clear history
  elements.clearBtn.addEventListener('click', () => {
    if (state.items.length === 0) return;
    if (confirm('Clear all clips from all devices?')) {
      socket.send('sync:clear', {});
    }
  });

  // QR Modal buttons
  elements.qrBtn.addEventListener('click', openQrModal);
  elements.closeQrBtn.addEventListener('click', closeQrModal);
  elements.qrModal.addEventListener('click', (e) => {
    if (e.target === elements.qrModal) closeQrModal();
  });

  elements.copyQrUrlBtn.addEventListener('click', async () => {
    const text = elements.qrUrlText.textContent;
    const ok = await copyToClipboard(text);
    if (ok) showToast('URL copied!', 'success');
  });

  // Keyboard shortcut: ESC to close modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeQrModal();
  });

  // Update relative timestamps every 30 seconds
  setInterval(() => {
    document.querySelectorAll('.item-time[data-timestamp]').forEach((el) => {
      const ts = el.getAttribute('data-timestamp');
      if (ts) el.textContent = formatRelativeTime(ts);
    });
  }, 30000);
}

// Bootstrap Application
function init() {
  initWebSocketListeners();
  initDragAndDrop();
  initEventBindings();
  socket.connect();
}

// Start when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
