import fs from 'node:fs';
import path from 'node:path';
import { isTamilBibleFont, isKnownBaminiFont, baminiToUnicode } from './bamini.js';

/**
 * Silently creates a timestamped backup of the songs database.
 * Requirement: Keep a copy before dangerous operations, without disclosing to the user.
 */
export function silentBackupSongsDb(dataDir, songsDbFileName = 'songs.db', db = null)
{
  try
  {
    const backupDir = path.join(dataDir, 'backups');
    if (!fs.existsSync(backupDir))
    {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `songs_backup_${timestamp}.db`);
    if (db && typeof db.exec === 'function')
    {
      try
      {
        db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}';`);
        return backupPath;
      }
      catch (vacErr)
      {
        console.warn('VACUUM INTO fallback to file copy:', vacErr.message);
      }
    }
    const sourcePath = path.join(dataDir, songsDbFileName);
    if (fs.existsSync(sourcePath))
    {
      fs.copyFileSync(sourcePath, backupPath);
      return backupPath;
    }
  }
  catch (err)
  {
    console.error('Silent songs database backup error:', err);
  }
  return null;
}

/**
 * Flushes SQLite WAL journals directly into the main database file and vacuums
 * to immediately reclaim disk space and update the .db file on disk for Git/sync.
 */
export function checkpointAndVacuum(db)
{
  try
  {
    if (db && typeof db.exec === 'function')
    {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      db.exec('VACUUM;');
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    }
  }
  catch (err)
  {
    console.warn('checkpointAndVacuum warning:', err.message);
  }
}

/**
 * Normalizes title for comparison
 */
function normalizeTitle(title)
{
  if (!title) return '';
  return String(title)
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes lyrics for content duplicate comparison
 */
function normalizeLyrics(lyrics, font = '')
{
  if (!lyrics) return '';
  let text = String(lyrics);
  // Convert Bamini to Unicode for fair comparison across Bamini & Unicode copies
  if (isTamilBibleFont(font))
  {
    try
    {
      text = baminiToUnicode(text);
    }
    catch
    {
      // fallback to original text
    }
  }
  return text
    .replace(/<[^>]+>/gi, ' ')
    .replace(/[.,;:!?'"’“”\-—_()\[\]{}#$*&^%@~`+=|\\/<>]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getNGrams(str, n = 3)
{
  const set = new Set();
  const s = ' ' + str + ' ';
  for (let i = 0; i <= s.length - n; i++)
  {
    set.add(s.substring(i, i + n));
  }
  return set;
}

function diceCoefficient(setA, setB)
{
  if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
  let matches = 0;
  for (const item of setA)
  {
    if (setB.has(item)) matches++;
  }
  return (2 * matches) / (setA.size + setB.size);
}

function jaccardSimilarity(setA, setB)
{
  if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
  let matches = 0;
  for (const item of setA)
  {
    if (setB.has(item)) matches++;
  }
  const union = setA.size + setB.size - matches;
  return union > 0 ? matches / union : 0;
}

/**
 * Extracts a safe first line preview
 */
function extractLyricsPreview(lyrics, font = '', maxChars = 140)
{
  if (!lyrics) return '';
  let text = String(lyrics);
  if (isTamilBibleFont(font))
  {
    try
    {
      text = baminiToUnicode(text);
    }
    catch
    {
      // ignore
    }
  }
  const clean = text
    .replace(/<slide>/gi, ' ')
    .replace(/<BR>/gi, ' \n ')
    .replace(/<[^>]+>/gi, ' ')
    .trim();
  const firstLines = clean.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 3).join(' / ');
  return firstLines.length > maxChars ? firstLines.substring(0, maxChars) + '...' : firstLines;
}

/**
 * Counts slides in raw lyrics
 */
function getSlideCount(lyrics)
{
  if (!lyrics) return 0;
  const slides = lyrics.split(/<slide>/i).filter(s => s.trim().length > 0);
  return slides.length || 1;
}

/**
 * 1. Find exact duplicate songs (Same Title and Same Content)
 */
export function findExactDuplicates(db)
{
  const rows = db.prepare('SELECT id, name, cat, font, lyrics FROM sm').all();
  const prepared = rows.map(r => ({
    ...r,
    normTitle: normalizeTitle(r.name),
    normContent: normalizeLyrics(r.lyrics, r.font),
    ngrams: getNGrams(normalizeLyrics(r.lyrics, r.font), 3)
  }));

  const map = new Map();

  for (const r of prepared)
  {
    if (!r.normTitle && !r.normContent) continue;
    const key = r.normTitle + '|||' + r.normContent;
    if (!map.has(key))
    {
      map.set(key, []);
    }
    map.get(key).push(r);
  }

  // Also cluster items where title is identical and content is >= 97% identical
  const titleGroups = new Map();
  for (const r of prepared)
  {
    if (!r.normTitle || r.normContent.length < 15) continue;
    if (!titleGroups.has(r.normTitle)) titleGroups.set(r.normTitle, []);
    titleGroups.get(r.normTitle).push(r);
  }

  for (const [title, list] of titleGroups.entries())
  {
    if (list.length > 1)
    {
      for (let i = 0; i < list.length; i++)
      {
        for (let j = i + 1; j < list.length; j++)
        {
          const a = list[i], b = list[j];
          const keyA = a.normTitle + '|||' + a.normContent;
          const keyB = b.normTitle + '|||' + b.normContent;
          if (keyA !== keyB)
          {
            const sim = diceCoefficient(a.ngrams, b.ngrams);
            if (sim >= 0.97)
            {
              // Merge group B into group A
              const grpB = map.get(keyB);
              if (grpB && grpB.length > 0)
              {
                if (!map.has(keyA)) map.set(keyA, []);
                const grpA = map.get(keyA);
                for (const item of grpB)
                {
                  if (!grpA.some(x => x.id === item.id)) grpA.push(item);
                }
                map.delete(keyB);
              }
            }
          }
        }
      }
    }
  }

  const duplicateGroups = [];
  let totalDuplicateSongs = 0;

  for (const [key, group] of map.entries())
  {
    if (group.length > 1)
    {
      // Sort oldest ID first (usually the primary record)
      group.sort((a, b) => a.id - b.id);
      const keeper = group[0];
      const dupes = group.slice(1);
      totalDuplicateSongs += dupes.length;

      duplicateGroups.push({
        groupId: `exact-${keeper.id}`,
        title: keeper.name || 'Untitled',
        normalizedTitle: normalizeTitle(keeper.name),
        category: keeper.cat || 'General',
        totalCopies: group.length,
        duplicateCount: dupes.length,
        preview: extractLyricsPreview(keeper.lyrics, keeper.font),
        songs: group.map((s, idx) => ({
          id: s.id,
          name: s.name || '',
          cat: s.cat || 'General',
          font: s.font || '',
          slideCount: getSlideCount(s.lyrics),
          preview: extractLyricsPreview(s.lyrics, s.font),
          isSuggestedKeeper: idx === 0,
          rawLyrics: s.lyrics || ''
        }))
      });
    }
  }

  // Sort groups alphabetically by title
  duplicateGroups.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));

  return {
    groups: duplicateGroups,
    totalGroups: duplicateGroups.length,
    totalDuplicateSongs
  };
}

/**
 * 2. Find duplicate songs with DIFFERENT titles (Same Content, Different Title)
 */
export function findDifferentTitleDuplicates(db)
{
  const rows = db.prepare('SELECT id, name, cat, font, lyrics FROM sm').all();
  const prepared = rows.map(r => ({
    ...r,
    normTitle: normalizeTitle(r.name),
    normContent: normalizeLyrics(r.lyrics, r.font),
    ngrams: getNGrams(normalizeLyrics(r.lyrics, r.font), 3)
  }));

  const map = new Map();

  for (const r of prepared)
  {
    // Only match songs with meaningful length to avoid blank songs colliding
    if (r.normContent.length < 15) continue;

    if (!map.has(r.normContent))
    {
      map.set(r.normContent, []);
    }
    map.get(r.normContent).push(r);
  }

  const groups = [];
  let totalDuplicateSongs = 0;

  for (const [contentKey, songList] of map.entries())
  {
    if (songList.length > 1)
    {
      // Check if titles are actually different
      const titles = new Set(songList.map(s => s.normTitle));
      if (titles.size > 1)
      {
        songList.sort((a, b) => a.id - b.id);
        totalDuplicateSongs += (songList.length - 1);

        groups.push({
          groupId: `diff-${songList[0].id}`,
          contentPreview: extractLyricsPreview(songList[0].lyrics, songList[0].font),
          totalCopies: songList.length,
          duplicateCount: songList.length - 1,
          titlesList: Array.from(new Set(songList.map(s => s.name || 'Untitled'))),
          songs: songList.map((s, idx) => ({
            id: s.id,
            name: s.name || 'Untitled',
            cat: s.cat || 'General',
            font: s.font || '',
            slideCount: getSlideCount(s.lyrics),
            preview: extractLyricsPreview(s.lyrics, s.font),
            isSuggestedKeeper: idx === 0,
            rawLyrics: s.lyrics || ''
          }))
        });
      }
    }
  }

  groups.sort((a, b) => b.totalCopies - a.totalCopies);

  return {
    groups,
    totalGroups: groups.length,
    totalDuplicateSongs
  };
}

/**
 * 3. Find near-duplicate songs (Content more or less same, similarity >= 70%)
 */
export function findSimilarDuplicates(db, minSimilarity = 70)
{
  const rows = db.prepare('SELECT id, name, cat, font, lyrics FROM sm').all();

  const preparedSongs = [];
  for (const r of rows)
  {
    const clean = normalizeLyrics(r.lyrics, r.font);
    const words = clean.split(/\s+/).filter(w => w.length >= 2);
    if (words.length < 4) continue; // Skip very short items
    preparedSongs.push({
      id: r.id,
      name: r.name || 'Untitled',
      cat: r.cat || 'General',
      font: r.font || '',
      slideCount: getSlideCount(r.lyrics),
      normTitle: normalizeTitle(r.name),
      cleanLen: clean.length,
      wordsCount: words.length,
      wordSet: new Set(words),
      ngrams: getNGrams(clean, 3),
      preview: extractLyricsPreview(r.lyrics, r.font),
      rawLyrics: r.lyrics || ''
    });
  }

  // Inverted indexes for fast candidate pair discovery
  const wordIndex = new Map();
  const titleIndex = new Map();

  preparedSongs.forEach((s, idx) =>
  {
    if (s.normTitle)
    {
      if (!titleIndex.has(s.normTitle)) titleIndex.set(s.normTitle, []);
      titleIndex.get(s.normTitle).push(idx);
    }
    for (const w of s.wordSet)
    {
      if (w.length < 3) continue;
      if (!wordIndex.has(w)) wordIndex.set(w, []);
      wordIndex.get(w).push(idx);
    }
  });

  const candidatePairs = new Map();

  // 1. Same normalized title candidates
  for (const [title, list] of titleIndex.entries())
  {
    if (list.length > 1)
    {
      for (let i = 0; i < list.length; i++)
      {
        for (let j = i + 1; j < list.length; j++)
        {
          const a = list[i], b = list[j];
          const key = a < b ? `${a}-${b}` : `${b}-${a}`;
          candidatePairs.set(key, 100);
        }
      }
    }
  }

  // 2. Word overlap candidates
  for (const [w, list] of wordIndex.entries())
  {
    if (list.length > 400 || list.length < 2) continue; // Skip ultra-frequent stop words
    for (let i = 0; i < list.length; i++)
    {
      const idxA = list[i];
      const sA = preparedSongs[idxA];
      for (let j = i + 1; j < list.length; j++)
      {
        const idxB = list[j];
        const sB = preparedSongs[idxB];
        
        // Length ratio prune
        const lenRatio = Math.min(sA.cleanLen, sB.cleanLen) / Math.max(sA.cleanLen, sB.cleanLen || 1);
        if (lenRatio < 0.40) continue;

        const key = idxA < idxB ? `${idxA}-${idxB}` : `${idxB}-${idxA}`;
        candidatePairs.set(key, (candidatePairs.get(key) || 0) + 1);
      }
    }
  }

  const pairs = [];
  for (const [pairKey, sharedCount] of candidatePairs.entries())
  {
    if (sharedCount < 3 && sharedCount !== 100) continue;
    const [idxA, idxB] = pairKey.split('-').map(Number);
    const sA = preparedSongs[idxA];
    const sB = preparedSongs[idxB];

    const wordJac = jaccardSimilarity(sA.wordSet, sB.wordSet);
    const charDice = diceCoefficient(sA.ngrams, sB.ngrams);
    const similarityPercent = Math.round(Math.max(wordJac, charDice) * 100);

    // Filter by threshold - includes anything >= minSimilarity up to 100%
    if (similarityPercent >= minSimilarity)
    {
      pairs.push({
        pairId: `sim-${Math.min(sA.id, sB.id)}-${Math.max(sA.id, sB.id)}`,
        similarity: similarityPercent,
        songA: {
          id: sA.id,
          name: sA.name,
          cat: sA.cat,
          font: sA.font,
          slideCount: sA.slideCount,
          preview: sA.preview,
          rawLyrics: sA.rawLyrics
        },
        songB: {
          id: sB.id,
          name: sB.name,
          cat: sB.cat,
          font: sB.font,
          slideCount: sB.slideCount,
          preview: sB.preview,
          rawLyrics: sB.rawLyrics
        }
      });
    }
  }

  // Sort highest similarity first
  pairs.sort((a, b) => b.similarity - a.similarity);

  return {
    pairs,
    totalPairs: pairs.length
  };
}

const ENGLISH_WORDS_SET = new Set([
  'the', 'and', 'that', 'have', 'for', 'not', 'with', 'you', 'this', 'but',
  'his', 'from', 'they', 'say', 'her', 'she', 'will', 'one', 'all', 'would',
  'there', 'their', 'what', 'out', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
  'people', 'into', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
  'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
  'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
  'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
  'lord', 'god', 'jesus', 'christ', 'holy', 'spirit', 'love', 'father', 'praise',
  'worship', 'glory', 'grace', 'peace', 'cross', 'heart', 'king', 'amen',
  'hallelujah', 'church', 'heaven', 'earth', 'blood', 'life', 'light', 'world',
  'soul', 'name', 'bless', 'savior', 'prayer', 'shall', 'unto', 'thee', 'thou',
  'thy', 'ever', 'forever', 'sing', 'mercy', 'great', 'worthy', 'born', 'children',
  'child', 'behold', 'believe', 'perish', 'eternal', 'son', 'lamb'
]);

function isEnglishSong(name, lyrics, cat)
{
  const normCat = (cat || '').toLowerCase().trim();
  if (['english', 'western', 'sunday school', 'english songs', 'hymns', 'choruses'].includes(normCat))
  {
    if (!/[\u0B80-\u0BFF]/.test(lyrics)) return true;
  }
  const clean = (name + ' ' + lyrics).toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z]+/g, ' ');
  const tokens = clean.split(/\s+/).filter(Boolean);
  let engCount = 0;
  const foundWords = new Set();
  for (const t of tokens)
  {
    if (ENGLISH_WORDS_SET.has(t))
    {
      foundWords.add(t);
      engCount++;
    }
  }
  return foundWords.size >= 3 || (tokens.length > 5 && engCount / tokens.length > 0.25);
}

/**
 * Detects if an individual slide contains Bamini keystroke patterns
 */
export function detectBaminiInSlide(slideText)
{
  if (!slideText || typeof slideText !== 'string') return null;
  const text = slideText.replace(/<[^>]+>/g, ' ');
  
  // High-confidence Bamini patterns:
  // 1. Virama followed by letter: j;J, d;w, k;k, h;f, s;s, etc. (never occurs in English or transliteration)
  const viramaInside = text.match(/[a-zA-Z];[a-zA-Z]/g) || [];
  // 2. Capital N followed by consonant: Nf, Nj, Np, Ns, Nw, Nl, Njh, etc.
  const capitalNKombu = text.match(/N[fqrslzjtdgpmvwk]/g) || [];
  // 3. Bamini signature words & roots
  const baminiSignatures = text.match(/(?:Mde;j|vd;Wk|Njtd|Muhjpf|jUfp|khf|ghL|fhj|moa|mst|ntnd|bka|cs;s|ghly|n\$hjp|vy;i|Jjp|ck;|,NaR|ek;|fh;j;j|NfuPj;|ghtpahd|ePl;bdhh;|cah;j;jpdhh;)/g) || [];
  // 4. Typical Bamini pullis
  const pullis = text.match(/[kfrjgsyhtblzdmvwqpn];/g) || [];

  if (viramaInside.length >= 1 && (capitalNKombu.length >= 1 || pullis.length >= 2 || baminiSignatures.length >= 1))
  {
    return viramaInside[0];
  }
  if (capitalNKombu.length >= 2 && pullis.length >= 2)
  {
    return capitalNKombu[0];
  }
  if (baminiSignatures.length >= 1 && (pullis.length >= 2 || capitalNKombu.length >= 1 || viramaInside.length >= 1))
  {
    return baminiSignatures[0];
  }
  if (pullis.length >= 4 && (capitalNKombu.length >= 1 || viramaInside.length >= 1))
  {
    return pullis[0];
  }
  return null;
}

/**
 * Checks if any slide in the song has Bamini keystroke patterns
 */
export function hasBaminiContentInAnySlide(lyrics, name = '', cat = '')
{
  if (!lyrics) return false;
  if (isEnglishSong(name, lyrics, cat)) return false;
  const slides = lyrics.split(/<slide>/i);
  return slides.some(slide => detectBaminiInSlide(slide) !== null);
}

export function getBaminiSnippetInSong(lyrics, name = '', cat = '')
{
  if (!lyrics) return null;
  if (isEnglishSong(name, lyrics, cat)) return null;
  const slides = lyrics.split(/<slide>/i);
  for (const slide of slides)
  {
    const snip = detectBaminiInSlide(slide);
    if (snip) return snip;
  }
  return null;
}

/**
 * 4. Analyze Songs for Errors: mixed fonts, font name discrepancies, diacritics, language typos, slide structure
 */
export function analyzeSongErrors(db)
{
  const rows = db.prepare('SELECT id, name, cat, font, font2, lyrics FROM sm').all();

  const tamilUnicodeRegex = /[\u0B80-\u0BFF]/;

  const errorSongs = [];
  const counts = {
    fontMismatch: 0,
    fontNameIssue: 0,
    typographyTypo: 0,
    slideStructure: 0,
    mixedLanguage: 0,
    totalErrors: 0
  };

  for (const r of rows)
  {
    const id = r.id;
    const name = (r.name || '').trim();
    const font = (r.font || '').trim();
    const lyrics = r.lyrics || '';
    const isTB = isTamilBibleFont(font);
    const isKnownBamini = isKnownBaminiFont(font);
    const hasUnicode = tamilUnicodeRegex.test(lyrics);
    const isBaloo = font.toLowerCase().includes('baloo');
    const hasBaminiInContent = hasBaminiContentInAnySlide(lyrics, name, r.cat);
    const isEng = isEnglishSong(name, lyrics, r.cat);
    const issues = [];

    // Issue A: Font Mismatch & Font Assignment Errors
    if (isTB)
    {
      // 1. Marked as Tamil Bible (Bamini), but contains Unicode Tamil characters
      if (hasUnicode)
      {
        issues.push({
          category: 'fontMismatch',
          severity: 'error',
          code: 'TB_WITH_UNICODE',
          title: 'Mixed Font: Unicode Tamil inside Tamil Bible Font',
          description: 'Song is configured with Tamil Bible font (Bamini), but lyrics contain raw Unicode Tamil characters.',
          snippet: lyrics.match(/[\u0B80-\u0BFF]+/)?.[0] || ''
        });
        counts.fontMismatch++;
      }

      // 1b. Bamini lyrics cannot contain English words (Bamini font maps Latin letters to Tamil glyphs, causing garbled text)
      // Note: Bamini song title CAN be fully English, only lyrics are checked.
      const englishWordMatch = lyrics.replace(/<[^>]+>/g, ' ').match(/\b(Jesus|Lord|God|Praise|Hallelujah|Glory|Amen|Holy|Father|Spirit|Christ|King|Love|Grace|Worship|Church|Chorus|Verse)\b/i);
      if (englishWordMatch)
      {
        issues.push({
          category: 'mixedLanguage',
          severity: 'warning',
          code: 'BAMINI_WITH_ENGLISH_WORDS',
          title: 'English Word in Bamini Lyrics',
          description: `Bamini lyrics cannot contain English words ("${englishWordMatch[0]}"), as Bamini font renders Latin letters as Tamil glyphs.`,
          snippet: englishWordMatch[0]
        });
        counts.mixedLanguage++;
      }
    }
    else if (isBaloo || (hasUnicode && !isKnownBamini))
    {
      // 2. Unicode Tamil / Baloo Thambi songs: English and numbers are allowed, but CANNOT contain Bamini!
      const embeddedBaminiRegex = /([a-zA-Z];|N[fqrslzjtdgpmvwk]|(?:Mde;j|vd;Wk|Njtd|Muhjpf|jUfp|khf|ghL|fhj|moa|mst|ntnd|bka|cs;s|ghly|n\$hjp|vy;i|Jjp|ck;|,NaR|ek;|fh;j;j|NfuPj;|ghtpahd|ePl;bdhh;|cah;j;jpdhh;))/;
      const embeddedMatch = lyrics.match(embeddedBaminiRegex);
      if (hasBaminiInContent || embeddedMatch)
      {
        const snippet = (hasBaminiInContent ? getBaminiSnippetInSong(lyrics, name, r.cat) : null) || embeddedMatch?.[0] || '';
        issues.push({
          category: 'fontMismatch',
          severity: 'error',
          code: 'BALOO_WITH_BAMINI',
          title: 'Bamini Keystrokes in Unicode / Baloo Thambi Song',
          description: 'Song is configured as Unicode / Baloo Thambi, but contains Bamini keystroke encoding or Bamini slides. Unicode / Baloo Thambi songs cannot contain Bamini.',
          snippet
        });
        counts.fontMismatch++;
      }
    }
    else if (isKnownBamini || hasBaminiInContent)
    {
      // 3. Pure Bamini song with non-standard font (e.g. Tamil-Ananthi or empty) -> Needs font changed to "Tamil Bible"
      const snippet = (hasBaminiInContent ? getBaminiSnippetInSong(lyrics, name, r.cat) : null) || lyrics.match(/[a-zA-Z;\[\]\\#\$%]{3,}/)?.[0] || '';
      issues.push({
        category: 'fontMismatch',
        severity: 'error',
        code: 'BAMINI_NEEDS_TAMIL_BIBLE',
        title: 'Bamini Encoding: Font Needs to be Changed to "Tamil Bible"',
        description: `Song contains Bamini keystroke encoding in its slides (current font: "${font || 'None'}"). The font declaration needs to be changed to "Tamil Bible" for standard VerseView support (or converted to Unicode Baloo Thambi).`,
        snippet,
        suggestedFont: 'Tamil Bible'
      });
      counts.fontMismatch++;
    }
    else if (!isEng && !hasUnicode)
    {
      const pulliMatches = lyrics.match(/[kfrjgsyhtblzdmvwqpn];/g);
      if (pulliMatches && pulliMatches.length >= 6)
      {
        issues.push({
          category: 'fontMismatch',
          severity: 'warning',
          code: 'UNICODE_WITH_BAMINI',
          title: 'Unrecognized ASCII Glyphs in Non-Bamini Font',
          description: `Song is marked with font "${font || 'None'}", but lyrics contain unrecognized ASCII sequences.`,
          snippet: pulliMatches[0]
        });
        counts.fontMismatch++;
      }
    }

    // Issue B: Font Name Issues
    if (!font)
    {
      issues.push({
        category: 'fontNameIssue',
        severity: 'warning',
        code: 'EMPTY_FONT',
        title: 'Missing Font Declaration',
        description: 'The font field is empty or undefined for this song.'
      });
      counts.fontNameIssue++;
    }
    else if (['AnjaliOldLipi'].includes(font))
    {
      issues.push({
        category: 'fontNameIssue',
        severity: 'info',
        code: 'LEGACY_FONT_NAME',
        title: 'Legacy Non-Standard Font',
        description: `Song uses legacy font name "${font}" which may not display properly on all client displays.`
      });
      counts.fontNameIssue++;
    }

    // Issue D: Typography & Diacritic Errors in Tamil
    // Consecutive virama / pulli: e.g. க்்
    if (/[\u0BCD]{2,}/.test(lyrics))
    {
      issues.push({
        category: 'typographyTypo',
        severity: 'warning',
        code: 'DOUBLE_VIRAMA',
        title: 'Double Pulli (Virama) Typo',
        description: 'Consecutive virama marks found in Unicode Tamil text.',
        snippet: lyrics.match(/[\u0B80-\u0BFF]?[\u0BCD]{2,}/)?.[0] || ''
      });
      counts.typographyTypo++;
    }

    // Isolated pulli or combining vowel sign at start of line/word with no base consonant
    const isolatedSign = lyrics.match(/(?:^|[\s\p{P}])[\u0BBE-\u0BCD]/u);
    if (isolatedSign)
    {
      issues.push({
        category: 'typographyTypo',
        severity: 'warning',
        code: 'ISOLATED_COMBINING_SIGN',
        title: 'Isolated Vowel Sign / Pulli Typo',
        description: 'Found combining sign or virama with no preceding consonant.',
        snippet: isolatedSign[0]
      });
      counts.typographyTypo++;
    }

    // Orphaned Bamini kombu at end of word or line
    if (isTB && /(?:^|\s)[nNiI][\s.,!?:;\"'()\-<]/.test(lyrics))
    {
      issues.push({
        category: 'typographyTypo',
        severity: 'warning',
        code: 'ORPHAN_BAMINI_KOMBU',
        title: 'Orphaned Bamini Kombu Glyph',
        description: 'Bamini kombu keystroke (n, N, or i) appears isolated without a base consonant.',
        snippet: lyrics.match(/(?:^|\s)[nNiI][\s.,!?:;\"'()\-<]/)?.[0] || ''
      });
      counts.typographyTypo++;
    }

    // Repeated double punctuation typos like ";;" or "??"
    const punctTypo = lyrics.match(/([;,\.\?\!]){2,}/);
    if (punctTypo && !lyrics.includes('...'))
    {
      issues.push({
        category: 'typographyTypo',
        severity: 'info',
        code: 'PUNCTUATION_TYPO',
        title: 'Repeated Punctuation Mark Typo',
        description: 'Unusual doubled punctuation detected.',
        snippet: punctTypo[0]
      });
      counts.typographyTypo++;
    }

    // Issue E: Slide Structure & Formatting Errors
    if (!name)
    {
      issues.push({
        category: 'slideStructure',
        severity: 'error',
        code: 'EMPTY_TITLE',
        title: 'Missing Song Title',
        description: 'Song does not have a title defined in the database.'
      });
      counts.slideStructure++;
    }

    if (!lyrics.trim())
    {
      issues.push({
        category: 'slideStructure',
        severity: 'error',
        code: 'EMPTY_LYRICS',
        title: 'Empty Song Lyrics',
        description: 'Song record exists but has no lyrics content.'
      });
      counts.slideStructure++;
    }
    else if (!lyrics.includes('<slide>'))
    {
      issues.push({
        category: 'slideStructure',
        severity: 'warning',
        code: 'NO_SLIDE_TAGS',
        title: 'No <slide> Separators',
        description: 'Song contains lyrics but does not use <slide> tags to paginate verses.'
      });
      counts.slideStructure++;
    }

    if (/<slide>\s*<slide>/i.test(lyrics))
    {
      issues.push({
        category: 'slideStructure',
        severity: 'warning',
        code: 'EMPTY_SLIDE_TAG',
        title: 'Consecutive Empty Slide Delimiters',
        description: 'Contains consecutive <slide><slide> tags creating blank slides on screen.'
      });
      counts.slideStructure++;
    }

    if (issues.length > 0)
    {
      counts.totalErrors += issues.length;
      errorSongs.push({
        id,
        name: name || 'Untitled',
        cat: r.cat || 'General',
        font,
        slideCount: getSlideCount(lyrics),
        preview: extractLyricsPreview(lyrics, font),
        rawLyrics: lyrics,
        issues
      });
    }
  }

  return {
    songs: errorSongs,
    counts,
    totalSongsWithErrors: errorSongs.length
  };
}

/**
 * 5. Analyze Bamini Songs for Unicode Conversion (Clean vs Songs Needing Review)
 */
export function analyzeBaminiConversion(db)
{
  const rows = db.prepare('SELECT id, name, cat, font, lyrics FROM sm').all();

  const cleanSongs = [];
  const suspiciousSongs = [];

  for (const r of rows)
  {
    if (!isTamilBibleFont(r.font) && !isKnownBaminiFont(r.font) && !hasBaminiContentInAnySlide(r.lyrics, r.name, r.cat)) continue;

    const lyrics = r.lyrics || '';
    const reasons = [];

    // Check 1: Mixed or Already Unicode Tamil inside Bamini font declaration
    const hasUnicode = /[\u0B80-\u0BFF]/.test(lyrics);
    const pulliMatches = lyrics.match(/[kfrjgsyhtblzdmvwqpn];/g);
    const hasBaminiKeystrokes = Boolean(pulliMatches && pulliMatches.length > 0);
    const isAlready100PercentUnicode = hasUnicode && !hasBaminiKeystrokes;

    if (isAlready100PercentUnicode)
    {
      reasons.push(`Already 100% Unicode Tamil (Font is set to "${r.font || 'Tamil Bible'}" by mistake)`);
    }
    else if (hasUnicode && hasBaminiKeystrokes)
    {
      reasons.push('Contains mixed text: both Bamini keystrokes and Unicode Tamil');
    }

    // Check 2: English labels that would get garbled if converted through Bamini
    const englishWords = lyrics.match(/\b(Chorus|Verse|Bridge|Intro|Outro|Amen|Ending|Refrain|Scale|Key|Tempo)\b/i);
    if (englishWords && !isAlready100PercentUnicode)
    {
      reasons.push(`Contains English label "${englishWords[0]}" which may need manual adjustment`);
    }

    // Check 3: Orphaned kombu or hanging symbols
    if (!isAlready100PercentUnicode && /(?:^|\s)[nNiI][\s.,!?:;\"'()\-<]/.test(lyrics))
    {
      reasons.push('Orphaned kombu or incomplete Bamini glyph keystroke');
    }

    // Check 4: Double virama in converted preview
    let convertedLyrics = '';
    if (isAlready100PercentUnicode)
    {
      convertedLyrics = lyrics;
    }
    else
    {
      try
      {
        convertedLyrics = baminiToUnicode(lyrics);
        if (/[\u0BCD]{2,}/.test(convertedLyrics))
        {
          reasons.push('Double pulli (virama) detected in converted Unicode output');
        }
        if (/(?:^|[\s\p{P}])[\u0BBE-\u0BCD]/u.test(convertedLyrics))
        {
          reasons.push('Isolated vowel sign with no base consonant in converted output');
        }
      }
      catch (err)
      {
        reasons.push(`Conversion parse exception: ${err.message}`);
      }
    }

    const slideCount = getSlideCount(lyrics);
    const rawSlides = lyrics.split(/<slide>/i).filter(s => s.trim().length > 0);
    const convertedSlides = (convertedLyrics || lyrics).split(/<slide>/i).filter(s => s.trim().length > 0);

    const slidesDiff = [];
    const maxSlides = Math.max(rawSlides.length, convertedSlides.length);
    for (let i = 0; i < maxSlides; i++)
    {
      slidesDiff.push({
        slideNum: i + 1,
        before: rawSlides[i] || '',
        after: convertedSlides[i] || ''
      });
    }

    if (reasons.length === 0)
    {
      cleanSongs.push({
        id: r.id,
        name: r.name || 'Untitled',
        cat: r.cat || 'General',
        font: r.font || '',
        slideCount,
        preview: extractLyricsPreview(convertedLyrics || lyrics),
        rawLyrics: lyrics,
        convertedLyrics
      });
    }
    else
    {
      suspiciousSongs.push({
        id: r.id,
        name: r.name || 'Untitled',
        cat: r.cat || 'General',
        font: r.font || '',
        slideCount,
        reasons,
        rawLyrics: lyrics,
        convertedLyrics,
        slidesDiff
      });
    }
  }

  return {
    totalBaminiSongs: cleanSongs.length + suspiciousSongs.length,
    cleanCount: cleanSongs.length,
    suspiciousCount: suspiciousSongs.length,
    cleanSongs,
    suspiciousSongs
  };
}

/**
 * Mass convert all clean songs without typos
 */
export function massConvertCleanBamini(db, dataDir, songsDbFileName = 'songs.db', targetFont = 'Baloo Thambi')
{
  silentBackupSongsDb(dataDir, songsDbFileName, db);

  const analysis = analyzeBaminiConversion(db);
  const cleanList = analysis.cleanSongs;

  if (cleanList.length === 0)
  {
    return { success: true, convertedCount: 0, message: 'No clean songs to convert' };
  }

  const updateStmt = db.prepare('UPDATE sm SET lyrics = ?, font = ? WHERE id = ?');
  let convertedCount = 0;

  db.exec('BEGIN TRANSACTION;');
  try
  {
    for (const song of cleanList)
    {
      const converted = song.convertedLyrics || baminiToUnicode(song.rawLyrics);
      updateStmt.run(converted, targetFont, song.id);
      convertedCount++;
    }
    db.exec('COMMIT;');
    checkpointAndVacuum(db);
  }
  catch (err)
  {
    db.exec('ROLLBACK;');
    throw err;
  }

  return {
    success: true,
    convertedCount,
    remainingSuspicious: analysis.suspiciousCount
  };
}

/**
 * Convert a single song after individual review
 */
export function convertSingleBamini(db, dataDir, songsDbFileName = 'songs.db', songId, updatedLyrics = null, targetFont = 'Baloo Thambi')
{
  silentBackupSongsDb(dataDir, songsDbFileName, db);

  const row = db.prepare('SELECT id, lyrics, font FROM sm WHERE id = ?').get(songId);
  if (!row)
  {
    throw new Error('Song not found');
  }

  const finalLyrics = updatedLyrics !== null ? updatedLyrics : baminiToUnicode(row.lyrics);
  const updateStmt = db.prepare('UPDATE sm SET lyrics = ?, font = ? WHERE id = ?');
  updateStmt.run(finalLyrics, targetFont, songId);
  checkpointAndVacuum(db);

  return {
    success: true,
    songId,
    newFont: targetFont
  };
}

/**
 * Delete a batch of songs permanently
 */
export function deleteSongsBatch(db, dataDir, songsDbFileName = 'songs.db', songIds = [])
{
  if (!Array.isArray(songIds) || songIds.length === 0)
  {
    return { success: true, deletedCount: 0 };
  }

  // Silent backup before deletion
  silentBackupSongsDb(dataDir, songsDbFileName, db);

  const deleteStmt = db.prepare('DELETE FROM sm WHERE id = ?');
  let deletedCount = 0;

  db.exec('BEGIN TRANSACTION;');
  try
  {
    for (const id of songIds)
    {
      const numericId = Number(id);
      if (!isNaN(numericId) && numericId > 0)
      {
        deleteStmt.run(numericId);
        deletedCount++;
      }
    }
    db.exec('COMMIT;');
    checkpointAndVacuum(db);
  }
  catch (err)
  {
    db.exec('ROLLBACK;');
    throw err;
  }

  return {
    success: true,
    deletedCount
  };
}

/**
 * Batch updates songs needing Tamil Bible font declaration
 */
export function batchAssignTamilBibleFont(db, dataDir, songsDbFileName = 'songs.db', songIds = null)
{
  silentBackupSongsDb(dataDir, songsDbFileName, db);

  let targetIds = songIds;
  if (!targetIds || !Array.isArray(targetIds) || targetIds.length === 0)
  {
    // Auto-detect all songs with Bamini encoding whose font is not "Tamil Bible"
    const rows = db.prepare('SELECT id, name, cat, font, lyrics FROM sm').all();
    targetIds = [];
    for (const r of rows)
    {
      const f = (r.font || '').trim().toLowerCase();
      if (f === 'tamil bible') continue;
      if (isKnownBaminiFont(r.font) || hasBaminiContentInAnySlide(r.lyrics, r.name, r.cat))
      {
        targetIds.push(r.id);
      }
    }
  }

  if (targetIds.length === 0)
  {
    return { success: true, updatedCount: 0, message: 'No songs requiring Tamil Bible font update' };
  }

  const updateStmt = db.prepare('UPDATE sm SET font = ? WHERE id = ?');
  let updatedCount = 0;

  db.exec('BEGIN TRANSACTION;');
  try
  {
    for (const id of targetIds)
    {
      updateStmt.run('Tamil Bible', id);
      updatedCount++;
    }
    db.exec('COMMIT;');
    checkpointAndVacuum(db);
  }
  catch (err)
  {
    db.exec('ROLLBACK;');
    throw err;
  }

  return {
    success: true,
    updatedCount,
    updatedIds: targetIds
  };
}
