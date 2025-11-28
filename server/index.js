import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DATA_FILE = path.join(__dirname, 'data', 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_FILE)) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({ users: [], fish: [], reports: [], resetTokens: [] }, null, 2)
  );
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${nanoid()}${ext}`);
    }
  })
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));

function readData() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function sanitizeFishPayload(fish) {
  return {
    id: fish.id,
    Image: fish.Image,
    image: fish.Image,
    url: fish.Image,
    artist: fish.artist || 'Anonymous',
    CreatedAt: fish.CreatedAt,
    createdAt: fish.CreatedAt,
    upvotes: fish.upvotes || 0,
    downvotes: fish.downvotes || 0,
    isVisible: fish.isVisible !== false,
    deleted: fish.deleted || false,
    needsModeration: fish.needsModeration || false,
    userId: fish.userId
  };
}

function findUserByEmail(email) {
  const db = readData();
  return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

function generateToken(user) {
  return Buffer.from(`${user.id}:${user.email}`).toString('base64');
}

app.post('/uploadfish', upload.single('image'), (req, res) => {
  const db = readData();
  const { artist = 'Anonymous', needsModeration = 'false', userId } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  const now = new Date().toISOString();
  const fishId = nanoid();
  const imageUrl = `${BASE_URL}/uploads/${req.file.filename}`;

  const fish = {
    id: fishId,
    Image: imageUrl,
    CreatedAt: now,
    artist,
    needsModeration: needsModeration === 'true',
    isVisible: true,
    deleted: false,
    upvotes: 0,
    downvotes: 0,
    userId: userId || nanoid()
  };

  db.fish.push(fish);
  writeData(db);

  res.json({
    data: {
      Image: imageUrl,
      url: imageUrl,
      userId: fish.userId
    }
  });
});

app.get('/api/fish', (req, res) => {
  const db = readData();
  const {
    orderBy = 'CreatedAt',
    order = 'desc',
    limit = '20',
    offset = '0',
    isVisible,
    deleted,
    userId
  } = req.query;

  let items = [...db.fish];

  if (typeof isVisible !== 'undefined') {
    items = items.filter((f) => String(f.isVisible !== false) === String(isVisible));
  }

  if (typeof deleted !== 'undefined') {
    items = items.filter((f) => String(!!f.deleted) === String(deleted));
  }

  if (userId) {
    items = items.filter((f) => f.userId === userId);
  }

  items.sort((a, b) => {
    const dir = order.toLowerCase() === 'asc' ? 1 : -1;
    const valA = a[orderBy] || a[orderBy.toLowerCase()];
    const valB = b[orderBy] || b[orderBy.toLowerCase()];
    if (valA === valB) return 0;
    return valA > valB ? dir : -dir;
  });

  const start = parseInt(offset, 10) || 0;
  const end = start + (parseInt(limit, 10) || 20);
  const page = items.slice(start, end).map(sanitizeFishPayload);

  res.json({ data: page, total: items.length });
});

app.post('/api/vote', (req, res) => {
  const { fishId, vote } = req.body || {};
  if (!fishId || !['up', 'down'].includes(vote)) {
    return res.status(400).json({ error: 'fishId and vote are required' });
  }

  const db = readData();
  const fish = db.fish.find((f) => f.id === fishId);
  if (!fish) {
    return res.status(404).json({ error: 'Fish not found' });
  }

  if (vote === 'up') {
    fish.upvotes = (fish.upvotes || 0) + 1;
  } else {
    fish.downvotes = (fish.downvotes || 0) + 1;
  }

  writeData(db);
  res.json({ data: sanitizeFishPayload(fish) });
});

app.post('/api/report', (req, res) => {
  const { fishId, reason, userAgent, url } = req.body || {};
  if (!fishId || !reason) {
    return res.status(400).json({ error: 'fishId and reason are required' });
  }
  const db = readData();
  const fish = db.fish.find((f) => f.id === fishId);
  if (!fish) {
    return res.status(404).json({ error: 'Fish not found' });
  }

  db.reports.push({
    id: nanoid(),
    fishId,
    reason,
    userAgent,
    url,
    createdAt: new Date().toISOString()
  });
  writeData(db);
  res.json({ message: 'Report received' });
});

app.post('/auth/register', (req, res) => {
  const { email, password, userId } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const db = readData();
  if (findUserByEmail(email)) {
    return res.status(409).json({ error: 'User already exists' });
  }
  const id = userId || nanoid();
  const hashedPassword = bcrypt.hashSync(password, 8);
  const user = {
    id,
    email,
    password: hashedPassword,
    displayName: email.split('@')[0],
    isAdmin: false
  };
  db.users.push(user);
  writeData(db);

  res.json({ token: generateToken(user), user: { ...user, password: undefined } });
});

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const db = readData();
  const user = findUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ token: generateToken(user), user: { ...user, password: undefined } });
});

app.post('/auth/google', (req, res) => {
  const { token, userId } = req.body || {};
  if (!token) {
    return res.status(400).json({ error: 'Google token required' });
  }
  const email = `google_${token.slice(0, 8)}@example.com`;
  const db = readData();
  let user = findUserByEmail(email);
  if (!user) {
    user = {
      id: userId || nanoid(),
      email,
      displayName: 'Google User',
      password: null,
      isAdmin: false
    };
    db.users.push(user);
    writeData(db);
  }
  res.json({ token: generateToken(user), user: { ...user, password: undefined } });
});

app.post('/auth/forgot-password', (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const db = readData();
  const user = findUserByEmail(email);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const token = nanoid();
  db.resetTokens.push({ token, email, createdAt: new Date().toISOString() });
  writeData(db);
  res.json({ message: 'Password reset requested', token });
});

app.post('/auth/reset-password', (req, res) => {
  const { email, token, newPassword } = req.body || {};
  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: 'Email, token, and newPassword are required' });
  }
  const db = readData();
  const tokenEntry = db.resetTokens.find((t) => t.token === token && t.email === email);
  if (!tokenEntry) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const user = findUserByEmail(email);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  user.password = bcrypt.hashSync(newPassword, 8);
  db.resetTokens = db.resetTokens.filter((t) => t.token !== token);
  writeData(db);
  res.json({ message: 'Password updated' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Local backend running on ${BASE_URL}`);
});
