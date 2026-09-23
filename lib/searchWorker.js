import { parentPort } from 'node:worker_threads';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  tokenizeText,
  buildTargetTokenInfos,
  compileQueryPattern,
  matchTokenInfosWithKeys
} from '../public/presenter/js/tamilPhonetic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');

// In-memory index cache inside the worker thread
const bibleSearchIndex = new Map();

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
  if (bibleSearchIndex.has(targetId))
  {
    return bibleSearchIndex.get(targetId);
  }

  const versions = getVersionMetadata();
  const matchedVer = versions.find(v => v.id === targetId || v.file === targetId || v.file === `${targetId}.db`);
  const actualVersionId = matchedVer ? (matchedVer.id || targetId) : targetId;

  if (bibleSearchIndex.has(actualVersionId))
  {
    return bibleSearchIndex.get(actualVersionId);
  }

  const db = getBibleDb(actualVersionId);
  if (!db) return [];

  try
  {
    const rows = db.prepare('SELECT wordId, bookNum, chNum, verseNum, word FROM words ORDER BY bookNum, chNum, verseNum').all();
    const bookNames = (matchedVer && (matchedVer.booknames || matchedVer.books)) || [];

    const indexedVerses = rows.map(r => {
      const bNum = Number(r.bookNum);
      const chNum = Number(r.chNum);
      const vNum = Number(r.verseNum);
      const bookName = (bookNames && bookNames[bNum - 1]) ? bookNames[bNum - 1] : `Book ${bNum}`;
      const tokens = tokenizeText(r.word);
      const tokenInfos = buildTargetTokenInfos(tokens);

      return {
        wordId: r.wordId,
        bookNum: bNum,
        chNum: chNum,
        verseNum: vNum,
        bookName,
        word: r.word,
        wordLower: (r.word || '').toLowerCase(),
        tokens,
        tokenInfos,
        versionId: actualVersionId
      };
    });

    bibleSearchIndex.set(actualVersionId, indexedVerses);
    return indexedVerses;
  }
  catch (err)
  {
    console.error(`[searchWorker] Failed to index Bible version ${actualVersionId}:`, err);
    return [];
  }
}

// Auto pre-warm default versions on worker startup
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

        const verses = getOrBuildIndex(versionId);
        if (!verses || verses.length === 0)
        {
          parentPort.postMessage({ id, success: true, results: [], totalMatches: 0, hasMore: false });
          return;
        }

        const results = [];
        const qLower = q.toLowerCase();
        const qPattern = compileQueryPattern(q);
        const minBook = Math.min(Number(fromBook) || 1, Number(toBook) || 66);
        const maxBook = Math.max(Number(fromBook) || 1, Number(toBook) || 66);

        const isFetchAll = limit === 'all' || limit === '0' || Number(limit) >= 3000;
        const maxLimit = isFetchAll ? 3000 : (Number(limit) > 0 ? Number(limit) : 100);

        let totalMatchesCount = 0;
        let hasMore = false;

        for (const v of verses)
        {
          if (v.bookNum < minBook || v.bookNum > maxBook)
          {
            continue;
          }

          const match = matchTokenInfosWithKeys(v.tokenInfos, v.tokens, v.wordLower, qPattern, qLower);
          if (match.matched)
          {
            totalMatchesCount++;
            if (results.length < maxLimit)
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
