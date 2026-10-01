/**
 * ClipSync - Clipboard and Content Detection Utilities
 */

/**
 * Detect client OS and device form factor
 */
export function getDeviceInfo() {
  const ua = navigator.userAgent;
  let os = 'Unknown';
  let type = 'desktop';

  if (/iPhone|iPad|iPod/i.test(ua)) {
    os = 'iOS';
    type = 'mobile';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    type = 'mobile';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
    type = 'desktop';
  } else if (/Windows NT/i.test(ua)) {
    os = 'Windows';
    type = 'desktop';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
    type = 'desktop';
  }

  // Format a friendly device name, e.g. "MacBook (Chrome)" or "Windows PC"
  let name = `${os} ${type === 'mobile' ? 'Mobile' : 'Device'}`;
  return { os, type, name };
}

/**
 * Classify text content as LINK, CODE, or TEXT
 * @param {string} text
 * @returns {'LINK' | 'CODE' | 'TEXT'}
 */
export function detectContentType(text) {
  if (!text) return 'TEXT';
  const trimmed = text.trim();

  // 1. Detect URL
  if (/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed)) {
    return 'LINK';
  }

  // 2. Detect Code Snippet
  const codePatterns = [
    /^(const|let|var|function|def|class|import|export|from|return|if|for|while|switch|case|async|await)\b/m,
    /[{}[\];]{2,}/,
    /^\s*(public|private|protected|fn|val|fun|package)\b/m,
    /<\/?[a-z][\s\S]*>/i, // HTML/XML
    /^\s*(\{|\{|\[)[\s\S]*(\}\}|\])\s*$/, // JSON / Object literal
    /=>|\$\(|\bconsole\.(log|error|warn)\b/,
    /SELECT\s+.*\s+FROM\s+/i, // SQL
  ];

  const lines = trimmed.split('\n');
  const hasMultipleLines = lines.length >= 2;
  const matchesCodePattern = codePatterns.some((pattern) => pattern.test(trimmed));

  if (matchesCodePattern || (hasMultipleLines && /^\s{2,}|\t/m.test(trimmed))) {
    return 'CODE';
  }

  return 'TEXT';
}

/**
 * Copy text to native clipboard with multi-environment fallback
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  if (!text) return false;

  // Try modern Clipboard API first
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('[ClipSync] navigator.clipboard.writeText failed, using fallback:', err);
    }
  }

  // Fallback for non-secure contexts (e.g. plain HTTP on local LAN IP)
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('[ClipSync] Clipboard copy fallback failed:', err);
    return false;
  }
}

/**
 * Format relative time (e.g., "Just now", "2m ago")
 * @param {string|number|Date} date
 * @returns {string}
 */
export function formatRelativeTime(date) {
  const timestamp = new Date(date).getTime();
  if (isNaN(timestamp)) return '';

  const diffSec = Math.floor((Date.now() - timestamp) / 1000);

  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

/**
 * Format file size in human readable string
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
