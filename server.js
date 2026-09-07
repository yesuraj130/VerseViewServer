import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = 3000;
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure all databases in data/ use standard DELETE journal mode so no -wal or -shm files are created
for (const file of fs.readdirSync(dataDir)) {
  if (file.endsWith('.db')) {
    try {
      const fullPath = path.join(dataDir, file);
      const db = new DatabaseSync(fullPath);
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      db.exec('PRAGMA journal_mode = DELETE;');
      db.close();
    } catch {
      // Ignore if cannot write
    }
  }
}

// Remove any remaining -wal or -shm sidecar files
for (const file of fs.readdirSync(dataDir)) {
  if (file.endsWith('-wal') || file.endsWith('-shm')) {
    try {
      fs.unlinkSync(path.join(dataDir, file));
    } catch {
      // Ignore
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Songs Database (songs.db / sm.db) - Read & Query existing data
// ---------------------------------------------------------------------------
const songsDbFileName = fs.existsSync(path.join(dataDir, 'songs.db'))
  ? 'songs.db'
  : 'sm.db';
const smDbPath = path.join(dataDir, songsDbFileName);
const smDb = new DatabaseSync(smDbPath);

// ---------------------------------------------------------------------------
// 2. Bible Versions Manager & Read-Only SQLite Database Connections
// ---------------------------------------------------------------------------
const bibleDbCache = new Map();

function getVersionMetadata() {
  const versionFile = path.join(dataDir, 'version.json');
  if (!fs.existsSync(versionFile)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    const list = raw.version || raw.versions || [];
    return list.map((item, idx) => {
      const file = item.file || item.dbFile || `${item.id || 'bible'}.db`;
      const id = item.id || file.replace(/\.db$/i, '');
      const dbExists = fs.existsSync(path.join(dataDir, file));
      const booknames = item.booknames || item.books || [];
      return {
        id,
        name: item.name || `Version ${idx + 1}`,
        file,
        dbFile: file,
        books: booknames,
        booknames: booknames,
        selectedfont: item.selectedfont || 'Arial',
        copyright: item.copyright || '',
        left2right: item.left2right !== undefined ? item.left2right : true,
        available: dbExists
      };
    });
  } catch (err) {
    console.error('Error reading version.json:', err);
    return [];
  }
}

function getBibleDb(versionIdOrFile) {
  const versions = getVersionMetadata();
  const matched = versions.find(
    v => v.id === versionIdOrFile || v.file === versionIdOrFile || v.dbFile === versionIdOrFile
  );

  let targetFile = matched ? matched.file : versionIdOrFile;
  if (!targetFile.endsWith('.db')) {
    targetFile = `${targetFile}.db`;
  }

  const dbPath = path.join(dataDir, targetFile);
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  if (!bibleDbCache.has(targetFile)) {
    try {
      // Strictly read-only connection without modifying the database or creating sidecar files
      const db = new DatabaseSync(dbPath, { readOnly: true });
      bibleDbCache.set(targetFile, db);
    } catch (err) {
      console.error(`Error opening Bible DB ${targetFile}:`, err);
      return null;
    }
  }

  return bibleDbCache.get(targetFile);
}

// ---------------------------------------------------------------------------
// 3. Authoritative Real-Time Global State ("No Slide Presented" on Startup)
// ---------------------------------------------------------------------------
let currentState = {
  type: 'none',
  status: 'clear', // 'live' | 'clear'
  title: '',
  reference: '',
  lines: [],
  rawSlide: '',
  slideIndex: 0,
  totalSlides: 0,
  songId: null,
  verseInfo: null,
  updatedAt: Date.now()
};

const connectedClients = new Map();

function parseUserAgent(ua) {
  if (!ua) return 'Web Browser';
  let browser = 'Browser';
  let os = 'Device';

  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/opr|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua)) browser = 'Safari';

  if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/ipad/i.test(ua)) os = 'iPad';
  else if (/iphone/i.test(ua)) os = 'iPhone';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/linux/i.test(ua)) os = 'Linux';

  return `${browser} on ${os}`;
}

function getCleanIp(socket) {
  let ip = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress || '127.0.0.1';
  if (typeof ip === 'string') {
    ip = ip.split(',')[0].trim();
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    if (ip === '::1') ip = '127.0.0.1';
  }
  return ip;
}

function getClientSummaries() {
  const presenters = [];
  const displays = [];
  for (const client of connectedClients.values()) {
    if (client && typeof client === 'object') {
      const summary = {
        id: client.id,
        role: client.role,
        connectedAt: client.connectedAt,
        ip: client.ip,
        device: client.device,
        screen: client.screen || null
      };
      if (client.role === 'presenter') presenters.push(summary);
      else if (client.role === 'display') displays.push(summary);
    }
  }
  return { presenters, displays, total: connectedClients.size };
}

function broadcastState() {
  io.emit('display:update', currentState);
}

function broadcastStats() {
  const { presenters, displays, total } = getClientSummaries();
  io.emit('stats:update', {
    presenters: presenters.length,
    displays: displays.length,
    presentersList: presenters,
    displaysList: displays,
    total
  });
}

// ---------------------------------------------------------------------------
// 4. Socket.io Real-Time Synchronization ("Last-Click-Wins")
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  const cleanIp = getCleanIp(socket);
  const ua = socket.handshake.headers['user-agent'] || '';
  connectedClients.set(socket.id, {
    id: socket.id,
    role: 'viewer',
    ip: cleanIp,
    connectedAt: Date.now(),
    device: parseUserAgent(ua)
  });
  broadcastStats();

  // Immediately push current authoritative state upon connection
  socket.emit('display:update', currentState);

  socket.on('role:register', (data) => {
    if (data && (data.role === 'presenter' || data.role === 'display')) {
      const existing = connectedClients.get(socket.id) || {};
      connectedClients.set(socket.id, {
        ...existing,
        id: socket.id,
        role: data.role,
        screen: data.screen || existing.screen || '',
        connectedAt: existing.connectedAt || Date.now(),
        ip: existing.ip || cleanIp,
        device: parseUserAgent(data.userAgent || socket.handshake.headers['user-agent'] || '')
      });
      broadcastStats();
    }
  });

  socket.on('get:state', () => {
    socket.emit('display:update', currentState);
  });

  // Action: Present Slide (Song or Scripture)
  socket.on('action:present', (payload) => {
    if (!payload) return;
    const lines = Array.isArray(payload.lines)
      ? payload.lines
      : (payload.rawSlide ? payload.rawSlide.split('<BR>') : []);

    currentState = {
      ...currentState,
      type: payload.type || 'song',
      status: 'live',
      title: payload.title || '',
      reference: payload.reference || '',
      lines: lines,
      rawSlide: payload.rawSlide || lines.join('<BR>'),
      slideIndex: Number(payload.slideIndex) || 1,
      totalSlides: Number(payload.totalSlides) || 1,
      songId: payload.songId !== undefined ? payload.songId : null,
      verseInfo: payload.verseInfo || null,
      updatedAt: Date.now()
    };

    broadcastState();
  });

  // Action: Clear Screen (Sets state to No Slide Presented)
  socket.on('action:clear', () => {
    currentState = {
      type: 'none',
      status: 'clear',
      title: '',
      reference: '',
      lines: [],
      rawSlide: '',
      slideIndex: 0,
      totalSlides: 0,
      songId: null,
      verseInfo: null,
      updatedAt: Date.now()
    };
    broadcastState();
  });

  socket.on('disconnect', () => {
    connectedClients.delete(socket.id);
    broadcastStats();
  });
});

// ---------------------------------------------------------------------------
// 5. Express Middlewares & REST API
// ---------------------------------------------------------------------------
app.use(express.json());

// API: Current Live State
app.get('/api/state', (req, res) => {
  res.json(currentState);
});

app.post('/api/state', (req, res) => {
  const payload = req.body;
  if (!payload) return res.status(400).json({ error: 'Missing body' });
  
  const lines = Array.isArray(payload.lines)
    ? payload.lines
    : (payload.rawSlide ? payload.rawSlide.split('<BR>') : []);

  currentState = {
    ...currentState,
    ...payload,
    lines,
    status: payload.status || 'live',
    updatedAt: Date.now()
  };

  broadcastState();
  res.json({ success: true, state: currentState });
});

// API: Songs (songs.db / sm.db)
app.get('/api/songs', (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : '';
    const cat = req.query.cat ? String(req.query.cat).trim() : '';
    const limit = Math.min(Number(req.query.limit) || 100, 200);

    let sql = 'SELECT id, name, cat, lyrics, lyrics2 FROM sm';
    const params = [];
    const conditions = [];

    if (q) {
      conditions.push('(name LIKE ? OR lyrics LIKE ? OR lyrics2 LIKE ?)');
      const term = `%${q}%`;
      params.push(term, term, term);
    }
    if (cat && cat !== 'All') {
      conditions.push('cat = ?');
      params.push(cat);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY id ASC LIMIT ?';
    params.push(limit);

    const stmt = smDb.prepare(sql);
    const rows = stmt.all(...params);

    const songs = rows.map((r) => {
      const slides = r.lyrics ? r.lyrics.split('<slide>') : [];
      return {
        id: r.id,
        name: r.name,
        cat: r.cat || 'General',
        lyrics: r.lyrics,
        lyrics2: r.lyrics2 || '',
        slideCount: slides.length
      };
    });

    res.json(songs);
  } catch (err) {
    console.error('Error fetching songs:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/songs/:id', (req, res) => {
  try {
    const songId = Number(req.params.id);
    const stmt = smDb.prepare('SELECT id, name, cat, lyrics, lyrics2 FROM sm WHERE id = ?');
    const song = stmt.get(songId);

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const slides = (song.lyrics || '').split('<slide>').map((s, idx) => {
      return {
        slideIndex: idx + 1,
        rawSlide: s,
        lines: s.split('<BR>').map(l => l.trim()).filter(Boolean)
      };
    });

    res.json({
      ...song,
      slides,
      slideCount: slides.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/songs', (req, res) => {
  try {
    const { name, cat, lyrics, lyrics2 } = req.body;
    if (!name || !lyrics) {
      return res.status(400).json({ error: 'Name and lyrics are required' });
    }

    const stmt = smDb.prepare(
      'INSERT INTO sm (name, cat, lyrics, lyrics2) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(name.trim(), (cat || 'General').trim(), lyrics.trim(), (lyrics2 || '').trim());
    const newId = Number(result.lastInsertRowid);

    const created = smDb.prepare('SELECT id, name, cat, lyrics, lyrics2 FROM sm WHERE id = ?').get(newId);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/songs/:id', (req, res) => {
  try {
    const songId = Number(req.params.id);
    const { name, cat, lyrics, lyrics2 } = req.body;
    if (!name || !lyrics) {
      return res.status(400).json({ error: 'Name and lyrics are required' });
    }

    const stmt = smDb.prepare(
      'UPDATE sm SET name = ?, cat = ?, lyrics = ?, lyrics2 = ? WHERE id = ?'
    );
    stmt.run(name.trim(), (cat || 'General').trim(), lyrics.trim(), (lyrics2 || '').trim(), songId);

    const updated = smDb.prepare('SELECT id, name, cat, lyrics, lyrics2 FROM sm WHERE id = ?').get(songId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/songs/:id', (req, res) => {
  try {
    const songId = Number(req.params.id);
    const stmt = smDb.prepare('DELETE FROM sm WHERE id = ?');
    stmt.run(songId);
    res.json({ success: true, deletedId: songId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/categories', (req, res) => {
  try {
    const rows = smDb.prepare("SELECT DISTINCT cat FROM sm WHERE cat IS NOT NULL AND cat != '' ORDER BY cat").all();
    const categories = rows.map(r => r.cat);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 6. Bible Metadata (version.json) & Cascading Scripture Endpoints
// ---------------------------------------------------------------------------
app.get('/api/bible/versions', (req, res) => {
  try {
    const versions = getVersionMetadata();
    res.json(versions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bible/:version/books', (req, res) => {
  try {
    const versionId = req.params.version;
    const versions = getVersionMetadata();
    const ver = versions.find(v => v.id === versionId || v.file === versionId || v.dbFile === versionId);

    if (ver && ver.books && ver.books.length > 0) {
      return res.json({
        version: ver,
        books: ver.books.map((b, idx) => ({ bookNum: idx + 1, name: b }))
      });
    }

    const db = getBibleDb(versionId);
    if (!db) {
      return res.status(404).json({ error: `Bible database for '${versionId}' not found in data/.` });
    }

    const rows = db.prepare('SELECT DISTINCT bookNum FROM words ORDER BY bookNum').all();
    const books = rows.map(r => ({
      bookNum: r.bookNum,
      name: `Book ${r.bookNum}`
    }));

    res.json({
      version: ver || { id: versionId, name: versionId },
      books
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bible/:version/chapters', (req, res) => {
  try {
    const versionId = req.params.version;
    const bookNum = Number(req.query.bookNum);
    if (!bookNum) return res.status(400).json({ error: 'bookNum query param required' });

    const db = getBibleDb(versionId);
    if (!db) {
      return res.status(404).json({ error: `Bible database for '${versionId}' not found.` });
    }

    const rows = db.prepare(
      'SELECT DISTINCT chNum FROM words WHERE bookNum = ? ORDER BY chNum'
    ).all(bookNum);

    const chapters = rows.map(r => r.chNum);
    res.json(chapters);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bible/:version/verses', (req, res) => {
  try {
    const versionId = req.params.version;
    const bookNum = Number(req.query.bookNum);
    const chNum = Number(req.query.chNum);
    if (!bookNum || !chNum) {
      return res.status(400).json({ error: 'bookNum and chNum required' });
    }

    const db = getBibleDb(versionId);
    if (!db) {
      return res.status(404).json({ error: `Bible database for '${versionId}' not found.` });
    }

    const rows = db.prepare(
      'SELECT DISTINCT verseNum FROM words WHERE bookNum = ? AND chNum = ? ORDER BY verseNum'
    ).all(bookNum, chNum);

    const verses = rows.map(r => r.verseNum);
    res.json(verses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bible/:version/text', (req, res) => {
  try {
    const versionId = req.params.version;
    const bookNum = Number(req.query.bookNum);
    const chNum = Number(req.query.chNum);
    const verseNum = req.query.verseNum !== undefined && req.query.verseNum !== '' ? Number(req.query.verseNum) : null;

    if (!bookNum || !chNum) {
      return res.status(400).json({ error: 'bookNum and chNum required' });
    }

    const versions = getVersionMetadata();
    const ver = versions.find(v => v.id === versionId || v.file === versionId || v.dbFile === versionId);
    const versionName = ver ? ver.name : versionId;
    let bookName = `Book ${bookNum}`;
    if (ver && ver.books && ver.books[bookNum - 1]) {
      bookName = ver.books[bookNum - 1];
    }

    const db = getBibleDb(versionId);
    if (!db) {
      return res.status(404).json({ error: `Bible database for '${versionId}' not found.` });
    }

    let rows;
    if (verseNum) {
      rows = db.prepare(
        'SELECT wordId, word, bookNum, chNum, verseNum FROM words WHERE bookNum = ? AND chNum = ? AND verseNum = ? ORDER BY verseNum'
      ).all(bookNum, chNum, verseNum);
    } else {
      rows = db.prepare(
        'SELECT wordId, word, bookNum, chNum, verseNum FROM words WHERE bookNum = ? AND chNum = ? ORDER BY verseNum'
      ).all(bookNum, chNum);
    }

    res.json({
      version: versionId,
      versionName,
      bookNum,
      bookName,
      chNum,
      verseNum,
      verses: rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Quick Bible Search
app.get('/api/bible/:version/search', (req, res) => {
  try {
    const versionId = req.params.version;
    const q = req.query.q ? String(req.query.q).trim() : '';
    if (!q) return res.json([]);

    const versions = getVersionMetadata();
    const ver = versions.find(v => v.id === versionId || v.file === versionId || v.dbFile === versionId);
    const bookList = (ver && ver.books) ? ver.books : [];

    const db = getBibleDb(versionId);
    if (!db) {
      return res.status(404).json({ error: `Bible database for '${versionId}' not found.` });
    }

    const rows = db.prepare(
      'SELECT wordId, word, bookNum, chNum, verseNum FROM words WHERE word LIKE ? LIMIT 50'
    ).all(`%${q}%`);

    const results = rows.map(r => {
      const bName = bookList[r.bookNum - 1] || `Book ${r.bookNum}`;
      return {
        ...r,
        bookName: bName,
        reference: `${bName} ${r.chNum}:${r.verseNum}`
      };
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Stats & System Info
app.get('/api/stats', (req, res) => {
  try {
    const songCount = smDb.prepare('SELECT COUNT(*) as count FROM sm').get().count;
    
    let tamilCount = 0;
    const tamilDb = getBibleDb('tamil.db');
    if (tamilDb) {
      tamilCount = tamilDb.prepare('SELECT COUNT(*) as count FROM words').get().count;
    }

    const { presenters, displays, total } = getClientSummaries();
    const versions = getVersionMetadata();

    res.json({
      songs: songCount,
      tamilVerses: tamilCount,
      databaseFile: songsDbFileName,
      availableBibles: versions.filter(v => v.available).map(v => v.name),
      clients: {
        presenters: presenters.length,
        displays: displays.length,
        presentersList: presenters,
        displaysList: displays,
        total: total
      },
      currentLive: {
        title: currentState.title,
        status: currentState.status,
        type: currentState.type
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Detailed Connected Clients List
app.get('/api/clients', (req, res) => {
  try {
    const summaries = getClientSummaries();
    res.json(summaries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 7. Static Files & Routing
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

// Explicit redirects for clean paths
app.get('/presenter', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'presenter', 'index.html'));
});

app.get('/display', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display', 'index.html'));
});

// Fallback to public index
app.get('*', (req, res) => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(publicIndex)) {
    res.sendFile(publicIndex);
  } else {
    res.redirect('/presenter');
  }
});

// ---------------------------------------------------------------------------
// 8. Start HTTP + Socket.io Server
// ---------------------------------------------------------------------------
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Verse View Server running at http://0.0.0.0:${PORT}`);
  console.log(`Using songs database: ${songsDbFileName}`);
  console.log(`Presenter Console: http://0.0.0.0:${PORT}/presenter/`);
  console.log(`Display Output:    http://0.0.0.0:${PORT}/display/`);
});
