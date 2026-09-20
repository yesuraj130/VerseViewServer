// ===========================================================================
// Presenter Console — Client-Side Tamil Phonetic Sound-Key & Phrase Matcher
// Zero-Dictionary, High-Performance Deterministic Acoustic Sound-Folding Engine
// ===========================================================================

(function(window) {
  'use strict';

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

  function tokenizeText(text) {
    if (!text || typeof text !== 'string') return [];
    const clean = text.replace(/<[^>]*>/g, ' ');
    const normalized = clean
      .replace(/[0-9]+[\.\)\-:]*/g, ' ')
      .replace(/[.,\/#!$%\^&;:{}=\-_`~()—–"'\?\[\]\\|<>+@•]/g, ' ')
      .trim();
    if (!normalized) return [];
    return normalized.split(/\s+/).filter(Boolean);
  }

  function getTamilScriptSoundKey(word) {
    let key = '';
    const len = word.length;
    let i = 0;

    while (i < len) {
      const ch = word[i];

      if (ch === 'ஸ்ரீ') {
        key += 'sri';
        i++;
        continue;
      }

      if (standaloneTamilVowels[ch] !== undefined) {
        key += standaloneTamilVowels[ch];
        i++;
        continue;
      }

      if (tamilConsonants[ch] !== undefined) {
        const consSound = tamilConsonants[ch];
        const nextCh = i + 1 < len ? word[i + 1] : '';

        if (nextCh === '\u0BCD') {
          key += consSound;
          i += 2;
        } else if (tamilVowelMatras[nextCh] !== undefined) {
          key += consSound + tamilVowelMatras[nextCh];
          i += 2;
        } else {
          key += consSound + 'a';
          i += 1;
        }
        continue;
      }

      if (ch === 'ஃ' || ch === '\u0BCD') {
        i++;
        continue;
      }

      if (/[a-z]/i.test(ch)) {
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

    return collapseSoundKey(key);
  }

  function getRomanizedSoundKey(word) {
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
    // 3. Alveolar nasal: ndr -> nr (e.g. Nandri, Ondru, Endru)
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
    s = s.replace(/^iye/, 'ye');

    return collapseSoundKey(s);
  }

  function collapseSoundKey(rawKey) {
    if (!rawKey) return '';
    let out = '';
    for (let i = 0; i < rawKey.length; i++) {
      const char = rawKey[i];
      if (i === 0 || char !== rawKey[i - 1]) {
        out += char;
      }
    }
    return out;
  }

  function getSoundKey(word) {
    if (!word || typeof word !== 'string') return '';
    const raw = word.trim().toLowerCase().replace(/\*/g, '');
    if (!raw) return '';

    if (/[\u0B80-\u0BFF]/.test(raw)) {
      return getTamilScriptSoundKey(raw);
    }
    return getRomanizedSoundKey(raw);
  }

  function buildTargetTokenInfos(tokens) {
    if (!tokens || !Array.isArray(tokens)) return [];
    const infos = [];
    const len = tokens.length;

    for (let i = 0; i < len; i++) {
      const word = tokens[i];
      const fullKey = getSoundKey(word);
      let strippedKey = null;

      if (i + 1 < len) {
        const nextWord = tokens[i + 1];
        // Vallinam sandhi check (க், ச், த், ப் matching following consonant)
        if (word.endsWith('க்') && nextWord.startsWith('க')) {
          strippedKey = getSoundKey(word.slice(0, -2));
        } else if (word.endsWith('ச்') && nextWord.startsWith('ச')) {
          strippedKey = getSoundKey(word.slice(0, -2));
        } else if (word.endsWith('த்') && nextWord.startsWith('த')) {
          strippedKey = getSoundKey(word.slice(0, -2));
        } else if (word.endsWith('ப்') && nextWord.startsWith('ப')) {
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

  function compileQueryPattern(rawQuery) {
    if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
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

    for (let idx = 0; idx < rawTokens.length; idx++) {
      const token = rawTokens[idx];
      const isLast = (idx === rawTokens.length - 1);

      // Standalone asterisk(s) represent a gap of zero or more intervening words
      if (/^\*+$/.test(token)) {
        if (!lastWasGap && items.length > 0) {
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

      let mode = 'exact';
      if (hasLeadingWildcard && hasTrailingWildcard) {
        mode = 'contains';
      } else if (hasLeadingWildcard) {
        mode = 'suffix';
      } else if (hasTrailingWildcard) {
        mode = 'prefix';
      } else if (isLast) {
        // Incremental typing prefix match for the final word token
        mode = 'prefix';
      }

      let internalParts = null;
      if (!hasLeadingWildcard && !hasTrailingWildcard && token.includes('*')) {
        const parts = token.split('*').filter(Boolean);
        if (parts.length === 2) {
          mode = 'internal';
          internalParts = [getSoundKey(parts[0]), getSoundKey(parts[1])];
        }
      }

      items.push({
        type: 'word',
        raw: token,
        clean: clean,
        key: key,
        mode: mode,
        internalParts: internalParts
      });
      lastWasGap = false;
    }

    // Remove redundant trailing gap
    if (items.length > 0 && items[items.length - 1].type === 'gap') {
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

  function matchesToken(T, qItem) {
    if (!T) return false;
    const check = (k) => {
      if (!k) return false;
      switch (qItem.mode) {
        case 'prefix':
          return k.startsWith(qItem.key);
        case 'suffix':
          return k.endsWith(qItem.key);
        case 'contains':
          return k.includes(qItem.key);
        case 'internal':
          return qItem.internalParts && k.startsWith(qItem.internalParts[0]) && k.endsWith(qItem.internalParts[1]);
        case 'exact':
        default:
          return k === qItem.key;
      }
    };

    return check(T.fullKey) || (T.strippedKey !== null && check(T.strippedKey));
  }

  function matchTokenInfosWithKeys(tInfos, tTokens, textLower, qKeys, rawQueryLower) {
    let pattern = null;
    if (qKeys && qKeys.isPattern) {
      pattern = qKeys;
    } else if (rawQueryLower && rawQueryLower.includes('*')) {
      pattern = compileQueryPattern(rawQueryLower);
    } else if (Array.isArray(qKeys)) {
      const wordItems = qKeys.map((k, idx) => ({
        type: 'word',
        raw: k,
        clean: k,
        key: k,
        mode: (idx === qKeys.length - 1) ? 'prefix' : 'exact'
      }));
      pattern = {
        isPattern: true,
        items: wordItems,
        wordItems: wordItems,
        hasWildcard: false,
        qKeys: qKeys,
        length: wordItems.length
      };
    }

    if (!pattern || pattern.items.length === 0) {
      return { matched: true, matchedTokens: [], matchedWordTokens: [], matchStartIndex: 0 };
    }

    const numWords = pattern.wordItems.length;
    if (numWords === 0) {
      return { matched: true, matchedTokens: [], matchedWordTokens: [], matchStartIndex: 0 };
    }

    if (!tInfos || tInfos.length < numWords) {
      if (rawQueryLower && textLower && textLower.includes(rawQueryLower.replace(/\*/g, ''))) {
        return { matched: true, matchedTokens: [rawQueryLower], matchedWordTokens: [rawQueryLower], matchStartIndex: 0 };
      }
      return { matched: false, matchedTokens: [], matchedWordTokens: [], matchStartIndex: -1 };
    }

    // Fast contiguous matching when no wildcards or gaps are present
    if (!pattern.hasWildcard) {
      const K = pattern.wordItems.length;
      for (let i = 0; i <= tInfos.length - K; i++) {
        let allMatched = true;

        for (let j = 0; j < K; j++) {
          const T = tInfos[i + j];
          const Q = pattern.wordItems[j].key;

          if (j < K - 1) {
            const tokenMatched = (T.fullKey === Q) || (T.strippedKey !== null && T.strippedKey === Q);
            if (!tokenMatched) {
              allMatched = false;
              break;
            }
          } else {
            const tokenMatched = (T.fullKey && T.fullKey.startsWith(Q)) ||
                                 (T.strippedKey !== null && T.strippedKey.startsWith(Q));
            if (!tokenMatched) {
              allMatched = false;
              break;
            }
          }
        }

        if (allMatched) {
          const slice = tTokens.slice(i, i + K);
          return {
            matched: true,
            matchedTokens: slice,
            matchedWordTokens: slice,
            matchStartIndex: i
          };
        }
      }

      if (rawQueryLower && textLower && textLower.includes(rawQueryLower)) {
        return { matched: true, matchedTokens: [rawQueryLower], matchedWordTokens: [rawQueryLower], matchStartIndex: 0 };
      }

      return { matched: false, matchedTokens: [], matchedWordTokens: [], matchStartIndex: -1 };
    }

    // Wildcard pattern matching with gap and word wildcard support
    const items = pattern.items;
    for (let startIdx = 0; startIdx < tInfos.length; startIdx++) {
      let tIdx = startIdx;
      let matched = true;
      const wordIndices = [];

      for (let pIdx = 0; pIdx < items.length; pIdx++) {
        const item = items[pIdx];
        if (item.type === 'gap') continue;

        const prevItem = pIdx > 0 ? items[pIdx - 1] : null;
        if (prevItem && prevItem.type === 'gap') {
          let found = false;
          while (tIdx < tInfos.length) {
            if (matchesToken(tInfos[tIdx], item)) {
              wordIndices.push(tIdx);
              tIdx++;
              found = true;
              break;
            }
            tIdx++;
          }
          if (!found) {
            matched = false;
            break;
          }
        } else {
          if (tIdx >= tInfos.length || !matchesToken(tInfos[tIdx], item)) {
            matched = false;
            break;
          }
          wordIndices.push(tIdx);
          tIdx++;
        }
      }

      if (matched && wordIndices.length === numWords) {
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

  function matchWithPrecomputedKeys(targetText, qKeysOrPattern, rawQuery) {
    if (!targetText || typeof targetText !== 'string' || !targetText.trim()) {
      return { matched: false, matchedTokens: [], matchedWordTokens: [], matchStartIndex: -1 };
    }
    if (!qKeysOrPattern) {
      return { matched: true, matchedTokens: [], matchedWordTokens: [], matchStartIndex: 0 };
    }

    const tTokens = tokenizeText(targetText);
    const tInfos = buildTargetTokenInfos(tTokens);
    const textLower = targetText.toLowerCase();
    const qLower = rawQuery ? rawQuery.trim().toLowerCase() : '';

    return matchTokenInfosWithKeys(tInfos, tTokens, textLower, qKeysOrPattern, qLower);
  }

  function matchContiguousPhoneticPhrase(targetText, query) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return { matched: true, matchedTokens: [], matchedWordTokens: [], matchStartIndex: 0 };
    }
    const pattern = compileQueryPattern(query);
    return matchWithPrecomputedKeys(targetText, pattern, query);
  }

  function matchesQueryPhonetic(targetText, query) {
    return matchContiguousPhoneticPhrase(targetText, query).matched;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function highlightMatchedCharacters(text, query) {
    if (!text) return '';
    if (!query || !query.trim()) return escapeHtml(text);

    const rawString = String(text);
    const matchRes = matchContiguousPhoneticPhrase(rawString, query);
    if (!matchRes.matched) {
      return escapeHtml(rawString);
    }

    const wordsToHighlight = (matchRes.matchedWordTokens && matchRes.matchedWordTokens.length > 0)
      ? matchRes.matchedWordTokens
      : matchRes.matchedTokens;

    if (wordsToHighlight && wordsToHighlight.length > 0) {
      const tokenRegexes = wordsToHighlight
        .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .filter(Boolean);

      if (tokenRegexes.length > 0) {
        // 1. If query does not use gap wildcards, try matching the contiguous phrase as a single highlight block
        if (!query.includes('*') && matchRes.matchedTokens && matchRes.matchedTokens.length > 0) {
          const phraseRegexes = matchRes.matchedTokens
            .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .filter(Boolean);
          const phrasePattern = phraseRegexes.join('[^a-zA-Z\\u0B80-\\u0BFF0-9]+');
          try {
            const phraseRegex = new RegExp(phrasePattern, 'gi');
            if (phraseRegex.test(rawString)) {
              return rawString.replace(phraseRegex, (m) => `<mark class="search-match-hl">${escapeHtml(m)}</mark>`);
            }
          } catch (e) {}
        }

        // 2. Highlight individual matched query words
        try {
          const wordRegex = new RegExp(tokenRegexes.join('|'), 'gi');
          return rawString.replace(wordRegex, (m) => `<mark class="search-match-hl">${escapeHtml(m)}</mark>`);
        } catch (e) {}
      }
    }

    // Fallback direct query match
    try {
      const qClean = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(qClean, 'gi');
      return rawString.replace(regex, (m) => `<mark class="search-match-hl">${escapeHtml(m)}</mark>`);
    } catch (e) {}

    return escapeHtml(rawString);
  }

  window.TamilPhonetic = {
    tokenizeText: tokenizeText,
    getSoundKey: getSoundKey,
    compileQueryPattern: compileQueryPattern,
    matchTokenInfosWithKeys: matchTokenInfosWithKeys,
    matchWithPrecomputedKeys: matchWithPrecomputedKeys,
    matchContiguousPhoneticPhrase: matchContiguousPhoneticPhrase,
    matchesQueryPhonetic: matchesQueryPhonetic,
    highlightMatchedCharacters: highlightMatchedCharacters
  };

})(typeof window !== 'undefined' ? window : this);
