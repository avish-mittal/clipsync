import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import { ringBuffer } from './ringBuffer.js';
import { CONFIG } from './config.js';

export class WebSocketHandler {
  /**
   * @param {import('node:http').Server} server
   */
  constructor(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    /** @type {Map<WebSocket, { id: string, ip: string, device: object, isAlive: boolean }>} */
    this.clients = new Map();

    this.wss.on('connection', (ws, req) => this._onConnection(ws, req));

    // Setup heartbeat interval
    this.heartbeatTimer = setInterval(() => {
      for (const [ws, client] of this.clients.entries()) {
        if (!client.isAlive) {
          ws.terminate();
          this.clients.delete(ws);
          this._broadcastPeerCount();
          continue;
        }
        client.isAlive = false;
        ws.ping();
      }
    }, CONFIG.PING_INTERVAL_MS);

    this.wss.on('close', () => {
      clearInterval(this.heartbeatTimer);
    });
  }

  /**
   * Handle incoming connection
   * @private
   */
  _onConnection(ws, req) {
    const id = crypto.randomUUID();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    const clientInfo = {
      id,
      ip,
      device: {
        name: 'Device',
        type: 'desktop',
        os: 'Unknown',
      },
      isAlive: true,
    };

    this.clients.set(ws, clientInfo);

    // Setup pong listener
    ws.on('pong', () => {
      const c = this.clients.get(ws);
      if (c) c.isAlive = true;
    });

    // Send initial history and peer count immediately
    this._send(ws, 'sync:history', ringBuffer.getAll());
    this._broadcastPeerCount();

    // Listen for incoming messages
    ws.on('message', (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        this._handleMessage(ws, payload);
      } catch (err) {
        console.error('[ClipSync WS] Invalid message format:', err.message);
      }
    });

    // Cleanup on disconnect
    ws.on('close', () => {
      this.clients.delete(ws);
      this._broadcastPeerCount();
    });

    ws.on('error', (err) => {
      console.error('[ClipSync WS] Client error:', err.message);
      this.clients.delete(ws);
      this._broadcastPeerCount();
    });
  }

  /**
   * Dispatch client messages
   * @private
   */
  _handleMessage(ws, message) {
    const { event, data } = message;
    const client = this.clients.get(ws);
    if (!client) return;

    switch (event) {
      case 'sync:register': {
        // Client registers device information
        if (data && typeof data === 'object') {
          client.device = {
            name: data.name || client.device.name,
            type: data.type || client.device.type,
            os: data.os || client.device.os,
          };
          this._broadcastPeerCount();
        }
        break;
      }

      case 'sync:new_item': {
        if (!data || !data.content) return;

        const item = {
          id: crypto.randomUUID(),
          type: data.type || 'TEXT',
          content: data.content,
          metadata: data.metadata || {},
          sender: {
            id: client.id,
            name: client.device.name,
            type: client.device.type,
            os: client.device.os,
          },
          createdAt: new Date().toISOString(),
        };

        ringBuffer.push(item);
        // Broadcast new item to all connected clients
        this.broadcast('sync:new_item', item);
        break;
      }

      case 'sync:delete': {
        if (!data || !data.id) return;
        const deleted = ringBuffer.delete(data.id);
        if (deleted) {
          this.broadcast('sync:delete', { id: data.id });
        }
        break;
      }

      case 'sync:clear': {
        ringBuffer.clear();
        this.broadcast('sync:clear', {});
        break;
      }

      case 'ping': {
        this._send(ws, 'pong', { time: Date.now() });
        break;
      }

      default:
        console.warn('[ClipSync WS] Unknown event received:', event);
    }
  }

  /**
   * Broadcast message to all connected clients
   * @param {string} event
   * @param {any} data
   * @param {WebSocket} [excludeWs]
   */
  broadcast(event, data, excludeWs = null) {
    const payload = JSON.stringify({ event, data });
    for (const [clientWs] of this.clients.entries()) {
      if (clientWs !== excludeWs && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(payload);
      }
    }
  }

  /**
   * Send message to single client
   * @private
   */
  _send(ws, event, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, data }));
    }
  }

  /**
   * Broadcast updated peer count and active device overview
   * @private
   */
  _broadcastPeerCount() {
    const peerList = Array.from(this.clients.values()).map((c) => ({
      id: c.id,
      device: c.device,
    }));

    this.broadcast('peer_count', {
      count: this.clients.size,
      peers: peerList,
    });
  }

  /**
   * Get active peer count
   */
  getPeerCount() {
    return this.clients.size;
  }
}
