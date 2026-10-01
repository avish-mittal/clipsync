/**
 * ClipSync - Real-Time WebSocket Client
 */

import { getDeviceInfo } from './clipboard.js';

export class ClipSyncSocket {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 30;
    this.baseReconnectDelay = 1000;
    this.listeners = new Map();
    this.deviceInfo = getDeviceInfo();
    this.isConnected = false;
  }

  /**
   * Connect to server WebSocket endpoint
   */
  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this._emit('connected', {});

        // Register device with server
        this.send('sync:register', this.deviceInfo);
      };

      this.ws.onmessage = (event) => {
        try {
          const { event: evName, data } = JSON.parse(event.data);
          this._emit(evName, data);
        } catch (err) {
          console.error('[ClipSync WS] Parse error:', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this._emit('disconnected', {});
        this._scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('[ClipSync WS] Socket error:', err);
        this.ws?.close();
      };
    } catch (err) {
      console.error('[ClipSync WS] Connection failed:', err);
      this._scheduleReconnect();
    }
  }

  /**
   * Schedule automatic reconnect with exponential backoff
   * @private
   */
  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[ClipSync WS] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      10000
    );
    this.reconnectAttempts++;

    setTimeout(() => {
      console.log(`[ClipSync WS] Reconnecting (attempt ${this.reconnectAttempts})...`);
      this.connect();
    }, delay);
  }

  /**
   * Send an event payload to server
   * @param {string} event
   * @param {any} data
   */
  send(event, data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
      return true;
    }
    return false;
  }

  /**
   * Register event listener
   * @param {string} event
   * @param {Function} callback
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  /**
   * Remove event listener
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    const list = this.listeners.get(event);
    if (list) {
      list.delete(callback);
    }
  }

  /**
   * Trigger internal event
   * @private
   */
  _emit(event, data) {
    const list = this.listeners.get(event);
    if (list) {
      for (const cb of list) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[ClipSync WS] Callback error for ${event}:`, err);
        }
      }
    }
  }
}

export const socket = new ClipSyncSocket();
