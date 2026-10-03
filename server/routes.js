import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { CONFIG } from './config.js';
import { ringBuffer } from './ringBuffer.js';
import { getLocalIpAddresses, getPrimaryLanIp } from './networkUtils.js';

/**
 * Configure multer storage for ephemeral uploads
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(CONFIG.UPLOAD_DIR)) {
      fs.mkdirSync(CONFIG.UPLOAD_DIR, { recursive: true });
    }
    cb(null, CONFIG.UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Generate safe unique filename
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const ext = path.extname(file.originalname) || '';
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${safeBase}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024,
  },
});

/**
 * @param {import('./wsHandler.js').WebSocketHandler} wsHandler
 */
export function createRouter(wsHandler) {
  const router = express.Router();

  /**
   * GET /api/v1/info
   * Returns server networking info, active LAN addresses, peer counts
   */
  router.get('/info', (req, res) => {
    const primaryIp = getPrimaryLanIp();
    const allIps = getLocalIpAddresses();
    const primaryUrl = `http://${primaryIp}:${CONFIG.PORT}`;

    res.json({
      name: 'ClipSync Server',
      version: '1.1.0',
      port: CONFIG.PORT,
      primaryIp,
      primaryUrl,
      interfaces: allIps.map((i) => ({
        name: i.name,
        ip: i.address,
        url: `http://${i.address}:${CONFIG.PORT}`,
      })),
      peerCount: wsHandler.getPeerCount(),
      itemCount: ringBuffer.getAll().length,
      maxHistory: CONFIG.MAX_HISTORY,
    });
  });

  /**
   * GET /api/v1/qr
   * Generates a QR Code SVG or PNG for the primary LAN address
   */
  router.get('/qr', async (req, res) => {
    try {
      const primaryIp = getPrimaryLanIp();
      const targetUrl = req.query.url || `http://${primaryIp}:${CONFIG.PORT}`;
      const format = req.query.format || 'svg';

      if (format === 'svg') {
        const svgString = await QRCode.toString(targetUrl, {
          type: 'svg',
          color: {
            dark: '#0a0a0c',
            light: '#ffffff',
          },
          margin: 1,
        });
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.send(svgString);
      }

      // Default PNG data URL or buffer
      const buffer = await QRCode.toBuffer(targetUrl, {
        color: {
          dark: '#0a0a0c',
          light: '#ffffff',
        },
        margin: 2,
        width: 320,
      });
      res.setHeader('Content-Type', 'image/png');
      res.send(buffer);
    } catch (err) {
      console.error('[ClipSync] QR Code generation error:', err);
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });

  /**
   * POST /api/v1/upload
   * Multipart file or pasted image upload
   */
  router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    const isImage = file.mimetype.startsWith('image/');
    const type = isImage ? 'IMAGE' : 'FILE';

    // Parse sender info from request body if available
    let sender = {
      name: req.body.senderName || 'Web Client',
      type: req.body.senderType || 'desktop',
      os: req.body.senderOs || 'Unknown',
    };

    const item = {
      id: crypto.randomUUID(),
      type,
      content: file.originalname,
      metadata: {
        filename: file.originalname,
        fileId: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        url: `/api/v1/download/${file.filename}`,
        isImage,
      },
      sender,
      createdAt: new Date().toISOString(),
    };

    ringBuffer.push(item);

    // Broadcast new item to all WebSocket clients instantly
    wsHandler.broadcast('sync:new_item', item);

    res.status(201).json({
      success: true,
      item,
    });
  });

  /**
   * GET /api/v1/download/:fileId
   * Stream file from ephemeral uploads folder
   */
  router.get('/download/:fileId', (req, res) => {
    const fileId = path.basename(req.params.fileId);
    const filePath = path.join(CONFIG.UPLOAD_DIR, fileId);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    const item = ringBuffer.getAll().find((i) => i.metadata?.fileId === fileId);
    const originalName = item ? item.metadata.filename : fileId;
    const isDownload = req.query.download === '1';

    // Set correct headers
    if (isDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
    }

    res.sendFile(filePath);
  });

  /**
   * GET /api/v1/history
   * REST fallback for history
   */
  router.get('/history', (req, res) => {
    res.json({
      items: ringBuffer.getAll(),
    });
  });

  /**
   * DELETE /api/v1/item/:id
   * REST fallback for deleting a specific clip item
   */
  router.delete('/item/:id', (req, res) => {
    const { id } = req.params;
    const deleted = ringBuffer.delete(id);

    if (deleted) {
      wsHandler.broadcast('sync:delete', { id });
      return res.json({ success: true, id });
    }

    res.status(404).json({ error: 'Item not found' });
  });

  /**
   * POST /api/v1/clear
   * REST fallback to clear all history
   */
  router.post('/clear', (req, res) => {
    ringBuffer.clear();
    wsHandler.broadcast('sync:clear', {});
    res.json({ success: true, message: 'History cleared' });
  });

  return router;
}
