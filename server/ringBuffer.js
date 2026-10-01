import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';

export class RingBuffer {
  /**
   * @param {number} capacity Maximum number of items to keep
   * @param {string} storageFile File path for optional persistence
   */
  constructor(capacity = 20, storageFile = CONFIG.DATA_PERSISTENCE_FILE) {
    this.capacity = capacity;
    this.storageFile = storageFile;
    /** @type {Array<any>} */
    this.items = [];

    if (CONFIG.PERSIST_TO_DISK) {
      this.load();
    }
  }

  /**
   * Add a new item to the top of the buffer.
   * Evicts the oldest item if capacity is exceeded.
   * @param {object} item
   * @returns {object} The added item
   */
  push(item) {
    // Prepend so index 0 is always newest
    this.items.unshift(item);

    // Evict oldest if exceeding capacity
    while (this.items.length > this.capacity) {
      const evicted = this.items.pop();
      this._cleanupItemFiles(evicted);
    }

    this._persist();
    return item;
  }

  /**
   * Return all items ordered newest first
   * @returns {Array<object>}
   */
  getAll() {
    return [...this.items];
  }

  /**
   * Find item by ID
   * @param {string} id
   * @returns {object|null}
   */
  getById(id) {
    return this.items.find((item) => item.id === id) || null;
  }

  /**
   * Delete item by ID
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return false;

    const [deleted] = this.items.splice(index, 1);
    this._cleanupItemFiles(deleted);
    this._persist();
    return true;
  }

  /**
   * Clear all items and purge uploaded files
   */
  clear() {
    for (const item of this.items) {
      this._cleanupItemFiles(item);
    }
    this.items = [];
    this._persist();
  }

  /**
   * Clean up files on disk if the item was an uploaded asset
   * @private
   */
  _cleanupItemFiles(item) {
    if (!item) return;
    if (item.type === 'FILE' || item.type === 'IMAGE') {
      const fileId = item.metadata?.fileId;
      if (fileId) {
        const filePath = path.join(CONFIG.UPLOAD_DIR, fileId);
        fs.unlink(filePath, (err) => {
          if (err && err.code !== 'ENOENT') {
            console.error(`[ClipSync] Failed to cleanup file ${filePath}:`, err.message);
          }
        });
      }
    }
  }

  /**
   * Save items to disk
   * @private
   */
  _persist() {
    if (!CONFIG.PERSIST_TO_DISK) return;
    try {
      fs.writeFileSync(this.storageFile, JSON.stringify(this.items, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ClipSync] Error persisting ring buffer to disk:', err.message);
    }
  }

  /**
   * Load items from disk
   */
  load() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const data = fs.readFileSync(this.storageFile, 'utf-8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          this.items = parsed.slice(0, this.capacity);
        }
      }
    } catch (err) {
      console.warn('[ClipSync] Could not load persisted data, starting fresh:', err.message);
      this.items = [];
    }
  }
}

export const ringBuffer = new RingBuffer(CONFIG.MAX_HISTORY);
