import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Server } from 'socket.io';
import { isTamilBibleFont, isKnownBaminiFont, baminiToUnicode } from './lib/bamini.js';
import * as songsCleaner from './lib/songsCleaner.js';
import { matchContiguousPhoneticPhrase, matchesQueryPhonetic, tokenizeText, getSoundKey, matchWithPrecomputedKeys, matchTokenInfosWithKeys, buildTargetTokenInfos, compileQueryPattern } from './public/presenter/js/tamilPhonetic.js';

const isBamini = (f) => isTamilBibleFont(f) || isKnownBaminiFont(f);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const server = http.createServer(app);

// Disable Nagle's algorithm for immediate low-latency packet delivery
server.on('connection', (sock) =>
{
  sock.setNoDelay(true);
});

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  perMessageDeflate: false // Disable per-message zlib compression to save CPU and eliminate buffering delays on small JSON payloads
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
// 1b. Recents Database (data/recents.db) - Historical Projection Logging
// ---------------------------------------------------------------------------
const recentsDbPath = path.join(dataDir, 'recents.db');
const recentsDb = new DatabaseSync(recentsDbPath);

try
{
  recentsDb.exec('PRAGMA journal_mode = DELETE;');
  recentsDb.exec(`
    CREATE TABLE IF NOT EXISTS recents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_type TEXT NOT NULL,
      song_id INTEGER,
      slide_index INTEGER DEFAULT 1,
      bible_version TEXT,
      book_num INTEGER,
      chapter_num INTEGER,
      verse_num INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_recents_created_at ON recents(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recents_song ON recents(item_type, song_id, slide_index, created_at);
    CREATE INDEX IF NOT EXISTS idx_recents_bible ON recents(item_type, bible_version, book_num, chapter_num, verse_num, created_at);
  `);
  // One-time startup prune of entries older than 60 days
  recentsDb.exec("DELETE FROM recents WHERE created_at < datetime('now', '-60 days');");
}
catch (e)
{
  console.error('Error initializing recents.db:', e);
}

// ---------------------------------------------------------------------------
// 2. Bible Versions Manager & Read-Only SQLite Database Connections
// ---------------------------------------------------------------------------
const bibleDbCache = new Map();
const bibleStructureCache = new Map();
const bibleSearchIndex = new Map(); // versionId -> Array of pre-indexed verses

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

// ---------------------------------------------------------------------------
// 0. Settings Configuration Manager (data/config.json)
// ---------------------------------------------------------------------------
const configFilePath = path.join(dataDir, 'config.json');

function getDefaultConfig()
{
  const versions = getVersionMetadata();
  const defaultBibleFonts = {};
  for (const v of versions)
  {
    defaultBibleFonts[v.id] = v.selectedfont || 'Baloo Thambi';
  }
  return {
    fontMapping: {
      bible: defaultBibleFonts,
      songOverrides: {}
    }
  };
}

function loadConfig()
{
  try
  {
    if (fs.existsSync(configFilePath))
    {
      const parsed = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
      if (parsed && typeof parsed === 'object')
      {
        if (!parsed.fontMapping) parsed.fontMapping = {};
        if (!parsed.fontMapping.bible) parsed.fontMapping.bible = {};
        if (!parsed.fontMapping.songOverrides) parsed.fontMapping.songOverrides = {};
        return parsed;
      }
    }
  }
  catch (err)
  {
    console.error('Error reading config.json:', err);
  }
  const def = getDefaultConfig();
  saveConfig(def);
  return def;
}

function saveConfig(config)
{
  try
  {
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  }
  catch (err)
  {
    console.error('Error saving config.json:', err);
    return false;
  }
}

function getDistinctSongFonts()
{
  try
  {
    const rows = smDb.prepare(`
      SELECT DISTINCT font 
      FROM sm 
      WHERE font IS NOT NULL AND TRIM(font) != '' 
      ORDER BY font COLLATE NOCASE ASC
    `).all();
    return rows.map(r => r.font.trim()).filter(Boolean);
  }
  catch (err)
  {
    console.error('Error querying distinct song fonts:', err);
    return ['Baloo Thambi', 'Bamini', 'Tamil Bible', 'Tamil-Ananthi', 'Mukta Malar', 'Latha', 'Arial'];
  }
}

let cachedVersionMetadata = null;

function getVersionMetadata(forceReload = false)
{
  if (cachedVersionMetadata && !forceReload)
  {
    return cachedVersionMetadata;
  }
  const versionFile = path.join(dataDir, 'version.json');
  if (!fs.existsSync(versionFile)) return [];
  try
  {
    const raw = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    const list = raw.version || raw.versions || [];
    let bibleFontMap = {};
    try
    {
      if (fs.existsSync(configFilePath))
      {
        const parsedCfg = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        bibleFontMap = (parsedCfg && parsedCfg.fontMapping && parsedCfg.fontMapping.bible) || {};
      }
    }
    catch (e) {}

    cachedVersionMetadata = list.map((item, idx) =>
    {
      const file = item.file || item.dbFile || `${item.id || 'bible'}.db`;
      const id = item.id || file.replace(/\.db$/i, '');
      const dbExists = fs.existsSync(path.join(dataDir, file));
      const booknames = item.booknames || item.books || [];
      const configuredFont = bibleFontMap[id] || item.selectedfont || 'Arial';
      return {
        id,
        name: item.name || `Version ${idx + 1}`,
        file,
        dbFile: file,
        books: booknames,
        booknames: booknames,
        selectedfont: configuredFont,
        defaultfont: item.selectedfont || 'Arial',
        copyright: item.copyright || '',
        left2right: item.left2right !== undefined ? item.left2right : true,
        available: dbExists
      };
    });
    return cachedVersionMetadata;
  }
  catch (err)
  {
    console.error('Error reading version.json:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Pre-Computed In-Memory Bible Search Engine (Zero-Disk Low-Latency Querying)
// ---------------------------------------------------------------------------
function getOrBuildBibleSearchIndex(versionId = 'tamil')
{
  const targetId = versionId.replace(/\.db$/i, '');
  if (bibleSearchIndex.has(targetId))
  {
    return bibleSearchIndex.get(targetId);
  }

  const versions = getVersionMetadata();
  const matchedVer = versions.find(v => v.id === targetId || v.file === targetId || v.file === `${targetId}.db`);
  const actualVersionId = matchedVer ? matchedVer.id : targetId;

  if (bibleSearchIndex.has(actualVersionId))
  {
    return bibleSearchIndex.get(actualVersionId);
  }

  const db = getBibleDb(actualVersionId);
  if (!db) return [];

  try
  {
    const t0 = Date.now();
    const rows = db.prepare('SELECT wordId, bookNum, chNum, verseNum, word FROM words ORDER BY bookNum, chNum, verseNum').all();
    
    const bookNames = (matchedVer && (matchedVer.booknames || matchedVer.books)) || [];
    const kjvVer = versions.find(v => v.id === 'kjv' || v.file === 'kjv.db');
    const englishBookNames = (kjvVer && (kjvVer.booknames || kjvVer.books)) || [];

    const indexedVerses = rows.map(r => {
      const bNum = Number(r.bookNum);
      const chNum = Number(r.chNum);
      const vNum = Number(r.verseNum);
      const bookName = (bookNames && bookNames[bNum - 1]) ? bookNames[bNum - 1] : `Book ${bNum}`;
      const engName = (englishBookNames && englishBookNames[bNum - 1]) ? englishBookNames[bNum - 1] : `Book ${bNum}`;
      const tokens = tokenizeText(r.word);
      const tokenInfos = buildTargetTokenInfos(tokens);

      return {
        wordId: r.wordId,
        bookNum: bNum,
        chNum: chNum,
        verseNum: vNum,
        bookName,
        bookNameLower: bookName.toLowerCase(),
        engName,
        engNameLower: engName.toLowerCase(),
        word: r.word,
        wordLower: (r.word || '').toLowerCase(),
        tokens,
        tokenInfos,
        versionId: actualVersionId
      };
    });

    bibleSearchIndex.set(actualVersionId, indexedVerses);
    console.log(`In-memory Bible search index built for '${actualVersionId}': ${indexedVerses.length} verses in ${Date.now() - t0}ms`);
    return indexedVerses;
  }
  catch (err)
  {
    console.error(`Failed to build Bible search index for ${versionId}:`, err);
    return [];
  }
}

// Pre-compiled prepared statement cache for high-speed verse queries
const bibleVerseStmtCache = new Map();
function getBibleVerseStmt(db)
{
  let stmt = bibleVerseStmtCache.get(db);
  if (!stmt)
  {
    stmt = db.prepare('SELECT word FROM words WHERE bookNum = ? AND chNum = ? AND verseNum = ?');
    bibleVerseStmtCache.set(db, stmt);
  }
  return stmt;
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

function recordRecentProjection(state)
{
  if (!state || state.status !== 'live') return;
  try
  {
    if (state.type === 'song' && state.songId)
    {
      const songId = Number(state.songId);
      const slideIndex = Math.max(1, Number(state.slideIndex) || 1);

      // 1-minute deduplication
      const checkStmt = recentsDb.prepare(`
        SELECT id FROM recents
        WHERE item_type = 'song'
          AND song_id = ?
          AND slide_index = ?
          AND created_at >= datetime('now', '-1 minute')
        LIMIT 1
      `);
      const recent = checkStmt.get(songId, slideIndex);
      if (!recent)
      {
        recentsDb.prepare(`
          INSERT INTO recents (item_type, song_id, slide_index)
          VALUES ('song', ?, ?)
        `).run(songId, slideIndex);
      }
    }
    else if (state.type === 'bible' && (state.verseInfo || (state.bookNum && state.chNum && state.verseNum)))
    {
      const vInfo = state.verseInfo || state;
      const versionId = String(vInfo.version || vInfo.versionId || 'tamil').replace(/\.db$/i, '').trim().toLowerCase();
      const bookNum = Number(vInfo.bookNum) || 1;
      const chNum = Number(vInfo.chNum) || 1;
      const verseNum = Number(vInfo.verseNum) || 1;

      // 1-minute deduplication
      const checkStmt = recentsDb.prepare(`
        SELECT id FROM recents
        WHERE item_type = 'bible'
          AND bible_version = ?
          AND book_num = ?
          AND chapter_num = ?
          AND verse_num = ?
          AND created_at >= datetime('now', '-1 minute')
        LIMIT 1
      `);
      const recent = checkStmt.get(versionId, bookNum, chNum, verseNum);
      if (!recent)
      {
        recentsDb.prepare(`
          INSERT INTO recents (item_type, bible_version, book_num, chapter_num, verse_num)
          VALUES ('bible', ?, ?, ?, ?)
        `).run(versionId, bookNum, chNum, verseNum);
      }
    }
  }
  catch (e)
  {
    console.error('Error recording recent projection:', e);
  }
}

function broadcastState()
{
  io.emit('display:update', currentState);
  recordRecentProjection(currentState);
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

let stmtGetSongById = null;
function getSongById(id)
{
  if (!stmtGetSongById)
  {
    stmtGetSongById = smDb.prepare('SELECT id, name, title2, cat, font, font2, lyrics FROM sm WHERE id = ?');
  }
  return stmtGetSongById.get(id);
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
        const stmt = getBibleVerseStmt(db);
        const row = stmt.get(bookNum, chNum, verseNum);
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
      title: `${bookName} ${chNum}:${verseNum}`,
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
        versionId: versionId,
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
      const row = getSongById(songId);
      if (row)
      {
        const rawSlides = row.lyrics ? row.lyrics.split('<slide>').filter(s => s.trim().length > 0) : [];
        const totalSlides = rawSlides.length || 1;
        const validSlideIndex = Math.min(slideIndex, totalSlides);
        const targetRawSlide = rawSlides[validSlideIndex - 1] || '';

        const rawLines = targetRawSlide
          ? targetRawSlide.split(/<BR>|\r?\n/i).map(l => l.replace(/<[^>]*>/g, '').trim())
          : [];
        while (rawLines.length > 0 && !rawLines[0]) rawLines.shift();
        while (rawLines.length > 0 && !rawLines[rawLines.length - 1]) rawLines.pop();
        const lines = rawLines.map(l => (isBamini(row.font) && l ? baminiToUnicode(l) : l));

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
  const lines = rawLines.map(l => (isBamini(payload.font) ? baminiToUnicode(l) : l));

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

  // Action: Latency ping measurement
  socket.on('client:ping', (clientTime, ack) =>
  {
    if (typeof clientTime === 'function')
    {
      clientTime();
      return;
    }
    if (typeof ack === 'function')
    {
      ack(clientTime);
    }
    else
    {
      socket.emit('server:pong', clientTime);
    }
  });

  // Action: Present Slide (Song or Scripture)
  socket.on('action:present', (payload) =>
  {
    if (!payload) return;
    currentState = resolveLiveState(payload);
    broadcastState();
  });

  // Action: Previous Slide or Verse (Server-Managed Navigation)
  socket.on('action:previous', () =>
  {
    if (!currentState || currentState.status !== 'live' || currentState.type === 'none') return;

    if (currentState.type === 'song' && currentState.songId)
    {
      const currentIdx = Number(currentState.slideIndex) || 1;
      const prevIdx = Math.max(1, currentIdx - 1);
      if (prevIdx !== currentIdx)
      {
        currentState = resolveLiveState({
          type: 'song',
          songId: currentState.songId,
          slideIndex: prevIdx
        });
        broadcastState();
      }
    }
    else if (currentState.type === 'bible' && currentState.verseInfo)
    {
      const vInfo = currentState.verseInfo;
      const currentVerse = Number(vInfo.verseNum) || 1;
      const prevVerse = Math.max(1, currentVerse - 1);
      if (prevVerse !== currentVerse)
      {
        currentState = resolveLiveState({
          type: 'bible',
          verseInfo: {
            ...vInfo,
            verseNum: prevVerse
          }
        });
        broadcastState();
      }
    }
  });

  // Action: Next Slide or Verse (Server-Managed Navigation)
  socket.on('action:next', () =>
  {
    if (!currentState || currentState.status !== 'live' || currentState.type === 'none') return;

    if (currentState.type === 'song' && currentState.songId)
    {
      const currentIdx = Number(currentState.slideIndex) || 1;
      const totalSlides = Number(currentState.totalSlides) || 1;
      const nextIdx = Math.min(totalSlides, currentIdx + 1);
      if (nextIdx !== currentIdx)
      {
        currentState = resolveLiveState({
          type: 'song',
          songId: currentState.songId,
          slideIndex: nextIdx
        });
        broadcastState();
      }
    }
    else if (currentState.type === 'bible' && currentState.verseInfo)
    {
      const vInfo = currentState.verseInfo;
      const currentVerse = Number(vInfo.verseNum) || 1;
      let maxVerse = 150;
      const db = getBibleDb(vInfo.version);
      if (db)
      {
        try
        {
          const row = db.prepare('SELECT MAX(verseNum) as maxVerse FROM words WHERE bookNum = ? AND chNum = ?').get(vInfo.bookNum, vInfo.chNum);
          if (row && row.maxVerse) maxVerse = Number(row.maxVerse);
        }
        catch (e)
        {
          console.error('Error fetching max verse in action:next:', e);
        }
      }
      const nextVerse = Math.min(maxVerse, currentVerse + 1);
      if (nextVerse !== currentVerse)
      {
        currentState = resolveLiveState({
          type: 'bible',
          verseInfo: {
            ...vInfo,
            verseNum: nextVerse
          }
        });
        broadcastState();
      }
    }
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
      const fullFirstSlide = lines.join(' ').replace(/\s+/g, ' ').trim();
      return isBamini(font) ? baminiToUnicode(fullFirstSlide) : fullFirstSlide;
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

// ---------------------------------------------------------------------------
// In-Memory Search Engine: Pre-computed phonetic sound keys & parsed slides
// ---------------------------------------------------------------------------
const songSearchIndex = new Map();

function indexSongRecord(r)
{
  if (!r) return null;
  const needsConversion = isBamini(r.font);
  const convertedLyrics = needsConversion ? baminiToUnicode(r.lyrics) : (r.lyrics || '');
  const rawSlides = convertedLyrics.split('<slide>');
  const slides = [];
  let currentIdx = 0;

  for (const s of rawSlides)
  {
    const clean = s.trim();
    if (!clean) continue;
    currentIdx++;

    const tokens = tokenizeText(clean);
    const rawLines = clean.split(/<BR>|\r?\n/i).map(l => l.replace(/<[^>]*>/g, '').trim()).filter(Boolean);

    slides.push({
      slideIndex: currentIdx,
      cleanSlide: clean,
      cleanSlideLower: clean.toLowerCase(),
      tokens,
      tokenInfos: buildTargetTokenInfos(tokens),
      lines: rawLines
    });
  }

  const nameTokens = tokenizeText(r.name || '');
  const title2Tokens = r.title2 ? tokenizeText(r.title2) : [];
  const tagsTokens = r.tags ? tokenizeText(r.tags) : [];

  return {
    id: Number(r.id),
    name: r.name || '',
    nameLower: (r.name || '').toLowerCase(),
    nameTokens,
    nameTokenInfos: buildTargetTokenInfos(nameTokens),

    title2: r.title2 || '',
    title2Lower: (r.title2 || '').toLowerCase(),
    title2Tokens,
    title2TokenInfos: buildTargetTokenInfos(title2Tokens),

    cat: r.cat || 'General',
    font: r.font || '',
    tags: r.tags || '',
    tagsLower: (r.tags || '').toLowerCase(),
    tagsTokens,
    tagsTokenInfos: buildTargetTokenInfos(tagsTokens),

    lyrics: r.lyrics || '',
    firstLine: extractFirstLine(r.lyrics, r.font),
    slideCount: slides.length,
    slides,
    isConverted: Boolean(needsConversion)
  };
}

let cachedSongsListJson = null;

function refreshSongsListCache()
{
  const list = [];
  for (const s of songSearchIndex.values())
  {
    list.push({
      id: s.id,
      name: s.name,
      title2: s.title2 || '',
      cat: s.cat || 'General',
      font: s.font || '',
      tags: s.tags || '',
      firstLine: s.firstLine || '',
      slideCount: s.slideCount || 0,
      isConverted: Boolean(s.isConverted)
    });
  }
  list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  cachedSongsListJson = list;
}

function initSongSearchIndex()
{
  try
  {
    const t0 = Date.now();
    const rows = smDb.prepare('SELECT id, name, title2, cat, font, tags, lyrics FROM sm').all();
    songSearchIndex.clear();
    for (const r of rows)
    {
      const indexed = indexSongRecord(r);
      if (indexed)
      {
        songSearchIndex.set(indexed.id, indexed);
      }
    }
    refreshSongsListCache();
    console.log(`In-memory song search index built: ${songSearchIndex.size} songs in ${Date.now() - t0}ms`);
  }
  catch (err)
  {
    console.error('Failed to build in-memory song search index:', err);
  }
}

// API: Songs (served instantaneously from in-memory cache when unfiltered)
app.get('/api/songs', (req, res) =>
{
  try
  {
    const q = req.query.q ? String(req.query.q).trim() : '';
    const cat = req.query.cat ? String(req.query.cat).trim() : '';
    const limit = req.query.limit ? Math.min(Number(req.query.limit) || 5000, 10000) : 5000;

    // Instant in-memory delivery if unfiltered
    if (!q && (!cat || cat === 'All') && cachedSongsListJson)
    {
      if (limit < cachedSongsListJson.length)
      {
        return res.json(cachedSongsListJson.slice(0, limit));
      }
      return res.json(cachedSongsListJson);
    }

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
      const isConverted = isBamini(r.font);
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

// API: Full Song Content & Lyrics Search with Pre-Computed Phonetic In-Memory Index
app.get('/api/songs/search', async (req, res) =>
{
  try
  {
    const q = req.query.q ? String(req.query.q).trim() : '';
    if (!q)
    {
      return res.json([]);
    }

    const limit = req.query.limit ? Math.min(Number(req.query.limit) || 500, 2000) : 500;
    const isStreamRequested = req.query.stream !== 'false';

    if (isStreamRequested)
    {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
    }

    // Precompute query pattern and lowercases for search query once
    const qPattern = compileQueryPattern(q);
    const qLower = q.toLowerCase();

    const matches = [];
    let batch = [];
    let lastFlushTime = Date.now();
    let totalSent = 0;

    const flushBatch = () =>
    {
      if (batch.length > 0)
      {
        if (isStreamRequested)
        {
          res.write(JSON.stringify({ type: 'batch', items: batch }) + '\n');
          if (typeof res.flush === 'function') res.flush();
        }
        totalSent += batch.length;
        batch = [];
        lastFlushTime = Date.now();
      }
    };

    // Lazily build index if not yet populated
    if (songSearchIndex.size === 0)
    {
      initSongSearchIndex();
    }

    for (const song of songSearchIndex.values())
    {
      let songMatched = false;
      let matchedSlideIndex = 1;
      let matchedLine = '';
      let matchedTerm = '';
      let totalMatchesInSong = 0;

      // 1. Search slides using pre-computed token sound keys and pattern
      for (const s of song.slides)
      {
        const slideMatch = matchTokenInfosWithKeys(s.tokenInfos, s.tokens, s.cleanSlideLower, qPattern, qLower);
        if (slideMatch.matched)
        {
          totalMatchesInSong++;
          if (!songMatched)
          {
            songMatched = true;
            matchedSlideIndex = s.slideIndex;
            matchedTerm = (slideMatch.matchedWordTokens || slideMatch.matchedTokens).join(' ') || q;

            // Find specific line within this slide for preview snippet
            if (Array.isArray(s.lines) && s.lines.length > 0)
            {
              const qTermLower = qLower.replace(/\*/g, '').trim();
              if (qTermLower)
              {
                matchedLine = s.lines.find(l => typeof l === 'string' && l.toLowerCase().includes(qTermLower)) || '';
              }
              if (!matchedLine)
              {
                // Fallback: match against line tokens on-the-fly for the matched slide only
                for (const lineStr of s.lines)
                {
                  const lTokens = tokenizeText(lineStr);
                  const lInfos = buildTargetTokenInfos(lTokens);
                  const lineMatch = matchTokenInfosWithKeys(lInfos, lTokens, lineStr.toLowerCase(), qPattern, qLower);
                  if (lineMatch.matched)
                  {
                    matchedLine = lineStr;
                    break;
                  }
                }
              }
              if (!matchedLine)
              {
                matchedLine = s.lines[0];
              }
            }
          }
        }
      }

      // 2. Check title / alternate title / tags if no slide matched
      if (!songMatched)
      {
        const nameMatch = matchTokenInfosWithKeys(song.nameTokenInfos, song.nameTokens, song.nameLower, qPattern, qLower);
        const title2Match = song.title2Tokens.length > 0
          ? matchTokenInfosWithKeys(song.title2TokenInfos, song.title2Tokens, song.title2Lower, qPattern, qLower)
          : { matched: false };
        const tagsMatch = song.tagsTokens.length > 0
          ? matchTokenInfosWithKeys(song.tagsTokenInfos, song.tagsTokens, song.tagsLower, qPattern, qLower)
          : { matched: false };

        if (nameMatch.matched || title2Match.matched || tagsMatch.matched)
        {
          songMatched = true;
          matchedSlideIndex = 1;
          matchedLine = song.firstLine || song.name;
          const activeMatch = nameMatch.matched ? nameMatch : (title2Match.matched ? title2Match : tagsMatch);
          matchedTerm = (activeMatch.matchedWordTokens || activeMatch.matchedTokens || [q]).join(' ') || q;
          totalMatchesInSong = 1;
        }
      }

      if (songMatched)
      {
        const item = {
          id: song.id,
          name: song.name,
          title2: song.title2,
          cat: song.cat,
          font: song.font,
          slideCount: song.slideCount,
          matchedSlideIndex,
          matchedLine,
          matchedTerm,
          totalMatches: totalMatchesInSong,
          firstLine: song.firstLine,
          isConverted: song.isConverted
        };

        if (isStreamRequested)
        {
          batch.push(item);

          if (totalSent + batch.length >= limit)
          {
            flushBatch();
            break;
          }

          // Immediate first batch delivery, then batch every 50ms or 25 items
          const shouldFlush = (totalSent === 0 && batch.length >= 10) ||
                              (Date.now() - lastFlushTime >= 50) ||
                              (batch.length >= 25);
          if (shouldFlush)
          {
            flushBatch();
            await new Promise(resolve => setTimeout(resolve, 2));
          }
        }
        else
        {
          matches.push(item);
          if (matches.length >= limit) break;
        }
      }
    }

    if (isStreamRequested)
    {
      flushBatch();
      res.write(JSON.stringify({ type: 'done', total: totalSent }) + '\n');
      res.end();
    }
    else
    {
      res.json(matches);
    }
  }
  catch (err)
  {
    console.error('Error during song content search:', err);
    if (!res.headersSent)
    {
      res.status(500).json({ error: err.message });
    }
    else
    {
      res.write(JSON.stringify({ type: 'error', message: err.message }) + '\n');
      res.end();
    }
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

    const needsConversion = isBamini(song.font);
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
          songId: song.id,
          songid: song.id,
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
    const indexed = indexSongRecord(created);
    if (indexed)
    {
      songSearchIndex.set(indexed.id, indexed);
      refreshSongsListCache();
    }
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
    const indexed = indexSongRecord(updated);
    if (indexed)
    {
      songSearchIndex.set(indexed.id, indexed);
      refreshSongsListCache();
    }
    clearCleanerCache();
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
    songSearchIndex.delete(songId);
    refreshSongsListCache();
    res.json({ success: true, deletedId: songId });
  }
  catch (err)
  {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Songs Maintenance & Duplicate Remover Endpoints
// ---------------------------------------------------------------------------
let cleanerCache = {
  exact: null,
  diffTitle: null,
  similar: null,
  errors: null,
  bamini: null,
  summary: null,
  cacheTime: 0
};

const CLEANER_CACHE_TTL = 30000; // 30 seconds

function isCleanerCacheValid()
{
  return (Date.now() - cleanerCache.cacheTime) < CLEANER_CACHE_TTL;
}

function clearCleanerCache()
{
  cleanerCache = {
    exact: null,
    diffTitle: null,
    similar: null,
    errors: null,
    bamini: null,
    summary: null,
    cacheTime: 0
  };
}

// 0. High-level Summary for Cleaner Hub Badges
app.get('/api/songs-cleaner/summary', (req, res) =>
{
  try
  {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && isCleanerCacheValid() && cleanerCache.summary)
    {
      return res.json(cleanerCache.summary);
    }

    const totalSongs = smDb.prepare('SELECT COUNT(*) as count FROM sm').get()?.count || 0;

    // Load or calculate exact duplicates
    if (!cleanerCache.exact || forceRefresh)
    {
      cleanerCache.exact = songsCleaner.findExactDuplicates(smDb);
    }

    // Load or calculate diff title duplicates
    if (!cleanerCache.diffTitle || forceRefresh)
    {
      cleanerCache.diffTitle = songsCleaner.findDifferentTitleDuplicates(smDb);
    }

    // Load or calculate Bamini status
    if (!cleanerCache.bamini || forceRefresh)
    {
      cleanerCache.bamini = songsCleaner.analyzeBaminiConversion(smDb);
    }

    const summary = {
      totalSongs,
      exactDuplicateGroups: cleanerCache.exact.totalGroups,
      exactDuplicateSongs: cleanerCache.exact.totalDuplicateSongs,
      diffTitleGroups: cleanerCache.diffTitle.totalGroups,
      diffTitleDuplicateSongs: cleanerCache.diffTitle.totalDuplicateSongs,
      baminiTotal: cleanerCache.bamini.totalBaminiSongs,
      baminiClean: cleanerCache.bamini.cleanCount,
      baminiSuspicious: cleanerCache.bamini.suspiciousCount
    };

    cleanerCache.summary = summary;
    cleanerCache.cacheTime = Date.now();
    res.json(summary);
  }
  catch (err)
  {
    console.error('Error fetching cleaner summary:', err);
    res.status(500).json({ error: err.message });
  }
});

// 1. Exact Duplicate Songs (Same Title & Content)
app.get('/api/songs-cleaner/exact-duplicates', (req, res) =>
{
  try
  {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && isCleanerCacheValid() && cleanerCache.exact)
    {
      return res.json(cleanerCache.exact);
    }

    const data = songsCleaner.findExactDuplicates(smDb);
    cleanerCache.exact = data;
    cleanerCache.cacheTime = Date.now();
    res.json(data);
  }
  catch (err)
  {
    console.error('Error finding exact duplicates:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Duplicate Songs with Different Title (Same Content, Different Title)
app.get('/api/songs-cleaner/diff-title-duplicates', (req, res) =>
{
  try
  {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && isCleanerCacheValid() && cleanerCache.diffTitle)
    {
      return res.json(cleanerCache.diffTitle);
    }

    const data = songsCleaner.findDifferentTitleDuplicates(smDb);
    cleanerCache.diffTitle = data;
    cleanerCache.cacheTime = Date.now();
    res.json(data);
  }
  catch (err)
  {
    console.error('Error finding diff-title duplicates:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Similar / Near-Duplicate Songs (Content More or Less Same)
app.get('/api/songs-cleaner/similar-duplicates', (req, res) =>
{
  try
  {
    const forceRefresh = req.query.refresh === 'true';
    const minSimilarity = Math.max(50, Math.min(98, Number(req.query.similarity) || 70));

    if (!forceRefresh && isCleanerCacheValid() && cleanerCache.similar)
    {
      return res.json(cleanerCache.similar);
    }

    const data = songsCleaner.findSimilarDuplicates(smDb, minSimilarity);
    cleanerCache.similar = data;
    cleanerCache.cacheTime = Date.now();
    res.json(data);
  }
  catch (err)
  {
    console.error('Error finding similar duplicates:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Songs Error Analyse (Mixed Fonts, Typos, Language Misuse, Slide Structure)
app.get('/api/songs-cleaner/error-analysis', (req, res) =>
{
  try
  {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && isCleanerCacheValid() && cleanerCache.errors)
    {
      return res.json(cleanerCache.errors);
    }

    const data = songsCleaner.analyzeSongErrors(smDb);
    cleanerCache.errors = data;
    cleanerCache.cacheTime = Date.now();
    res.json(data);
  }
  catch (err)
  {
    console.error('Error analyzing song errors:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Bamini to Unicode Converter Analysis (Clean vs Suspicious)
app.get('/api/songs-cleaner/bamini-analysis', (req, res) =>
{
  try
  {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && isCleanerCacheValid() && cleanerCache.bamini)
    {
      return res.json(cleanerCache.bamini);
    }

    const data = songsCleaner.analyzeBaminiConversion(smDb);
    cleanerCache.bamini = data;
    cleanerCache.cacheTime = Date.now();
    res.json(data);
  }
  catch (err)
  {
    console.error('Error analyzing Bamini songs:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mass Convert Clean Bamini Songs
app.post('/api/songs-cleaner/convert-clean-bamini', (req, res) =>
{
  try
  {
    const targetFont = (req.body && req.body.targetFont) ? String(req.body.targetFont).trim() : 'Baloo Thambi';
    const result = songsCleaner.massConvertCleanBamini(smDb, dataDir, songsDbFileName, targetFont);

    // Rebuild in-memory search index for updated songs
    initSongSearchIndex();
    clearCleanerCache();

    res.json(result);
  }
  catch (err)
  {
    console.error('Error mass converting clean Bamini songs:', err);
    res.status(500).json({ error: err.message });
  }
});

// Convert Single Song after side-by-side review
app.post('/api/songs-cleaner/convert-single-bamini', (req, res) =>
{
  try
  {
    const songId = Number(req.body.id);
    if (!songId || isNaN(songId))
    {
      return res.status(400).json({ error: 'Valid song ID required' });
    }

    const updatedLyrics = req.body.lyrics !== undefined ? String(req.body.lyrics) : null;
    const targetFont = (req.body.targetFont) ? String(req.body.targetFont).trim() : 'Baloo Thambi';

    const result = songsCleaner.convertSingleBamini(smDb, dataDir, songsDbFileName, songId, updatedLyrics, targetFont);

    // Update in-memory index
    const updated = smDb.prepare('SELECT id, name, title2, cat, font, font2, key, notes, tags, lyrics, lyrics2 FROM sm WHERE id = ?').get(songId);
    if (updated)
    {
      const indexed = indexSongRecord(updated);
      if (indexed)
      {
        songSearchIndex.set(indexed.id, indexed);
      }
    }
    refreshSongsListCache();
    clearCleanerCache();

    res.json(result);
  }
  catch (err)
  {
    console.error('Error converting single Bamini song:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete batch of songs (Features 1, 2, 3)
app.post('/api/songs-cleaner/delete', (req, res) =>
{
  try
  {
    const ids = req.body && req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0)
    {
      return res.status(400).json({ error: 'Song IDs array required' });
    }

    const result = songsCleaner.deleteSongsBatch(smDb, dataDir, songsDbFileName, ids);

    for (const id of ids)
    {
      songSearchIndex.delete(Number(id));
    }
    refreshSongsListCache();
    clearCleanerCache();

    res.json(result);
  }
  catch (err)
  {
    console.error('Error deleting duplicate songs:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update single song (from Error Analysis quick-fix editor)
app.post('/api/songs-cleaner/update-song', (req, res) =>
{
  try
  {
    const { id, name, cat, font, lyrics } = req.body;
    const songId = Number(id);
    if (!songId || isNaN(songId))
    {
      return res.status(400).json({ error: 'Valid song ID required' });
    }

    songsCleaner.silentBackupSongsDb(dataDir, songsDbFileName);

    const updateFields = [];
    const params = [];
    if (name !== undefined) { updateFields.push('name = ?'); params.push(String(name).trim()); }
    if (cat !== undefined) { updateFields.push('cat = ?'); params.push(String(cat).trim()); }
    if (font !== undefined) { updateFields.push('font = ?'); params.push(String(font).trim()); }
    if (lyrics !== undefined) { updateFields.push('lyrics = ?'); params.push(String(lyrics).trim()); }

    if (updateFields.length > 0)
    {
      params.push(songId);
      smDb.prepare(`UPDATE sm SET ${updateFields.join(', ')} WHERE id = ?`).run(...params);
    }

    const updated = smDb.prepare('SELECT id, name, title2, cat, font, font2, key, notes, tags, lyrics, lyrics2 FROM sm WHERE id = ?').get(songId);
    if (updated)
    {
      const indexed = indexSongRecord(updated);
      if (indexed) songSearchIndex.set(indexed.id, indexed);
      refreshSongsListCache();
    }
    clearCleanerCache();

    res.json({ success: true, song: updated });
  }
  catch (err)
  {
    console.error('Error updating song from cleaner:', err);
    res.status(500).json({ error: err.message });
  }
});

// Batch assign "Tamil Bible" font to all songs with Bamini keystroke encoding
app.post('/api/songs-cleaner/batch-assign-tamil-bible', (req, res) =>
{
  try
  {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    const result = songsCleaner.batchAssignTamilBibleFont(smDb, dataDir, songsDbFileName, ids);

    // Re-index updated songs in search index
    if (result.updatedIds && result.updatedIds.length > 0)
    {
      for (const id of result.updatedIds)
      {
        const updated = smDb.prepare('SELECT id, name, title2, cat, font, font2, key, notes, tags, lyrics, lyrics2 FROM sm WHERE id = ?').get(id);
        if (updated)
        {
          const indexed = indexSongRecord(updated);
          if (indexed) songSearchIndex.set(indexed.id, indexed);
        }
      }
      refreshSongsListCache();
    }
    clearCleanerCache();

    res.json(result);
  }
  catch (err)
  {
    console.error('Error batch updating Tamil Bible font:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: In-Memory Bible Scripture Search (Tamil Phonetic, Unicode & Reference Search)
app.get('/api/bible/search', (req, res) =>
{
  try
  {
    const q = req.query.q ? String(req.query.q).trim() : '';
    if (!q)
    {
      return res.json([]);
    }

    const versionId = req.query.versionId || req.query.version || 'tamil';
    const limit = req.query.limit ? Math.min(Number(req.query.limit) || 100, 500) : 100;

    const verses = getOrBuildBibleSearchIndex(versionId);
    if (!verses || verses.length === 0)
    {
      return res.json([]);
    }

    const results = [];
    const qLower = q.toLowerCase();

    // 1. Scripture reference parsing (e.g. "John 3:16", "யோவான் 3:16", "1 John 1:9", "1 3 16")
    const refMatch = q.match(/^([0-9]*\s*[a-zA-Z\u0B80-\u0BFF]+(?:\s+[a-zA-Z\u0B80-\u0BFF]+)?)\s+(\d+)(?:[:\s]+(\d+))?$/);
    const numRefMatch = !refMatch && q.match(/^(\d+)\s*[:\s]\s*(\d+)(?:[:\s](\d+))?$/);

    let targetBookNum = null;
    let targetChNum = null;
    let targetVerseNum = null;

    if (refMatch)
    {
      const rawBookStr = refMatch[1].trim().toLowerCase();
      targetChNum = Number(refMatch[2]);
      targetVerseNum = refMatch[3] ? Number(refMatch[3]) : null;

      for (const v of verses)
      {
        if (v.bookNameLower === rawBookStr || v.engNameLower === rawBookStr ||
            v.bookNameLower.startsWith(rawBookStr) || v.engNameLower.startsWith(rawBookStr))
        {
          targetBookNum = v.bookNum;
          break;
        }
      }
    }
    else if (numRefMatch)
    {
      if (numRefMatch[3])
      {
        targetBookNum = Number(numRefMatch[1]);
        targetChNum = Number(numRefMatch[2]);
        targetVerseNum = Number(numRefMatch[3]);
      }
      else
      {
        targetChNum = Number(numRefMatch[1]);
        targetVerseNum = Number(numRefMatch[2]);
      }
    }

    if (targetChNum)
    {
      for (const v of verses)
      {
        if (targetBookNum && v.bookNum !== targetBookNum) continue;
        if (v.chNum !== targetChNum) continue;
        if (targetVerseNum && v.verseNum !== targetVerseNum) continue;

        results.push({
          wordId: v.wordId,
          bookNum: v.bookNum,
          chNum: v.chNum,
          verseNum: v.verseNum,
          bookName: v.bookName,
          word: v.word,
          versionId: v.versionId,
          reference: `${v.bookName} ${v.chNum}:${v.verseNum}`,
          matchedTerm: q
        });

        if (results.length >= limit) break;
      }

      if (results.length > 0)
      {
        return res.json(results);
      }
    }

    // 2. Phonetic & Substring Verse Search with wildcard and gap support
    const qPattern = compileQueryPattern(q);

    for (const v of verses)
    {
      const match = matchTokenInfosWithKeys(v.tokenInfos, v.tokens, v.wordLower, qPattern, qLower);
      if (match.matched)
      {
        results.push({
          wordId: v.wordId,
          bookNum: v.bookNum,
          chNum: v.chNum,
          verseNum: v.verseNum,
          bookName: v.bookName,
          word: v.word,
          versionId: v.versionId,
          reference: `${v.bookName} ${v.chNum}:${v.verseNum}`,
          matchedTokens: match.matchedTokens,
          matchedWordTokens: match.matchedWordTokens,
          matchedTerm: (match.matchedWordTokens || match.matchedTokens).join(' ') || q
        });

        if (results.length >= limit) break;
      }
    }

    res.json(results);
  }
  catch (err)
  {
    console.error('Error during Bible search:', err);
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

    let versionId = req.query.versionId || req.query.version || null;
    if (versionId === 'null' || versionId === 'undefined' || versionId === '')
    {
      versionId = null;
    }

    const rawBook = req.query.bookNumber ?? req.query.bookNum;
    const rawChapter = req.query.chapterNumber ?? req.query.chapterNum ?? req.query.chNum;
    const rawVerse = req.query.verseNumber ?? req.query.verseNum;

    const bookNumber = (rawBook !== undefined && rawBook !== null && rawBook !== '' && rawBook !== '0' && rawBook !== 0) ? Number(rawBook) : null;
    const chapterNumber = (rawChapter !== undefined && rawChapter !== null && rawChapter !== '' && rawChapter !== '0' && rawChapter !== 0) ? Number(rawChapter) : null;
    const verseNumber = (rawVerse !== undefined && rawVerse !== null && rawVerse !== '' && rawVerse !== '0' && rawVerse !== 0) ? Number(rawVerse) : null;

    if (!versionId && (parsedReturnStructure === true || (bookNumber && chapterNumber)))
    {
      const availableVer = versions.find(v => v.available);
      versionId = availableVer ? availableVer.id : 'tamil';
    }

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

      bibleStructure = {
        books
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
// 6b. Recents API (Collapsible Date Grouped History, ~100 count batching)
// ---------------------------------------------------------------------------
function enrichRecentItem(row)
{
  if (row.item_type === 'song')
  {
    const songId = Number(row.song_id);
    const slideIndex = Math.max(1, Number(row.slide_index) || 1);
    let title = 'Song #' + songId;
    let title2 = '';
    let cat = 'Song';
    let font = '';
    let font2 = '';
    let totalSlides = 1;
    let snippet = '';

    try
    {
      const songRow = getSongById(songId);
      if (songRow)
      {
        title = songRow.name || title;
        title2 = songRow.title2 || '';
        cat = songRow.cat || 'Song';
        font = songRow.font || '';
        font2 = songRow.font2 || '';
        const needsConversion = isBamini(songRow.font);
        const convertedLyrics = needsConversion ? baminiToUnicode(songRow.lyrics) : songRow.lyrics;
        const rawSlides = (convertedLyrics || '').split('<slide>');
        const validSlides = [];
        rawSlides.forEach((s) =>
        {
          const clean = s.trim();
          if (!clean) return;
          const lines = clean.split(/<BR>|\r?\n/i).map(l => l.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
          if (lines.length > 0) validSlides.push(lines);
        });
        totalSlides = validSlides.length || 1;
        const targetLines = validSlides[slideIndex - 1] || [];
        snippet = targetLines.join('\n');
      }
    }
    catch (e) {}

    return {
      id: row.id,
      item_type: 'song',
      song_id: songId,
      slide_index: slideIndex,
      total_slides: totalSlides,
      title: title,
      title2: title2,
      category: cat,
      font: font,
      font2: font2,
      snippet: snippet,
      created_at: row.created_at,
      time_str: row.time_str
    };
  }
  else
  {
    const versionId = row.bible_version || 'tamil';
    const bookNum = Number(row.book_num) || 1;
    const chNum = Number(row.chapter_num) || 1;
    const verseNum = Number(row.verse_num) || 1;

    const versions = getVersionMetadata();
    const ver = versions.find(v => v.id === versionId || v.file === versionId || v.dbFile === versionId);
    const versionName = ver ? ver.name : versionId;
    let bookName = `Book ${bookNum}`;
    if (ver && ver.books && ver.books[bookNum - 1])
    {
      bookName = ver.books[bookNum - 1];
    }

    let snippet = '';
    try
    {
      const db = getBibleDb(versionId);
      if (db)
      {
        const stmt = getBibleVerseStmt(db);
        const verseRow = stmt.get(bookNum, chNum, verseNum);
        if (verseRow && verseRow.word) snippet = verseRow.word;
      }
    }
    catch (e) {}

    return {
      id: row.id,
      item_type: 'bible',
      bible_version: versionId,
      version_name: versionName,
      book_num: bookNum,
      chapter_num: chNum,
      verse_num: verseNum,
      book_name: bookName,
      title: `${bookName} ${chNum}:${verseNum}`,
      reference: `${bookName} ${chNum}:${verseNum}`,
      snippet: snippet,
      created_at: row.created_at,
      time_str: row.time_str
    };
  }
}

app.get('/api/recents', (req, res) =>
{
  try
  {
    const todayRow = recentsDb.prepare("SELECT date('now', 'localtime') as today").get();
    const todayDate = todayRow ? todayRow.today : new Date().toISOString().slice(0, 10);

    let selectedDates = [];

    if (!req.query.before_date)
    {
      // Initial load: Same day (Today) and any previous day that has entries (full day, not limited by count)
      const allDatesStmt = recentsDb.prepare(`
        SELECT DISTINCT date(created_at, 'localtime') as d
        FROM recents
        ORDER BY d DESC
      `);
      const allDates = allDatesStmt.all().map(r => r.d);

      if (allDates.includes(todayDate))
      {
        selectedDates.push(todayDate);
        const prevDate = allDates.find(d => d < todayDate);
        if (prevDate)
        {
          selectedDates.push(prevDate);
        }
      }
      else
      {
        // Today has no entries yet; take the most recent day with entries
        if (allDates.length > 0)
        {
          selectedDates.push(allDates[0]);
        }
      }
    }
    else
    {
      // Load more: accumulate full days before before_date until item count reaches ~100
      const beforeDate = String(req.query.before_date).trim();
      const prevDatesStmt = recentsDb.prepare(`
        SELECT DISTINCT date(created_at, 'localtime') as d
        FROM recents
        WHERE date(created_at, 'localtime') < ?
        ORDER BY d DESC
      `);
      const availableDates = prevDatesStmt.all(beforeDate).map(r => r.d);

      let accumulatedCount = 0;
      const countStmt = recentsDb.prepare("SELECT COUNT(*) as c FROM recents WHERE date(created_at, 'localtime') = ?");

      for (const d of availableDates)
      {
        selectedDates.push(d);
        const countRow = countStmt.get(d);
        accumulatedCount += (countRow ? countRow.c : 0);
        if (accumulatedCount >= 90)
        {
          break; // Stop after completing this full day
        }
      }
    }

    const days = [];
    const getItemsStmt = recentsDb.prepare(`
      SELECT id, item_type, song_id, slide_index, bible_version, book_num, chapter_num, verse_num, created_at,
             time(created_at, 'localtime') as time_str
      FROM recents
      WHERE date(created_at, 'localtime') = ?
      ORDER BY id DESC
    `);

    for (const dateStr of selectedDates)
    {
      const rows = getItemsStmt.all(dateStr);
      const items = rows.map(r => enrichRecentItem(r));
      days.push({
        date: dateStr,
        isToday: (dateStr === todayDate),
        items: items
      });
    }

    let hasMore = false;
    let nextBeforeDate = null;
    if (selectedDates.length > 0)
    {
      const oldestDateInBatch = selectedDates[selectedDates.length - 1];
      const checkOlder = recentsDb.prepare(`
        SELECT 1 FROM recents WHERE date(created_at, 'localtime') < ? LIMIT 1
      `).get(oldestDateInBatch);

      if (checkOlder)
      {
        hasMore = true;
        nextBeforeDate = oldestDateInBatch;
      }
    }

    res.json({
      days,
      hasMore,
      nextBeforeDate,
      todayDate
    });
  }
  catch (err)
  {
    console.error('Error fetching recents:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 6c. Application Settings & Font Mapper API
// ---------------------------------------------------------------------------
app.get('/api/settings', (req, res) =>
{
  try
  {
    const config = loadConfig();
    const versions = getVersionMetadata(true);
    const detectedSongFonts = getDistinctSongFonts();
    res.json({
      config,
      fontMapping: config.fontMapping || { bible: {}, songOverrides: {} },
      bibleVersions: versions.map(v => ({
        id: v.id,
        name: v.name,
        file: v.file,
        defaultFont: v.defaultfont || v.selectedfont || 'Baloo Thambi',
        configuredFont: (config.fontMapping?.bible && config.fontMapping.bible[v.id]) || v.selectedfont || 'Baloo Thambi',
        available: v.available
      })),
      detectedSongFonts
    });
  }
  catch (err)
  {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', (req, res) =>
{
  try
  {
    const { fontMapping } = req.body || {};
    const currentConfig = loadConfig();
    if (fontMapping && typeof fontMapping === 'object')
    {
      currentConfig.fontMapping = {
        bible: (fontMapping.bible && typeof fontMapping.bible === 'object') ? fontMapping.bible : {},
        songOverrides: (fontMapping.songOverrides && typeof fontMapping.songOverrides === 'object') ? fontMapping.songOverrides : {}
      };
    }
    const saved = saveConfig(currentConfig);
    if (!saved)
    {
      return res.status(500).json({ error: 'Failed to write config.json' });
    }
    // Invalidate cached version metadata so updated bible fonts reflect
    cachedVersionMetadata = null;
    res.json({ success: true, config: currentConfig });
  }
  catch (err)
  {
    console.error('Error saving settings:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/fonts/songs-detected', (req, res) =>
{
  try
  {
    const detected = getDistinctSongFonts();
    res.json({ fonts: detected });
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
    if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js') || filePath.endsWith('.json'))
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

// OBS Studio Browser Sources
app.get(['/obs', '/obs/'], (req, res) =>
{
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'obs', 'index.html'));
});

// Experimental 3D Animated Projector Display
app.get(['/animator', '/animator/'], (req, res) =>
{
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'animator', 'index.html'));
});

// Duplicate Songs Remover & Database Quality Suite
app.get(['/cleaner', '/cleaner/'], (req, res) =>
{
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'cleaner', 'index.html'));
});

// Application Settings & Font Mapper
app.get(['/settings', '/settings/'], (req, res) =>
{
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'settings', 'index.html'));
});

app.get(['/obs/1', '/obs1'], (req, res) =>
{
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'obs', '1.html'));
});

app.get(['/obs/2', '/obs2'], (req, res) =>
{
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'obs', '2.html'));
});

app.get(['/obs/3', '/obs3'], (req, res) =>
{
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'obs', '3.html'));
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
  initSongSearchIndex();
  getOrBuildBibleSearchIndex('tamil');
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
