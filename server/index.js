import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.js';
import { WebSocketHandler } from './wsHandler.js';
import { createRouter } from './routes.js';
import { getLocalIpAddresses, getPrimaryLanIp } from './networkUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads folder exists
if (!fs.existsSync(CONFIG.UPLOAD_DIR)) {
  fs.mkdirSync(CONFIG.UPLOAD_DIR, { recursive: true });
}

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize WebSocket Handler
const wsHandler = new WebSocketHandler(server);

// API Routes
app.use('/api/v1', createRouter(wsHandler));

// Serve Frontend Static Assets
const publicDir = path.resolve(__dirname, '../public');
app.use(express.static(publicDir));

// Fallback to index.html for SPA behavior
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start HTTP + WS Server
server.listen(CONFIG.PORT, CONFIG.HOST, () => {
  const primaryIp = getPrimaryLanIp();
  const allIps = getLocalIpAddresses();

  console.log('\n' + '─'.repeat(54));
  console.log('  ⚡ ClipSync — Cross-Device Clipboard & File Drop');
  console.log('─'.repeat(54));
  console.log(`  • Local:       http://localhost:${CONFIG.PORT}`);
  console.log(`  • Network:     http://${primaryIp}:${CONFIG.PORT}`);
  if (allIps.length > 1) {
    console.log('  • Other Interfaces:');
    allIps.forEach((i) => {
      if (i.address !== primaryIp && !i.internal) {
        console.log(`      - ${i.name.padEnd(12)} http://${i.address}:${CONFIG.PORT}`);
      }
    });
  }
  console.log(`  • QR Code:     http://${primaryIp}:${CONFIG.PORT}/api/v1/qr`);
  console.log(`  • Max History: ${CONFIG.MAX_HISTORY} items in memory buffer`);
  console.log('─'.repeat(54));
  console.log('  Ready. Press CMD/CTRL+V anywhere or drop files to sync.\n');
});
