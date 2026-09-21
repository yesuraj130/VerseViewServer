// ===========================================================================
// Presenter Console & Server — Tamil Phonetic Sound-Key & Phrase Matcher
// Zero-Dictionary, High-Performance Deterministic Acoustic Sound-Folding Engine
// Single Universal Source of Truth for Browser & Node.js Server
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
  'ஹ': 'h',
  'ஜ': 'j'
};

/**
 * Splits text into tokens while preserving search delimiters (* and ?)
 */
function tokenizeText(text)
{
  if (!text || typeof text !== 'string') return [];
  return text.trim().split(/[\s,;:.!?"'()\[\]{}<>\/\\|\-_=+~`@#$%^&]+/g).filter(Boolean);
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
      if (nextCh === '\u0BCD') // Pulli / virama -> pure consonant
      {
        key += consSound;
        i += 2;
      }
      else if (tamilVowelMatras[nextCh] !== undefined) // Consonant + vowel sign
      {
        key += consSound + tamilVowelMatras[nextCh];
        i += 2;
      }
      else // Unmarked consonant has implicit 'a'
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

  // Harmonize Tamil compound nasal-stop clusters:
  // 1. ங் + க (ngk) -> nk (e.g. செங்கடலை, சிங்கம், மங்களம், பொங்கல், எங்கே)
  key = key.replace(/ngk/g, 'nk');
  // 2. ஞ் + ச (njs) -> nj (e.g. மஞ்சள், நெஞ்சம், கொஞ்சும், தஞ்சம்)
  key = key.replace(/njs/g, 'nj');
  // 3. Initial இயே (iye) -> ye (e.g. இயேசு -> Yesu)
  key = key.replace(/^iye/, 'ye');
  // 4. Harmonize intervocalic Grantha ஹ to k (e.g. ஆஹா -> aaka -> aka, எலோஹிம் -> elokim)
  key = key.replace(/([aeiou])h([aeiou])/g, '$1k$2');
  key = key.replace(/([aeiou])h([aeiou])/g, '$1k$2');
  // 5. Harmonize geminate alveolar stop ற் + ற (rr) -> tr (e.g. வெற்றி -> vetri, காற்று -> katru, ஆற்று -> atru, தேற்று -> tetru)
  key = key.replace(/rr/g, 'tr');

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

  // Harmonize compound nasal-stop clusters matching Tamil phonology:
  // 1. Velar nasal: ng, ngg, ngk -> nk (e.g. Sengada, Singam, Pongal, Mangalam, Enge)
  s = s.replace(/ngk|ngg|ng/g, 'nk');
  // 2. Palatal nasal: njs, nch, nj -> nj (e.g. Manjal, Nenjam, Konjum, Thanjam)
  s = s.replace(/njs|nch/g, 'nj');
  s = s.replace(/nj|gn|ny/g, 'nj');
  // 3. Alveolar nasal: ndr, ntr -> nr (e.g. Nandri, Nantri, Ondru, Ontru, Endru, Entru)
  s = s.replace(/ntr|ndr/g, 'nr');

  s = s.replace(/[bf]/g, 'p');
  s = s.replace(/g/g, 'k');
  s = s.replace(/d/g, 't');
  s = s.replace(/c/g, 's');
  s = s.replace(/z/g, 'j');
  s = s.replace(/w/g, 'v');
  s = s.replace(/q/g, 'k');
  s = s.replace(/x/g, 'ks');

  // Tanglish soft க: map intervocalic h (surrounded by vowels) to k
  // e.g. enakaha -> enakaka, anbaha -> anbaka, pohiren -> pokiren, yehova -> yekova, mahima -> makima
  // Safeguard: does NOT affect initial h (hosanna, halleluya) or trailing h (appah)
  s = s.replace(/([aeiou])h([aeiou])/g, '$1k$2');
  s = s.replace(/([aeiou])h([aeiou])/g, '$1k$2');

  s = s.replace(/aai|aae/g, 'y');
  s = s.replace(/ai(?![aeiou])/g, 'y');
  s = s.replace(/(?:ay|ey)(?![aeiou])/g, 'y');
  s = s.replace(/au|ou|ow/g, 'av');
  s = s.replace(/aa/g, 'a');
  s = s.replace(/ee|ea|ae|ii/g, 'i');
  s = s.replace(/oo|uu/g, 'u');
  s = s.replace(/oa|oe/g, 'o');
  s = s.replace(/^ie|^iae|^yae/, 'ye');
  s = s.replace(/^iye/, 'ye');

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
 * Primary public acoustic key generator for both Tamil and Tanglish
 * Zero dictionary, purely algorithmic
 */
function getSoundKey(word)
{
  if (!word || typeof word !== 'string') return '';
  const raw = word.trim().toLowerCase().replace(/\*/g, '');
  if (!raw) return '';

  if (/[\u0B80-\u0BFF]/.test(raw))
  {
    return getTamilScriptSoundKey(raw);
  }
  return getRomanizedSoundKey(raw);
}

/**
 * Checks if a Tamil or Romanized word has a prothetic initial 'i' (loanword trill prefix).
 * Classic examples: இரத்தம்/ரத்தம், இராஜா/ராஜா, இரட்சகர்/ரட்சகர், இரட்சிப்பு/ரட்சிப்பு,
 * இராத்திரி/ராத்திரி, இரதம்/ரதம், இரத்தினம்/ரத்தினம், இலட்சம்/லட்சம்.
 * Strictly excludes native roots like இரு (iru), இரண்டு (iran), இரட்டை (iratt), இரவு (irav).
 */
function getProtheticAlternateKey(soundKey, rawWord)
{
  if (!soundKey || !soundKey.startsWith('i')) return null;

  // If raw Tamil word is available, apply strict morphological safeguards
  if (rawWord && /[\u0B80-\u0BFF]/.test(rawWord))
  {
    const isProthetic = (rawWord.startsWith('இர') || rawWord.startsWith('இரா') ||
                         rawWord.startsWith('இரே') || rawWord.startsWith('இரோ') ||
                         rawWord.startsWith('இலட்ச')) &&
                        !rawWord.startsWith('இரு') &&
                        !rawWord.startsWith('இரண்') &&
                        !rawWord.startsWith('இரட்ட') &&
                        !rawWord.startsWith('இரவ') &&
                        !rawWord.startsWith('இற');
    if (isProthetic)
    {
      return soundKey.slice(1);
    }
    return null;
  }

  // For Romanized query tokens (e.g. iratham, iraja, iratchagar, ilatcham):
  // Safe loanword prefixes
  const protheticRomanPrefixes = ['irat', 'iraj', 'irats', 'iras', 'iranu', 'ilats', 'ilok', 'iles'];
  if (protheticRomanPrefixes.some(p => soundKey.startsWith(p)))
  {
    return soundKey.slice(1);
  }
  return null;
}

/**
 * Common colloquial pronoun and devotional variants where spoken/Tanglish '-a'
 * corresponds to literary accusative '-ai' or Sanskrit '-a' loanwords.
 * Explicit mapping ensures 100% precision with zero side effects on general words (e.g. nalla vs naalai).
 */
const COLLOQUIAL_ALTERNATES = {
  // ennai (me) <-> enna
  'eny': ['ena'],
  'ena': ['eny'],

  // unnai (you) <-> unna
  'uny': ['una'],
  'una': ['uny'],

  // nammai (us) <-> namma
  'namy': ['nama'],
  'nama': ['namy'],

  // avanai (him) <-> avana
  'avany': ['avana'],
  'avana': ['avany'],

  // avalai (her) <-> avala
  'avaly': ['avala'],
  'avala': ['avaly'],

  // engalai (us pl.) <-> engala
  'enkaly': ['enkala'],
  'enkala': ['enkaly'],

  // ungalai (you pl.) <-> ungala
  'unkaly': ['unkala'],
  'unkala': ['unkaly'],

  // avarkalai (them) <-> avarkala
  'avarkaly': ['avarkala'],
  'avarkala': ['avarkaly'],

  // kirubai / kiruba / krupa (grace)
  'kirupy': ['kirupa', 'krupa'],
  'kirupa': ['kirupy', 'krupa'],
  'krupa': ['kirupy', 'kirupa'],

  // aasai (desire) <-> aasa
  'asy': ['asa'],
  'asa': ['asy'],
};

function getColloquialAlternates(key)
{
  if (!key) return [];
  return COLLOQUIAL_ALTERNATES[key] || [];
}

/**
 * Analyzes target tokens and computes sound keys for validated Tamil Sandhi pairs
 * (வல்லினம் மிகல் புணர்ச்சி). Target tokens only store lean canonical and stripped keys.
 */
function buildTargetTokenInfos(tokens)
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
      // Vallinam sandhi check (க், ச், த், ப்)
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

/**
 * Builds all valid phonetic variations (prothetic vowels, colloquial alternates, tr/r)
 * for a query search token at query time.
 */
function buildQueryWordKeys(key, clean)
{
  if (!key) return [];
  const qList = [key];

  const protheticKey = getProtheticAlternateKey(key, clean);
  if (protheticKey && !qList.includes(protheticKey))
  {
    qList.push(protheticKey);
  }

  // Add colloquial alternates (e.g. enna <-> ennai, unna <-> unnai)
  const baseKeys = [...qList];
  for (const k of baseKeys)
  {
    const alts = getColloquialAlternates(k);
    for (const alt of alts)
    {
      if (!qList.includes(alt)) qList.push(alt);
    }
  }

  // 'tr' vs 'r' variations
  const currentCount = qList.length;
  for (let i = 0; i < currentCount; i++)
  {
    const k = qList[i];
    if (k.includes('tr'))
    {
      const rKey = k.replace(/tr/g, 'r');
      if (!qList.includes(rKey)) qList.push(rKey);
    }
  }

  return qList;
}

/**
 * Compiles a query string into an optimized token pattern with wildcard and gap support
 */
function compileQueryPattern(rawQuery)
{
  if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim())
  {
    return {
      isPattern: true,
      items: [],
      wordItems: [],
      hasWildcard: false,
      qKeys: [],
      length: 0
    };
  }

  const rawTokens = tokenizeText(rawQuery);
  const items = [];
  let lastWasGap = false;

  for (let idx = 0; idx < rawTokens.length; idx++)
  {
    const token = rawTokens[idx];
    const isLast = (idx === rawTokens.length - 1);

    // Standalone asterisk(s) represent a gap of zero or more intervening words
    if (/^\*+$/.test(token))
    {
      if (!lastWasGap && items.length > 0)
      {
        items.push({ type: 'gap' });
        lastWasGap = true;
      }
      continue;
    }

    const hasLeadingWildcard = token.startsWith('*');
    const hasTrailingWildcard = token.endsWith('*');
    const clean = token.replace(/\*/g, '');
    if (!clean) continue;

    const key = getSoundKey(clean);
    if (!key) continue;

    const protheticKey = getProtheticAlternateKey(key, clean);
    const qKeysList = buildQueryWordKeys(key, clean);

    let mode = 'exact';
    if (hasLeadingWildcard && hasTrailingWildcard)
    {
      mode = 'contains';
    }
    else if (hasLeadingWildcard)
    {
      mode = 'suffix';
    }
    else if (hasTrailingWildcard)
    {
      mode = 'prefix';
    }
    else if (isLast)
    {
      // Incremental typing prefix match for the final word token
      mode = 'prefix';
    }

    let internalParts = null;
    if (!hasLeadingWildcard && !hasTrailingWildcard && token.includes('*'))
    {
      const parts = token.split('*').filter(Boolean);
      if (parts.length === 2)
      {
        mode = 'internal';
        internalParts = [getSoundKey(parts[0]), getSoundKey(parts[1])];
      }
    }

    items.push({
      type: 'word',
      raw: token,
      clean: clean,
      key: key,
      protheticKey: protheticKey,
      qKeysList: qKeysList,
      mode: mode,
      internalParts: internalParts
    });

    lastWasGap = false;
  }

  // Remove redundant trailing gap
  if (items.length > 0 && items[items.length - 1].type === 'gap')
  {
    items.pop();
  }

  const wordItems = items.filter(it => it.type === 'word');
  const hasWildcard = items.some(it =>
    it.type === 'gap' ||
    it.mode === 'suffix' ||
    it.mode === 'contains' ||
    it.mode === 'internal' ||
    (it.raw && it.raw.includes('*'))
  );

  return {
    isPattern: true,
    items: items,
    wordItems: wordItems,
    hasWildcard: hasWildcard,
    qKeys: wordItems.map(w => w.key),
    length: wordItems.length
  };
}

function checkKeyMatch(tKey, qKey, mode, internalParts)
{
  if (!tKey || !qKey) return false;
  switch (mode)
  {
    case 'prefix':
      return tKey.startsWith(qKey);
    case 'suffix':
      return tKey.endsWith(qKey);
    case 'contains':
      return tKey.includes(qKey);
    case 'internal':
      return internalParts && tKey.startsWith(internalParts[0]) && tKey.endsWith(internalParts[1]);
    case 'exact':
    default:
      return (tKey === qKey) || (qKey.length >= 4 && tKey.startsWith(qKey));
  }
}

/**
 * Checks if target token T satisfies query word item qItem
 */
function matchesToken(T, qItem)
{
  if (!T) return false;
  const qKeys = qItem.qKeysList || (qItem.key ? [qItem.key] : []);
  const tFull = T.fullKey;
  const tStrip = T.strippedKey;

  for (let i = 0; i < qKeys.length; i++)
  {
    const qKey = qKeys[i];
    if (!qKey) continue;
    let ok = checkKeyMatch(tFull, qKey, qItem.mode, qItem.internalParts);
    if (!ok && tStrip)
    {
      ok = checkKeyMatch(tStrip, qKey, qItem.mode, qItem.internalParts);
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Evaluates target token infos against pre-compiled query pattern or raw keys
 */
function matchTokenInfosWithKeys(tInfos, tTokens, textLower, qKeys, rawQueryLower)
{
  let pattern = null;
  if (qKeys && qKeys.isPattern)
  {
    pattern = qKeys;
  }
  else if (rawQueryLower && rawQueryLower.includes('*'))
  {
    pattern = compileQueryPattern(rawQueryLower);
  }
  else if (Array.isArray(qKeys))
  {
    const wordItems = qKeys.map((k, idx) => {
      const prothetic = getProtheticAlternateKey(k, '');
      const qList = buildQueryWordKeys(k, '');
      return {
        type: 'word',
        raw: k,
        clean: k,
        key: k,
        protheticKey: prothetic,
        qKeysList: qList,
        mode: (idx === qKeys.length - 1) ? 'prefix' : 'exact'
      };
    });
    pattern = {
      isPattern: true,
      items: wordItems,
      wordItems: wordItems,
      hasWildcard: false,
      qKeys: qKeys,
      length: wordItems.length
    };
  }

  if (!pattern || pattern.items.length === 0)
  {
    return { matched: true, matchedTokens: [], matchedWordTokens: [], matchStartIndex: 0 };
  }

  const numWords = pattern.wordItems.length;
  if (numWords === 0)
  {
    return { matched: true, matchedTokens: [], matchedWordTokens: [], matchStartIndex: 0 };
  }

  if (!tInfos || tInfos.length < numWords)
  {
    if (rawQueryLower && textLower && textLower.includes(rawQueryLower.replace(/\*/g, '')))
    {
      return { matched: true, matchedTokens: [rawQueryLower], matchedWordTokens: [rawQueryLower], matchStartIndex: 0 };
    }
    return { matched: false, matchedTokens: [], matchedWordTokens: [], matchStartIndex: -1 };
  }

  // Fast contiguous matching when no wildcards or gaps are present
  if (!pattern.hasWildcard)
  {
    const K = pattern.wordItems.length;
    for (let i = 0; i <= tInfos.length - K; i++)
    {
      let allMatched = true;
      for (let j = 0; j < K; j++)
      {
        const T = tInfos[i + j];
        const qItem = pattern.wordItems[j];
        const isLast = (j === K - 1);
        const qKeys = qItem.qKeysList || [qItem.key];
        const tFull = T.fullKey;
        const tStrip = T.strippedKey;

        let tokenMatched = false;
        if (!isLast)
        {
          for (let qkIdx = 0; qkIdx < qKeys.length; qkIdx++)
          {
            const qk = qKeys[qkIdx];
            if ((tFull === qk) || (qk.length >= 4 && tFull.startsWith(qk)) ||
                (tStrip && ((tStrip === qk) || (qk.length >= 4 && tStrip.startsWith(qk)))))
            {
              tokenMatched = true;
              break;
            }
          }
        }
        else
        {
          for (let qkIdx = 0; qkIdx < qKeys.length; qkIdx++)
          {
            const qk = qKeys[qkIdx];
            if (tFull.startsWith(qk) || (tStrip && tStrip.startsWith(qk)))
            {
              tokenMatched = true;
              break;
            }
          }
        }

        if (!tokenMatched)
        {
          allMatched = false;
          break;
        }
      }

      if (allMatched)
      {
        const slice = tTokens.slice(i, i + K);
        return {
          matched: true,
          matchedTokens: slice,
          matchedWordTokens: slice,
          matchStartIndex: i
        };
      }
    }

    if (rawQueryLower && textLower && textLower.includes(rawQueryLower))
    {
      return { matched: true, matchedTokens: [rawQueryLower], matchedWordTokens: [rawQueryLower], matchStartIndex: 0 };
    }

    return { matched: false, matchedTokens: [], matchedWordTokens: [], matchStartIndex: -1 };
  }

  // Wildcard pattern matching with gap and word wildcard support
  const items = pattern.items;
  for (let startIdx = 0; startIdx < tInfos.length; startIdx++)
  {
    let tIdx = startIdx;
    let matched = true;
    const wordIndices = [];

    for (let pIdx = 0; pIdx < items.length; pIdx++)
    {
      const item = items[pIdx];
      if (item.type === 'gap') continue;

      const prevItem = pIdx > 0 ? items[pIdx - 1] : null;
      if (prevItem && prevItem.type === 'gap')
      {
        let found = false;
        while (tIdx < tInfos.length)
        {
          if (matchesToken(tInfos[tIdx], item))
          {
            wordIndices.push(tIdx);
            tIdx++;
            found = true;
            break;
          }
          tIdx++;
        }
        if (!found)
        {
          matched = false;
          break;
        }
      }
      else
      {
        if (tIdx >= tInfos.length || !matchesToken(tInfos[tIdx], item))
        {
          matched = false;
          break;
        }
        wordIndices.push(tIdx);
        tIdx++;
      }
    }

    if (matched && wordIndices.length === numWords)
    {
      const firstIdx = wordIndices[0];
      const lastIdx = wordIndices[wordIndices.length - 1];
      return {
        matched: true,
        matchedTokens: tTokens.slice(firstIdx, lastIdx + 1),
        matchedWordTokens: wordIndices.map(idx => tTokens[idx]),
        matchStartIndex: firstIdx
      };
    }
  }

  return { matched: false, matchedTokens: [], matchedWordTokens: [], matchStartIndex: -1 };
}

/**
 * High-performance matcher with pre-computed query pattern/keys, sandhi pair validation,
 * and wildcard support.
 */
function matchWithPrecomputedKeys(targetText, qKeysOrPattern, rawQuery)
{
  if (!targetText || typeof targetText !== 'string' || !targetText.trim())
  {
    return { matched: false, matchedTokens: [], matchedWordTokens: [], matchStartIndex: -1 };
  }
  if (!qKeysOrPattern)
  {
    return { matched: true, matchedTokens: [], matchedWordTokens: [], matchStartIndex: 0 };
  }

  const tTokens = tokenizeText(targetText);
  const tInfos = buildTargetTokenInfos(tTokens);
  const textLower = targetText.toLowerCase();
  const qLower = rawQuery ? rawQuery.trim().toLowerCase() : '';

  return matchTokenInfosWithKeys(tInfos, tTokens, textLower, qKeysOrPattern, qLower);
}

/**
 * Tests whether a target text matches the search query using wildcard-aware phonetic matching.
 */
function matchContiguousPhoneticPhrase(targetText, query)
{
  if (!query || typeof query !== 'string' || !query.trim())
  {
    return { matched: true, matchedTokens: [], matchedWordTokens: [], matchStartIndex: 0 };
  }
  const pattern = compileQueryPattern(query);
  return matchWithPrecomputedKeys(targetText, pattern, query);
}

/**
 * Checks if target text matches query (convenience boolean method)
 */
function matchesQueryPhonetic(targetText, query)
{
  return matchContiguousPhoneticPhrase(targetText, query).matched;
}

/**
 * Escapes HTML characters for safe rendering
 */
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

/**
 * Highlights the matched contiguous phrase or tokens in the given text
 */
function highlightMatchedCharacters(text, query)
{
  if (!text) return '';
  if (!query || !query.trim()) return escapeHtml(text);

  const rawString = String(text);
  const matchRes = matchContiguousPhoneticPhrase(rawString, query);
  if (!matchRes.matched)
  {
    return escapeHtml(rawString);
  }

  const wordsToHighlight = (matchRes.matchedWordTokens && matchRes.matchedWordTokens.length > 0)
    ? matchRes.matchedWordTokens
    : matchRes.matchedTokens;

  if (wordsToHighlight && wordsToHighlight.length > 0)
  {
    const tokenRegexes = wordsToHighlight
      .map(tok => {
        const clean = tok.replace(/<[^>]*>/g, '').trim();
        return clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .filter(Boolean);

    if (tokenRegexes.length > 0)
    {
      // 1. Try to match the contiguous span from first to last matched word
      if (matchRes.matchedTokens && matchRes.matchedTokens.length > 0)
      {
        const phrasePattern = matchRes.matchedTokens
          .map(tok => tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('\\s+');
        try
        {
          const phraseRegex = new RegExp(phrasePattern, 'gi');
          if (phraseRegex.test(rawString))
          {
            return rawString.replace(phraseRegex, (m) => `<mark class="search-match-hl">${escapeHtml(m)}</mark>`);
          }
        }
        catch (e) {}
      }

      // 2. Highlight individual matched query words
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

// Browser global binding
if (typeof window !== 'undefined')
{
  window.TamilPhonetic = {
    tokenizeText,
    getSoundKey,
    compileQueryPattern,
    buildTargetTokenInfos,
    matchTokenInfosWithKeys,
    matchWithPrecomputedKeys,
    matchContiguousPhoneticPhrase,
    matchesQueryPhonetic,
    highlightMatchedCharacters
  };
}

// Node.js ES Module named exports
export {
  tokenizeText,
  getSoundKey,
  compileQueryPattern,
  buildTargetTokenInfos,
  matchTokenInfosWithKeys,
  matchWithPrecomputedKeys,
  matchContiguousPhoneticPhrase,
  matchesQueryPhonetic,
  highlightMatchedCharacters
};
