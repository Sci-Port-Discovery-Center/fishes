import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_HOST = process.env.PUBLIC_HOST || 'localhost';
const PORT = process.env.FRONTEND_PORT || 3000;

app.use(express.static(ROOT_DIR));

app.get('*', (req, res) => {
  const requested = path.join(ROOT_DIR, req.path);
  if (fs.existsSync(requested) && fs.statSync(requested).isFile()) {
    return res.sendFile(requested);
  }
  return res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.listen(PORT, HOST, () => {
  const hostLabel = HOST === '0.0.0.0' ? PUBLIC_HOST : HOST;
  console.log(`Static frontend available at http://${hostLabel}:${PORT}`);
});
