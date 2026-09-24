import { parentPort } from 'node:worker_threads';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  tokenizeText,
  buildTargetTokenInfos,
  compileQueryPattern,
  matchFlatTokenRange
} from '../public/presenter/js/tamilPhonetic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');

// Single Active In-Memory Bible Search Index (Flat Columnar SoA Structure)
let activeBibleIndex = null;

function getVersionMetadata()
{
  try
  {
    const vPath = path.join(dataDir, 'version.json');
    if (!fs.existsSync(vPath)) return [];
    const content = fs.readFileSync(vPath, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : (parsed.version || parsed.versions || []);
  }
  catch (err)
  {
    return [];
  }
}

function getBibleDb(versionId)
{
  const targetId = versionId.replace(/\.db$/i, '').trim();
  const dbFile = `${targetId}.db`;
  const fullPath = path.join(dataDir, dbFile);
  if (!fs.existsSync(fullPath)) return null;
  return new DatabaseSync(fullPath, { readOnly: true });
}

function getOrBuildIndex(versionId = 'tamil')
{
  const targetId = versionId.replace(/\.db$/i, '').trim();
  const versions = getVersionMetadata();
  const matchedVer = versions.find(v => v.id === targetId || v.file === targetId || v.file === `${targetId}.db`);
  const actualVersionId = matchedVer ? (matchedVer.id || targetId) : targetId;

  // Return already active index if matched
  if (activeBibleIndex && activeBibleIndex.versionId === actualVersionId)
  {
    return activeBibleIndex;
  }

  // Clear previous version index immediately to reclaim RAM before building new one
  activeBibleIndex = null;

  const db = getBibleDb(actualVersionId);
  if (!db) return null;

  try
  {
    const rows = db.prepare('SELECT wordId, bookNum, chNum, verseNum, word FROM words ORDER BY bookNum, chNum, verseNum').all();
    const count = rows.length;
    if (count === 0) return null;

    const bookNames = (matchedVer && (matchedVer.booknames || matchedVer.books)) || [];

    // Contiguous C-level typed arrays for coordinates (Zero JS Object Overhead)
    const bookNums = new Uint8Array(count);
    const chNums = new Uint8Array(count);
    const verseNums = new Uint8Array(count);
    const wordIds = new Uint32Array(count);
    const verseTexts = new Array(count);

    // Detect if version contains Tamil script
    const sampleWord = rows[0]?.word || '';
    const isTamil = actualVersionId === 'tamil' || actualVersionId === 'municode' || /[\u0B80-\u0BFF]/.test(sampleWord);

    let verseOffsets = null;
    let tokenInfosFullKey = null;
    let tokenInfosStripKey = null;

    if (isTamil)
    {
      verseOffsets = new Uint32Array(count + 1);
      tokenInfosFullKey = [];
      tokenInfosStripKey = [];
      let currentWordOffset = 0;

      for (let i = 0; i < count; i++)
      {
        const r = rows[i];
        bookNums[i] = Number(r.bookNum) || 1;
        chNums[i] = Number(r.chNum) || 1;
        verseNums[i] = Number(r.verseNum) || 1;
        wordIds[i] = Number(r.wordId) || (i + 1);
        const wStr = r.word || '';
        verseTexts[i] = wStr;
        verseOffsets[i] = currentWordOffset;

        const tokens = tokenizeText(wStr);
        const tInfos = buildTargetTokenInfos(tokens);
        for (let j = 0; j < tInfos.length; j++)
        {
          tokenInfosFullKey.push(tInfos[j].fullKey || '');
          tokenInfosStripKey.push(tInfos[j].strippedKey || null);
        }
        currentWordOffset += tInfos.length;
      }
      verseOffsets[count] = currentWordOffset;
    }
    else
    {
      // Non-Tamil versions (English, etc.) - Lightweight plain text array
      for (let i = 0; i < count; i++)
      {
        const r = rows[i];
        bookNums[i] = Number(r.bookNum) || 1;
        chNums[i] = Number(r.chNum) || 1;
        verseNums[i] = Number(r.verseNum) || 1;
        wordIds[i] = Number(r.wordId) || (i + 1);
        verseTexts[i] = r.word || '';
      }
    }

    activeBibleIndex = {
      versionId: actualVersionId,
      isTamil,
      count,
      bookNames,
      bookNums,
      chNums,
      verseNums,
      wordIds,
      verseTexts,
      verseOffsets,
      tokenInfosFullKey,
      tokenInfosStripKey
    };

    return activeBibleIndex;
  }
  catch (err)
  {
    console.error(`[searchWorker] Failed to index Bible version ${actualVersionId}:`, err);
    return null;
  }
}

// Auto pre-warm default Tamil Bible on worker startup
try
{
  getOrBuildIndex('tamil');
}
catch (e)
{
  console.warn('[searchWorker] Pre-warm failed:', e);
}

if (parentPort)
{
  parentPort.on('message', (msg) =>
  {
    if (!msg || typeof msg !== 'object') return;
    const { id, type } = msg;

    if (type === 'prewarm')
    {
      const versionId = msg.versionId || 'tamil';
      getOrBuildIndex(versionId);
      parentPort.postMessage({ id, type: 'prewarm_ack', versionId });
      return;
    }

    if (type === 'bible_search')
    {
      try
      {
        const { query, versionId = 'tamil', fromBook = 1, toBook = 66, limit = 100 } = msg;
        const q = String(query || '').trim();
        if (!q)
        {
          parentPort.postMessage({ id, success: true, results: [], totalMatches: 0, hasMore: false });
          return;
        }

        const idx = getOrBuildIndex(versionId);
        if (!idx || idx.count === 0)
        {
          parentPort.postMessage({ id, success: true, results: [], totalMatches: 0, hasMore: false });
          return;
        }

        const results = [];
        const qLower = q.toLowerCase();
        const minBook = Math.min(Number(fromBook) || 1, Number(toBook) || 66);
        const maxBook = Math.max(Number(fromBook) || 1, Number(toBook) || 66);

        const isFetchAll = limit === 'all' || limit === '0' || Number(limit) >= 3000;
        const maxLimit = isFetchAll ? 3000 : (Number(limit) > 0 ? Number(limit) : 100);

        let totalMatchesCount = 0;
        let hasMore = false;

        const {
          isTamil,
          count,
          bookNames,
          bookNums,
          chNums,
          verseNums,
          wordIds,
          verseTexts,
          verseOffsets,
          tokenInfosFullKey,
          tokenInfosStripKey
        } = idx;

        if (isTamil && tokenInfosFullKey)
        {
          const qPattern = compileQueryPattern(q);

          for (let i = 0; i < count; i++)
          {
            const bNum = bookNums[i];
            if (bNum < minBook || bNum > maxBook)
            {
              continue;
            }

            const start = verseOffsets[i];
            const end = verseOffsets[i + 1];
            const match = matchFlatTokenRange(
              tokenInfosFullKey,
              tokenInfosStripKey,
              start,
              end,
              qPattern,
              qLower,
              verseTexts[i]
            );

            if (match.matched)
            {
              totalMatchesCount++;
              if (results.length < maxLimit)
              {
                const bName = (bookNames && bookNames[bNum - 1]) ? bookNames[bNum - 1] : `Book ${bNum}`;
                const chNum = chNums[i];
                const vNum = verseNums[i];
                const wordStr = verseTexts[i];

                // Extract matched words deterministically only for matched results
                let matchedWords = [];
                if (match.isTextMatch)
                {
                  matchedWords = [q];
                }
                else
                {
                  const verseTokens = tokenizeText(wordStr);
                  const relStart = match.relativeStart || 0;
                  const mLen = match.matchLength || 1;
                  matchedWords = verseTokens.slice(relStart, relStart + mLen);
                  if (matchedWords.length === 0) matchedWords = [q];
                }

                results.push({
                  wordId: wordIds[i],
                  bookNum: bNum,
                  chNum: chNum,
                  verseNum: vNum,
                  bookName: bName,
                  word: wordStr,
                  versionId: idx.versionId,
                  reference: `${bName} ${chNum}:${vNum}`,
                  matchedTokens: matchedWords,
                  matchedWordTokens: matchedWords,
                  matchedTerm: matchedWords.join(' ') || q
                });
              }
              else
              {
                hasMore = true;
                if (!isFetchAll)
                {
                  break;
                }
              }
            }
          }
        }
        else
        {
          // Fast case-insensitive regex search for non-Tamil translations
          const cleanQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(cleanQ, 'i');

          for (let i = 0; i < count; i++)
          {
            const bNum = bookNums[i];
            if (bNum < minBook || bNum > maxBook)
            {
              continue;
            }

            const wordStr = verseTexts[i];
            if (regex.test(wordStr))
            {
              totalMatchesCount++;
              if (results.length < maxLimit)
              {
                const bName = (bookNames && bookNames[bNum - 1]) ? bookNames[bNum - 1] : `Book ${bNum}`;
                const chNum = chNums[i];
                const vNum = verseNums[i];

                results.push({
                  wordId: wordIds[i],
                  bookNum: bNum,
                  chNum: chNum,
                  verseNum: vNum,
                  bookName: bName,
                  word: wordStr,
                  versionId: idx.versionId,
                  reference: `${bName} ${chNum}:${vNum}`,
                  matchedTokens: [q],
                  matchedWordTokens: [q],
                  matchedTerm: q
                });
              }
              else
              {
                hasMore = true;
                if (!isFetchAll)
                {
                  break;
                }
              }
            }
          }
        }

        parentPort.postMessage({
          id,
          success: true,
          results,
          totalMatches: totalMatchesCount,
          hasMore
        });
      }
      catch (err)
      {
        parentPort.postMessage({
          id,
          success: false,
          error: err.message
        });
      }
    }
  });
}
