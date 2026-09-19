// ===========================================================================
// Tamil Phonetic Sound-Key Normalizer & Strict Contiguous Phrase Matcher
// Zero-Dictionary, High-Performance Deterministic Acoustic Sound-Folding Engine
// ===========================================================================

// Standalone Tamil Vowels -> Canonical Vowel Sound
const standaloneTamilVowels = {
  'அ': 'a',
  'ஆ': 'a',
  'இ': 'i',
  'ஈ': 'i',
  'உ': 'u',
  'ஊ': 'u',
  'எ': 'e',
  'ஏ': 'e',
  'ஐ': 'y',
  'ஒ': 'o',
  'ஓ': 'o',
  'ஔ': 'av'
};

// Attached Tamil Vowel Matras (attached to consonants)
const tamilVowelMatras = {
  'ா': 'a',
  'ி': 'i',
  'ீ': 'i',
  'ு': 'u',
  'ூ': 'u',
  'ெ': 'e',
  'ே': 'e',
  'ை': 'y',
  'ொ': 'o',
  'ோ': 'o',
  'ௌ': 'av'
};

// Tamil Consonants -> Canonical Base Consonant Sound
const tamilConsonants = {
  'க': 'k',
  'ங': 'ng',
  'ச': 's',
  'ஞ': 'nj',
  'ட': 't',
  'ண': 'n',
  'த': 't',
  'ந': 'n',
  'ன': 'n',
  'ப': 'p',
  'ம': 'm',
  'ய': 'y',
  'ர': 'r',
  'ற': 'r',
  'ல': 'l',
  'ள': 'l',
  'ழ': 'l',
  'வ': 'v',
  'ஸ': 's',
  'ஷ': 's',
  'ஜ': 'j',
  'ஹ': 'h'
};

/**
 * Normalizes text into clean word tokens by stripping punctuation, tags, and stanza numbers
 */
export function tokenizeText(text)
{
  if (!text || typeof text !== 'string') return [];
  const clean = text.replace(/<[^>]*>/g, ' ');
  const normalized = clean
    .replace(/[0-9]+[\.\)\-:]*/g, ' ')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()—–"'\?\[\]\\|<>+@•]/g, ' ')
    .trim();
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

/**
 * Computes the unified phonetic sound-key for a single word token (Tamil or Romanized)
 * Zero dictionary, purely algorithmic
 */
export function getSoundKey(word)
{
  if (!word || typeof word !== 'string') return '';
  const raw = word.trim().toLowerCase();
  if (!raw) return '';

  if (/[\u0B80-\u0BFF]/.test(raw))
  {
    return getTamilScriptSoundKey(raw);
  }

  return getRomanizedSoundKey(raw);
}

/**
 * Converts a Tamil Unicode word into a canonical acoustic sound key
 */
function getTamilScriptSoundKey(word)
{
  let key = '';
  const len = word.length;
  let i = 0;

  while (i < len)
  {
    const ch = word[i];

    if (ch === 'ஸ்ரீ')
    {
      key += 'sri';
      i++;
      continue;
    }

    if (standaloneTamilVowels[ch] !== undefined)
    {
      key += standaloneTamilVowels[ch];
      i++;
      continue;
    }

    if (tamilConsonants[ch] !== undefined)
    {
      const consSound = tamilConsonants[ch];
      const nextCh = i + 1 < len ? word[i + 1] : '';

      if (nextCh === '\u0BCD')
      {
        key += consSound;
        i += 2;
      }
      else if (tamilVowelMatras[nextCh] !== undefined)
      {
        key += consSound + tamilVowelMatras[nextCh];
        i += 2;
      }
      else
      {
        key += consSound + 'a';
        i += 1;
      }
      continue;
    }

    if (ch === 'ஃ' || ch === '\u0BCD')
    {
      i++;
      continue;
    }

    if (/[a-z]/i.test(ch))
    {
      key += ch.toLowerCase();
    }
    i++;
  }

  return collapseSoundKey(key);
}

/**
 * Converts a Romanized (Tanglish) word into a canonical acoustic sound key
 */
function getRomanizedSoundKey(word)
{
  let s = word.toLowerCase();

  s = s.replace(/shri|sree|sri/g, 'sri');
  s = s.replace(/ksh/g, 'ks');
  s = s.replace(/th|dh/g, 't');
  s = s.replace(/sh|ch/g, 's');
  s = s.replace(/zh/g, 'l');
  s = s.replace(/ng/g, 'ng');
  s = s.replace(/nj|gn|ny/g, 'nj');
  s = s.replace(/ndr/g, 'nr');

  s = s.replace(/[bf]/g, 'p');
  s = s.replace(/g/g, 'k');
  s = s.replace(/d/g, 't');
  s = s.replace(/c/g, 's');
  s = s.replace(/z/g, 'j');
  s = s.replace(/w/g, 'v');
  s = s.replace(/q/g, 'k');
  s = s.replace(/x/g, 'ks');

  s = s.replace(/aai|aae/g, 'y');
  s = s.replace(/ai(?![aeiou])/g, 'y');
  s = s.replace(/(?:ay|ey)(?![aeiou])/g, 'y');
  s = s.replace(/au|ou|ow/g, 'av');
  s = s.replace(/aa/g, 'a');
  s = s.replace(/ee|ea|ae|ii/g, 'i');
  s = s.replace(/oo|uu/g, 'u');
  s = s.replace(/oa|oe/g, 'o');

  s = s.replace(/^ie|^iae|^yae/, 'ye');

  return collapseSoundKey(s);
}

/**
 * Collapses duplicate adjacent identical characters
 */
function collapseSoundKey(rawKey)
{
  if (!rawKey) return '';
  let out = '';
  for (let i = 0; i < rawKey.length; i++)
  {
    const char = rawKey[i];
    if (i === 0 || char !== rawKey[i - 1])
    {
      out += char;
    }
  }
  return out;
}

/**
 * Analyzes target tokens and computes dual sound keys for validated Tamil Sandhi pairs (வல்லினம் மிகல் புணர்ச்சி).
 * Only க், ச், த், ப் are stripped if and only if the immediately following word starts with the corresponding க*, ச*, த*, ப*.
 */
export function buildTargetTokenInfos(tokens)
{
  if (!tokens || !Array.isArray(tokens)) return [];
  const infos = [];
  const len = tokens.length;

  for (let i = 0; i < len; i++)
  {
    const word = tokens[i];
    const fullKey = getSoundKey(word);
    let strippedKey = null;

    if (i + 1 < len)
    {
      const nextWord = tokens[i + 1];
      // Vallinam sandhi check
      if (word.endsWith('க்') && nextWord.startsWith('க'))
      {
        strippedKey = getSoundKey(word.slice(0, -2));
      }
      else if (word.endsWith('ச்') && nextWord.startsWith('ச'))
      {
        strippedKey = getSoundKey(word.slice(0, -2));
      }
      else if (word.endsWith('த்') && nextWord.startsWith('த'))
      {
        strippedKey = getSoundKey(word.slice(0, -2));
      }
      else if (word.endsWith('ப்') && nextWord.startsWith('ப'))
      {
        strippedKey = getSoundKey(word.slice(0, -2));
      }
    }

    infos.push({
      raw: word,
      fullKey: fullKey,
      strippedKey: strippedKey
    });
  }

  return infos;
}

export function matchTokenInfosWithKeys(tInfos, tTokens, textLower, qKeys, rawQueryLower)
{
  if (!qKeys || qKeys.length === 0)
  {
    return { matched: true, matchedTokens: [], matchStartIndex: 0 };
  }

  const K = qKeys.length;
  if (tTokens && tTokens.length >= K && tInfos && tInfos.length >= K)
  {
    for (let i = 0; i <= tInfos.length - K; i++)
    {
      let allMatched = true;

      for (let j = 0; j < K; j++)
      {
        const T = tInfos[i + j];
        const Q = qKeys[j];

        if (j < K - 1)
        {
          // Intermediate tokens: Strict exact match
          const tokenMatched = (T.fullKey === Q) || (T.strippedKey !== null && T.strippedKey === Q);
          if (!tokenMatched)
          {
            allMatched = false;
            break;
          }
        }
        else
        {
          // Last token: Wildcard/prefix match (target token starts with query token sound-key)
          const tokenMatched = (T.fullKey && T.fullKey.startsWith(Q)) ||
                               (T.strippedKey !== null && T.strippedKey.startsWith(Q));
          if (!tokenMatched)
          {
            allMatched = false;
            break;
          }
        }
      }

      if (allMatched)
      {
        return {
          matched: true,
          matchedTokens: tTokens.slice(i, i + K),
          matchStartIndex: i
        };
      }
    }
  }

  // Fast direct substring fallback
  if (rawQueryLower && textLower && textLower.includes(rawQueryLower))
  {
    return { matched: true, matchedTokens: [rawQueryLower], matchStartIndex: 0 };
  }

  return { matched: false, matchedTokens: [], matchStartIndex: -1 };
}

/**
 * High-performance matcher with pre-computed query keys, sandhi pair validation,
 * and trailing wildcard/prefix match for the last query token.
 */
export function matchWithPrecomputedKeys(targetText, qKeys, rawQuery)
{
  if (!targetText || typeof targetText !== 'string' || !targetText.trim())
  {
    return { matched: false, matchedTokens: [], matchStartIndex: -1 };
  }
  if (!qKeys || qKeys.length === 0)
  {
    return { matched: true, matchedTokens: [], matchStartIndex: 0 };
  }

  const tTokens = tokenizeText(targetText);
  const tInfos = buildTargetTokenInfos(tTokens);
  const textLower = targetText.toLowerCase();
  const qLower = rawQuery ? rawQuery.trim().toLowerCase() : '';

  return matchTokenInfosWithKeys(tInfos, tTokens, textLower, qKeys, qLower);
}

/**
 * Tests whether a target text matches the search query using strict whole-word contiguous matching.
 */
export function matchContiguousPhoneticPhrase(targetText, query)
{
  if (!query || typeof query !== 'string' || !query.trim())
  {
    return { matched: true, matchedTokens: [], matchStartIndex: 0 };
  }
  const qTokens = tokenizeText(query);
  if (qTokens.length === 0)
  {
    return { matched: true, matchedTokens: [], matchStartIndex: 0 };
  }
  const qKeys = qTokens.map(t => getSoundKey(t)).filter(Boolean);
  return matchWithPrecomputedKeys(targetText, qKeys, query);
}

/**
 * Checks if target text matches query (convenience boolean method)
 */
export function matchesQueryPhonetic(targetText, query)
{
  return matchContiguousPhoneticPhrase(targetText, query).matched;
}

/**
 * Highlights the matched contiguous phrase or tokens in the given text
 */
export function highlightMatchedCharacters(text, query)
{
  if (!text) return '';
  if (!query || !query.trim()) return escapeHtml(text);

  const rawString = String(text);
  const matchRes = matchContiguousPhoneticPhrase(rawString, query);
  if (!matchRes.matched)
  {
    return escapeHtml(rawString);
  }

  if (matchRes.matchedTokens && matchRes.matchedTokens.length > 0)
  {
    const tokenRegexes = matchRes.matchedTokens
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter(Boolean);

    if (tokenRegexes.length > 0)
    {
      // 1. Try matching the exact contiguous phrase
      const phrasePattern = tokenRegexes.join('[^a-zA-Z\\u0B80-\\u0BFF0-9]+');
      try
      {
        const phraseRegex = new RegExp(phrasePattern, 'gi');
        if (phraseRegex.test(rawString))
        {
          return rawString.replace(phraseRegex, (m) => `<mark class="search-match-hl">${escapeHtml(m)}</mark>`);
        }
      }
      catch (e) {}

      // 2. Try matching individual matched tokens
      try
      {
        const wordRegex = new RegExp(tokenRegexes.join('|'), 'gi');
        return rawString.replace(wordRegex, (m) => `<mark class="search-match-hl">${escapeHtml(m)}</mark>`);
      }
      catch (e) {}
    }
  }

  // Fallback direct query match
  try
  {
    const qClean = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(qClean, 'gi');
    return rawString.replace(regex, (m) => `<mark class="search-match-hl">${escapeHtml(m)}</mark>`);
  }
  catch (e) {}

  return escapeHtml(rawString);
}

function escapeHtml(str)
{
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default {
  tokenizeText,
  getSoundKey,
  matchWithPrecomputedKeys,
  matchContiguousPhoneticPhrase,
  matchesQueryPhonetic,
  highlightMatchedCharacters
};
