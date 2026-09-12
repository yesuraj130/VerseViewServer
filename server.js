import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Server } from 'socket.io';
import { isTamilBibleFont, baminiToUnicode } from './lib/bamini.js';

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

// In the AI Studio development sandbox, NGINX runs on 8080 and reverse-proxies to 3000.
// In deployed Cloud Run / production environments, Cloud Run routes traffic directly to process.env.PORT (typically 8080).
const isDevSandbox = Boolean(process.env.CONTROL_PLANE_PORT || process.env.DEFAULT_APP_PORT);
const PORT = isDevSandbox ? 3000 : (Number(process.env.PORT) || 8080);
const APP_TITLE = process.env.APP_TITLE || 'Verse View Server';
const APP_CONFIG = {
  appName: APP_TITLE,
  title: APP_TITLE,
  tagline: 'Real-Time Church Presentation Server'
};
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir))
{
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure all databases in data/ use standard DELETE journal mode so no -wal or -shm files are created
for (const file of fs.readdirSync(dataDir))
{
  if (file.endsWith('.db'))
  {
    try
    {
      const fullPath = path.join(dataDir, file);
      const db = new DatabaseSync(fullPath);
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      db.exec('PRAGMA journal_mode = DELETE;');
      db.close();
    }
    catch
    {
      // Ignore if cannot write
    }
  }
}

// Remove any remaining -wal or -shm sidecar files
for (const file of fs.readdirSync(dataDir))
{
  if (file.endsWith('-wal') || file.endsWith('-shm'))
  {
    try
    {
      fs.unlinkSync(path.join(dataDir, file));
    }
    catch
    {
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

try
{
  smDb.exec(`
    CREATE TABLE IF NOT EXISTS sm (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      font TEXT,
      lyrics TEXT,
      category TEXT
    );
  `);
}
catch (e)
{
  // Ignore if already existing or read-only
}

// ---------------------------------------------------------------------------
// 2. Bible Versions Manager & Read-Only SQLite Database Connections
// ---------------------------------------------------------------------------
const bibleDbCache = new Map();
const bibleStructureCache = new Map();

function getBibleStructure(versionId)
{
  if (bibleStructureCache.has(versionId))
  {
    return bibleStructureCache.get(versionId);
  }

  const db = getBibleDb(versionId);
  if (!db) return null;

  try
  {
    const rows = db.prepare(
      'SELECT bookNum, chNum, COUNT(verseNum) as verseCount FROM words GROUP BY bookNum, chNum ORDER BY bookNum, chNum'
    ).all();

    const bookMap = new Map();
    for (const r of rows)
    {
      if (!bookMap.has(r.bookNum))
      {
        bookMap.set(r.bookNum, []);
      }
      bookMap.get(r.bookNum).push(r.verseCount);
    }

    const structure = new Map();
    for (const [bNum, vCounts] of bookMap.entries())
    {
      structure.set(bNum, {
        chapterCount: vCounts.length,
        verseCounts: vCounts
      });
    }

    bibleStructureCache.set(versionId, structure);
    return structure;
  }
  catch (err)
  {
    console.error(`Error calculating Bible structure for ${versionId}:`, err);
    return null;
  }
}

function getVersionMetadata()
{
  const versionFile = path.join(dataDir, 'version.json');
  if (!fs.existsSync(versionFile)) return [];
  try
  {
    const raw = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    const list = raw.version || raw.versions || [];
    return list.map((item, idx) =>
    {
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
  }
  catch (err)
  {
    console.error('Error reading version.json:', err);
    return [];
  }
}

function getBibleDb(versionIdOrFile)
{
  const versions = getVersionMetadata();
  const matched = versions.find(
    v => v.id === versionIdOrFile || v.file === versionIdOrFile || v.dbFile === versionIdOrFile
  );

  let targetFile = matched ? matched.file : versionIdOrFile;
  if (!targetFile.endsWith('.db'))
  {
    targetFile = `${targetFile}.db`;
  }

  const dbPath = path.join(dataDir, targetFile);
  if (!fs.existsSync(dbPath))
  {
    return null;
  }

  if (!bibleDbCache.has(targetFile))
  {
    try
    {
      // Strictly read-only connection without modifying the database or creating sidecar files
      const db = new DatabaseSync(dbPath, { readOnly: true });
      bibleDbCache.set(targetFile, db);
    }
    catch (err)
    {
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

function parseUserAgent(ua)
{
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

function getCleanIp(socket)
{
  let ip = socket.handshake.headers['x-forwarded-for'] || socket.conn.remoteAddress || '127.0.0.1';
  if (typeof ip === 'string')
  {
    ip = ip.split(',')[0].trim();
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    if (ip === '::1') ip = '127.0.0.1';
  }
  return ip;
}

function getClientSummaries()
{
  const presenters = [];
  const displays = [];
  for (const client of connectedClients.values())
  {
    if (client && typeof client === 'object')
    {
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

function broadcastState()
{
  io.emit('display:update', currentState);
}

function broadcastStats()
{
  const { presenters, displays, total } = getClientSummaries();
  io.emit('stats:update', {
    presenters: presenters.length,
    displays: displays.length,
    presentersList: presenters,
    displaysList: displays,
    total
  });
}

function resolveLiveState(payload)
{
  if (!payload) return currentState;

  if (payload.type === 'bible' && (payload.verseInfo || (payload.bookNum && payload.chNum && payload.verseNum)))
  {
    const vInfo = payload.verseInfo || payload;
    const versionId = vInfo.version || vInfo.versionId || 'tamil';
    const bookNum = Number(vInfo.bookNum) || 1;
    const chNum = Number(vInfo.chNum) || 1;
    const verseNum = Number(vInfo.verseNum) || 1;

    const versions = getVersionMetadata();
    const ver = versions.find(v => v.id === versionId || v.file === versionId || v.dbFile === versionId);
    const versionName = ver ? ver.name : versionId;
    let bookName = `Book ${bookNum}`;
    if (ver && ver.books && ver.books[bookNum - 1])
    {
      bookName = ver.books[bookNum - 1];
    }

    let lineText = '';
    const db = getBibleDb(versionId);
    if (db)
    {
      try
      {
        const row = db.prepare(
          'SELECT word FROM words WHERE bookNum = ? AND chNum = ? AND verseNum = ?'
        ).get(bookNum, chNum, verseNum);
        if (row && row.word) lineText = row.word;
      }
      catch (e)
      {
        console.error('Error fetching verse text from db in resolveLiveState:', e);
      }
    }

    const lines = lineText ? [lineText] : (Array.isArray(payload.lines) ? payload.lines : []);

    return {
      type: 'bible',
      status: 'live',
      title: bookName,
      reference: `${bookName} ${chNum}:${verseNum} (${versionName})`,
      lines: lines,
      rawSlide: lineText || (payload.rawSlide || lines.join('<BR>')),
      slideIndex: verseNum,
      totalSlides: payload.totalSlides || 1,
      songId: null,
      font: '',
      font2: '',
      verseInfo: {
        version: versionId,
        bookNum,
        chNum,
        verseNum
      },
      updatedAt: Date.now()
    };
  }
  else if (payload.type === 'song' && payload.songId)
  {
    const songId = Number(payload.songId);
    const slideIndex = Math.max(1, Number(payload.slideIndex) || 1);

    try
    {
      const row = smDb.prepare('SELECT id, name, title2, cat, font, font2, lyrics FROM sm WHERE id = ?').get(songId);
      if (row)
      {
        const rawSlides = row.lyrics ? row.lyrics.split('<slide>').filter(s => s.trim().length > 0) : [];
        const totalSlides = rawSlides.length || 1;
        const validSlideIndex = Math.min(slideIndex, totalSlides);
        const targetRawSlide = rawSlides[validSlideIndex - 1] || '';

        const rawLines = targetRawSlide
          ? targetRawSlide.split(/<BR>|\r?\n/i).map(l => l.replace(/<[^>]*>/g, '').trim()).filter(Boolean)
          : [];
        const lines = rawLines.map(l => (isTamilBibleFont(row.font) ? baminiToUnicode(l) : l));

        return {
          type: 'song',
          status: 'live',
          title: row.name,
          reference: `${row.cat || 'Song'} • Slide ${validSlideIndex} of ${totalSlides}`,
          lines: lines,
          rawSlide: targetRawSlide,
          slideIndex: validSlideIndex,
          totalSlides: totalSlides,
          songId: row.id,
          font: row.font || 'Baloo Thambi 2',
          font2: row.font2 || '',
          verseInfo: null,
          updatedAt: Date.now()
        };
      }
    }
    catch (e)
    {
      console.error('Error fetching song slide from db in resolveLiveState:', e);
    }
  }

  // Fallback for custom or direct text payload
  const rawLines = Array.isArray(payload.lines)
    ? payload.lines
    : (payload.rawSlide ? payload.rawSlide.split('<BR>') : []);
  const lines = rawLines.map(l => (isTamilBibleFont(payload.font) ? baminiToUnicode(l) : l));

  return {
    ...currentState,
    type: payload.type || 'song',
    status: payload.status || 'live',
    title: payload.title || '',
    reference: payload.reference || '',
    lines: lines,
    rawSlide: payload.rawSlide || lines.join('<BR>'),
    slideIndex: Number(payload.slideIndex) || 1,
    totalSlides: Number(payload.totalSlides) || 1,
    songId: payload.songId !== undefined ? payload.songId : null,
    font: payload.font || '',
    font2: payload.font2 || '',
    verseInfo: payload.verseInfo || null,
    updatedAt: Date.now()
  };
}

// ---------------------------------------------------------------------------
// 4. Socket.io Real-Time Synchronization ("Last-Click-Wins")
// ---------------------------------------------------------------------------
io.on('connection', (socket) =>
{
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

  socket.on('role:register', (data) =>
  {
    if (data && (data.role === 'presenter' || data.role === 'display'))
    {
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

  socket.on('get:state', () =>
  {
    socket.emit('display:update', currentState);
  });

  // Action: Present Slide (Song or Scripture)
  socket.on('action:present', (payload) =>
  {
    if (!payload) return;
    currentState = resolveLiveState(payload);
    broadcastState();
  });

  // Action: Clear Screen (Sets state to No Slide Presented)
  socket.on('action:clear', () =>
  {
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

  socket.on('disconnect', () =>
  {
    connectedClients.delete(socket.id);
    broadcastStats();
  });
});

// ---------------------------------------------------------------------------
// 5. Express Middlewares & REST API
// ---------------------------------------------------------------------------
// Allow CORS to all origins, methods, and headers
app.use((req, res, next) =>
{
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS')
  {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

// Standard container liveness & health check probe
app.get('/healthz', (req, res) =>
{
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

// API: Keep-Alive Heartbeat (Prevents idle spin-down)
app.get('/api/keepalive', (req, res) =>
{
  const clientType = req.query.client || 'client';
  const tabId = req.query.tab ? `#${req.query.tab}` : '';
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
  
  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (typeof ip === 'string')
  {
    ip = ip.split(',')[0].trim();
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  }
  const port = req.socket.remotePort || '';
  const addressWithPort = port ? `${ip}:${port}` : ip;

  console.log(`[KeepAlive] 🟢 Inbound heartbeat from ${clientType}${tabId} (${addressWithPort}) at ${timeStr} — Render idle timer reset, connection closed.`);

  res.setHeader('Connection', 'close');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.status(204).end();
});

// API: App Configuration
app.get('/api/config', (req, res) =>
{
  res.json(APP_CONFIG);
});

// API: Current Live State
app.get('/api/state', (req, res) =>
{
  res.json(currentState);
});

app.post('/api/state', (req, res) =>
{
  const payload = req.body;
  if (!payload) return res.status(400).json({ error: 'Missing body' });

  currentState = resolveLiveState(payload);
  broadcastState();
  res.json({ success: true, state: currentState });
});

function extractFirstLine(lyrics, font = '')
{
  if (!lyrics) return '';
  const slides = lyrics.split('<slide>');
  for (const s of slides)
  {
    const clean = s.trim();
    if (!clean) continue;
    const lines = clean.split(/<BR>|\r?\n/i).map(l => l.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
    if (lines.length > 0)
    {
      const first = lines[0];
      return isTamilBibleFont(font) ? baminiToUnicode(first) : first;
    }
  }
  return '';
}

function buildSearchPattern(query)
{
  if (!query) return '%';
  let str = String(query).trim();
  // Support both * and % as multi-character wildcards, and ? / _ as single-character wildcards
  str = str.replace(/\s*[\*%]\s*/g, '%');
  str = str.replace(/[\?_]/g, '_');
  str = str.replace(/%+/g, '%');
  if (!str.startsWith('%')) str = '%' + str;
  if (!str.endsWith('%')) str = str + '%';
  return str;
}

// API: Songs (songs.db / sm.db)
app.get('/api/songs', (req, res) =>
{
  try
  {
    const q = req.query.q ? String(req.query.q).trim() : '';
    const cat = req.query.cat ? String(req.query.cat).trim() : '';
    const limit = req.query.limit ? Math.min(Number(req.query.limit) || 5000, 10000) : 5000;

    let sql = 'SELECT id, name, title2, cat, font, font2, key, notes, tags, lyrics, lyrics2 FROM sm';
    const params = [];
    const conditions = [];

    if (q)
    {
      const term = buildSearchPattern(q);
      conditions.push('(name LIKE ? OR title2 LIKE ? OR tags LIKE ?)');
      params.push(term, term, term);
    }
    if (cat && cat !== 'All')
    {
      conditions.push('cat = ?');
      params.push(cat);
    }

    if (conditions.length > 0)
    {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    if (q)
    {
      const term = buildSearchPattern(q);
      sql += ' ORDER BY CASE WHEN name LIKE ? THEN 1 WHEN title2 LIKE ? THEN 2 WHEN tags LIKE ? THEN 3 ELSE 4 END, name COLLATE NOCASE ASC LIMIT ?';
      params.push(term, term, term, limit);
    }
    else
    {
      sql += ' ORDER BY name COLLATE NOCASE ASC LIMIT ?';
      params.push(limit);
    }

    const stmt = smDb.prepare(sql);
    const rows = stmt.all(...params);

    const songs = rows.map((r) =>
    {
      const slides = r.lyrics ? r.lyrics.split('<slide>').filter(s => s.trim().length > 0) : [];
      const isConverted = isTamilBibleFont(r.font);
      return {
        id: r.id,
        name: r.name,
        title2: r.title2 || '',
        cat: r.cat || 'General',
        font: r.font || '',
        font2: r.font2 || '',
        key: r.key || '',
        notes: r.notes || '',
        tags: r.tags || '',
        firstLine: extractFirstLine(r.lyrics, r.font),
        slideCount: slides.length,
        isConverted: Boolean(isConverted)
      };
    });

    res.json(songs);
  }
  catch (err)
  {
    console.error('Error fetching songs:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/songs/:id', (req, res) =>
{
  try
  {
    const songId = Number(req.params.id);
    const stmt = smDb.prepare('SELECT id, name, title2, cat, font, font2, key, notes, tags, lyrics, lyrics2 FROM sm WHERE id = ?');
    const song = stmt.get(songId);

    if (!song)
    {
      return res.status(404).json({ error: 'Song not found' });
    }

    const needsConversion = isTamilBibleFont(song.font);
    const convertedLyrics = needsConversion ? baminiToUnicode(song.lyrics) : song.lyrics;

    const rawSlides = (convertedLyrics || '').split('<slide>');
    const slides = [];
    rawSlides.forEach((s) =>
    {
      const clean = s.trim();
      if (!clean) return; // Skip trailing or blank slide delimiters
      const lines = clean.split(/<BR>|\r?\n/i).map(l => l.replace(/<[^>]*>/g, '').trim());
      while (lines.length > 0 && !lines[0]) lines.shift();
      while (lines.length > 0 && !lines[lines.length - 1]) lines.pop();
      if (lines.length > 0)
      {
        slides.push({
          slideIndex: slides.length + 1,
          rawSlide: s,
          lines: lines
        });
      }
    });

    res.json({
      ...song,
      lyrics: convertedLyrics,
      rawLyrics: song.lyrics,
      firstLine: extractFirstLine(song.lyrics, song.font),
      slides,
      slideCount: slides.length,
      isConverted: Boolean(needsConversion)
    });
  }
  catch (err)
  {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/songs', (req, res) =>
{
  try
  {
    const { name, title2, cat, font, tags, lyrics } = req.body;
    if (!name || !lyrics)
    {
      return res.status(400).json({ error: 'Name and lyrics are required' });
    }

    const stmt = smDb.prepare(
      'INSERT INTO sm (name, title2, cat, font, tags, lyrics, lyrics2) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(
      name.trim(),
      (title2 || '').trim(),
      (cat || 'General').trim(),
      (font || '').trim(),
      (tags || '').trim(),
      lyrics.trim(),
      ''
    );
    const newId = Number(result.lastInsertRowid);

    const created = smDb.prepare('SELECT id, name, title2, cat, font, font2, key, notes, tags, lyrics, lyrics2 FROM sm WHERE id = ?').get(newId);
    res.status(201).json(created);
  }
  catch (err)
  {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/songs/:id', (req, res) =>
{
  try
  {
    const songId = Number(req.params.id);
    const existing = smDb.prepare('SELECT * FROM sm WHERE id = ?').get(songId);
    if (!existing)
    {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Only update fields explicitly provided in req.body. Hidden / unedited fields remain completely untouched.
    const allowedFields = ['name', 'title2', 'cat', 'font', 'font2', 'tags', 'lyrics', 'lyrics2', 'key', 'notes', 'yvideo', 'bkgndfname', 'copy', 'subcat', 'slideseq'];
    const fieldsToUpdate = {};

    for (const field of allowedFields)
    {
      if (req.body[field] !== undefined)
      {
        fieldsToUpdate[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      }
    }

    if (fieldsToUpdate.name === '')
    {
      return res.status(400).json({ error: 'Song title cannot be empty' });
    }

    const setClauses = [];
    const params = [];
    for (const [key, val] of Object.entries(fieldsToUpdate))
    {
      setClauses.push(`${key} = ?`);
      params.push(val);
    }

    if (setClauses.length > 0)
    {
      params.push(songId);
      const sql = `UPDATE sm SET ${setClauses.join(', ')} WHERE id = ?`;
      smDb.prepare(sql).run(...params);
    }

    const updated = smDb.prepare('SELECT id, name, title2, cat, font, font2, key, notes, tags, lyrics, lyrics2 FROM sm WHERE id = ?').get(songId);
    res.json(updated);
  }
  catch (err)
  {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/songs/:id', (req, res) =>
{
  try
  {
    const songId = Number(req.params.id);
    const stmt = smDb.prepare('DELETE FROM sm WHERE id = ?');
    stmt.run(songId);
    res.json({ success: true, deletedId: songId });
  }
  catch (err)
  {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/categories', (req, res) =>
{
  try
  {
    const rows = smDb.prepare("SELECT DISTINCT cat FROM sm WHERE cat IS NOT NULL AND cat != '' ORDER BY cat").all();
    const categories = rows.map(r => r.cat);
    res.json(categories);
  }
  catch (err)
  {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 6. Unified Bible API (versions, structure, chapter texts)
// ---------------------------------------------------------------------------
function parseBoolParam(val)
{
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return undefined;
}

app.get('/api/bible/versions', (req, res) =>
{
  try
  {
    const versions = getVersionMetadata();

    const rawReturnVersion = req.query.returnVersion ?? req.query.returnVersions;
    const rawReturnStructure = req.query.returnBibleStructure ?? req.query.returnbibleStructure ?? req.query['return bibleStructure'] ?? req.query.returnStructure ?? req.query.bibleStructure;

    const parsedReturnVersion = parseBoolParam(rawReturnVersion);
    const parsedReturnStructure = parseBoolParam(rawReturnStructure);

    const versionId = req.query.versionId || req.query.version || null;
    const rawBook = req.query.bookNumber ?? req.query.bookNum;
    const rawChapter = req.query.chapterNumber ?? req.query.chapterNum ?? req.query.chNum;
    const rawVerse = req.query.verseNumber ?? req.query.verseNum;

    const bookNumber = (rawBook !== undefined && rawBook !== null && rawBook !== '') ? Number(rawBook) : null;
    const chapterNumber = (rawChapter !== undefined && rawChapter !== null && rawChapter !== '') ? Number(rawChapter) : null;
    const verseNumber = (rawVerse !== undefined && rawVerse !== null && rawVerse !== '') ? Number(rawVerse) : null;

    let shouldReturnVersion;
    if (parsedReturnVersion !== undefined)
    {
      shouldReturnVersion = parsedReturnVersion;
    }
    else
    {
      if (parsedReturnStructure === undefined && !(bookNumber && chapterNumber))
      {
        shouldReturnVersion = true;
      }
      else
      {
        shouldReturnVersion = false;
      }
    }

    const shouldReturnStructure = parsedReturnStructure === true;

    let bibleStructure = null;
    if (shouldReturnStructure && versionId)
    {
      const structure = getBibleStructure(versionId);
      const books = [];
      for (let bNum = 1; bNum <= 66; bNum++)
      {
        const struct = structure ? structure.get(bNum) : null;
        if (struct && struct.verseCounts && struct.verseCounts.length > 0)
        {
          books.push(struct.verseCounts);
        }
      }
      const ver = versions.find(v => v.id === versionId || v.file === versionId || v.dbFile === versionId);
      let bookNames = (ver && Array.isArray(ver.books) && ver.books.length > 0) ? ver.books : [];
      if (bookNames.length === 0)
      {
        bookNames = books.map((_, idx) => `Book ${idx + 1}`);
      }

      bibleStructure = {
        books,
        bookNames
      };
    }

    let chapterTexts = null;
    if (versionId && bookNumber && chapterNumber)
    {
      const db = getBibleDb(versionId);
      if (db)
      {
        let rows;
        if (verseNumber)
        {
          rows = db.prepare(
            'SELECT wordId, word, bookNum, chNum, verseNum FROM words WHERE bookNum = ? AND chNum = ? AND verseNum = ? ORDER BY verseNum'
          ).all(bookNumber, chapterNumber, verseNumber);
        }
        else
        {
          rows = db.prepare(
            'SELECT wordId, word, bookNum, chNum, verseNum FROM words WHERE bookNum = ? AND chNum = ? ORDER BY verseNum'
          ).all(bookNumber, chapterNumber);
        }

        const verseRows = rows.map(r => ({
          ...r,
          versionId
        }));

        chapterTexts = {
          version: versionId,
          bookNum: bookNumber,
          chNum: chapterNumber,
          verses: verseRows
        };
      }
    }

    const response = {};
    if (shouldReturnVersion)
    {
      response.versions = versions;
    }
    if (shouldReturnStructure)
    {
      response.bibleStructure = bibleStructure;
    }
    if (chapterTexts)
    {
      response.chapterTexts = chapterTexts;
    }

    res.json(response);
  }
  catch (err)
  {
    res.status(500).json({ error: err.message });
  }
});

// API: Stats & System Info
app.get('/api/stats', (req, res) =>
{
  try
  {
    const songCount = smDb.prepare('SELECT COUNT(*) as count FROM sm').get().count;
    
    let tamilCount = 0;
    const tamilDb = getBibleDb('tamil.db');
    if (tamilDb)
    {
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
  }
  catch (err)
  {
    res.status(500).json({ error: err.message });
  }
});

// API: Detailed Connected Clients List
app.get('/api/clients', (req, res) =>
{
  try
  {
    const summaries = getClientSummaries();
    res.json(summaries);
  }
  catch (err)
  {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 7. Static Files & Routing
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) =>
  {
    if (filePath.endsWith('.html'))
    {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Explicit redirects for clean paths
app.get('/presenter', (req, res) =>
{
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'presenter', 'index.html'));
});

app.get('/display', (req, res) =>
{
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'display', 'index.html'));
});

// 404 for unhandled API routes
app.all('/api/*', (req, res) =>
{
  res.status(404).json({ error: 'Endpoint not found' });
});

// Fallback to public index
app.get('*', (req, res) =>
{
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(publicIndex))
  {
    res.sendFile(publicIndex);
  }
  else
  {
    res.redirect('/presenter');
  }
});

// ---------------------------------------------------------------------------
// 8. Start HTTP + Socket.io Server
// ---------------------------------------------------------------------------
server.on('error', (err) =>
{
  if (err.code === 'EADDRINUSE')
  {
    console.warn(`Primary port ${PORT} in use, attempting fallback to 3000...`);
    if (PORT !== 3000)
    {
      server.listen(3000, '0.0.0.0');
    }
  }
  else
  {
    console.error('Server error:', err);
  }
});

server.listen(PORT, '0.0.0.0', () =>
{
  console.log(`Verse View Server running at http://0.0.0.0:${PORT}`);
  console.log(`Using songs database: ${songsDbFileName}`);
  console.log(`Presenter Console available at: http://0.0.0.0:${PORT}/presenter/`);
  console.log(`Display Output available at:    http://0.0.0.0:${PORT}/display/`);
});

// In production Cloud Run, additionally listen on 3000 if different from PORT for internal compatibility
if (!isDevSandbox && PORT !== 3000)
{
  try
  {
    const secondaryServer = http.createServer(app);
    secondaryServer.on('error', (err) =>
    {
      console.warn('Secondary 3000 listener note:', err.message);
    });
    secondaryServer.listen(3000, '0.0.0.0', () =>
    {
      console.log('Secondary port 3000 listener active');
    });
  }
  catch (e)
  {
    // Harmless if 3000 is occupied
  }
}
