import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG = {
  PORT: parseInt(process.env.PORT || '4040', 10),
  HOST: process.env.HOST || '0.0.0.0',
  MAX_HISTORY: parseInt(process.env.MAX_HISTORY || '20', 10),
  UPLOAD_DIR: path.resolve(__dirname, '../uploads'),
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10),
  DATA_PERSISTENCE_FILE: path.resolve(__dirname, '../clipsync-data.json'),
  PERSIST_TO_DISK: process.env.PERSIST_TO_DISK !== 'false',
  PING_INTERVAL_MS: 30000,
};
