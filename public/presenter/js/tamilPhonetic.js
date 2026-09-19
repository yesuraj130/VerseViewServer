// ===========================================================================
// Presenter Console — Client-Side Tamil Phonetic Transliteration & Highlighting
// ===========================================================================

(function(window) {
  'use strict';

  const standaloneVowels = {
    'aa': 'ஆ', 'a': 'அ', 'A': 'ஆ',
    'ee': 'ஈ', 'ii': 'ஈ', 'i': 'இ', 'I': 'ஈ',
    'oo': 'ஊ', 'uu': 'ஊ', 'u': 'உ', 'U': 'ஊ',
    'ea': 'ஏ', 'ae': 'ஏ', 'ee': 'ஈ', 'e': 'எ', 'E': 'ஏ',
    'ai': 'ஐ', 'ay': 'ஐ', 'ey': 'ஐ',
    'oa': 'ஓ', 'oo': 'ஊ', 'o': 'ஒ', 'O': 'ஓ',
    'au': 'ஔ', 'ou': 'ஔ', 'ow': 'ஔ'
  };

  const vowelMatras = {
    'aa': 'ா', 'a': '', 'A': 'ா',
    'ee': 'ீ', 'ii': 'ீ', 'i': 'ி', 'I': 'ீ',
    'oo': 'ூ', 'uu': 'ூ', 'u': 'ு', 'U': 'ூ',
    'ea': 'ே', 'ae': 'ே', 'e': 'ெ', 'E': 'ே',
    'ai': 'ை', 'ay': 'ை', 'ey': 'ை',
    'oa': 'ோ', 'o': 'ொ', 'O': 'ோ',
    'au': 'ௌ', 'ou': 'ௌ', 'ow': 'ௌ'
  };

  const consonants = [
    { key: 'shri', base: 'ஸ்ரீ', pure: true },
    { key: 'sree', base: 'ஸ்ரீ', pure: true },
    { key: 'sri', base: 'ஸ்ரீ', pure: true },
    { key: 'ksh', base: 'க்ஷ' },
    { key: 'ng', base: 'ங' },
    { key: 'nj', base: 'ஞ' },
    { key: 'gn', base: 'ஞ' },
    { key: 'ny', base: 'ஞ' },
    { key: 'th', base: 'த' },
    { key: 'dh', base: 'த' },
    { key: 'zh', base: 'ழ' },
    { key: 'sh', base: 'ஷ' },
    { key: 'ch', base: 'ச' },
    { key: 'nn', base: 'ண' },
    { key: 'rh', base: 'ற' },
    { key: 'k', base: 'க' },
    { key: 'g', base: 'க' },
    { key: 'c', base: 'ச' },
    { key: 's', base: 'ச' },
    { key: 'j', base: 'ஜ' },
    { key: 't', base: 'ட' },
    { key: 'd', base: 'ட' },
    { key: 'N', base: 'ண' },
    { key: 'n', base: 'ன' },
    { key: 'p', base: 'ப' },
    { key: 'b', base: 'ப' },
    { key: 'f', base: 'ப' },
    { key: 'm', base: 'ம' },
    { key: 'y', base: 'ய' },
    { key: 'r', base: 'ர' },
    { key: 'R', base: 'ற' },
    { key: 'l', base: 'ல' },
    { key: 'L', base: 'ள' },
    { key: 'z', base: 'ழ' },
    { key: 'Z', base: 'ழ' },
    { key: 'v', base: 'வ' },
    { key: 'w', base: 'வ' },
    { key: 'S', base: 'ஸ' },
    { key: 'h', base: 'ஹ' },
    { key: 'q', base: 'க' },
    { key: 'x', base: 'க்ஷ' }
  ];

  const directPhoneticReplacements = [
    [/\byesu\b/gi, 'இயேசு'],
    [/\byaesu\b/gi, 'இயேசு'],
    [/\biesu\b/gi, 'இயேசு'],
    [/\bjesus\b/gi, 'இயேசு'],
    [/\bkarthar\b/gi, 'கர்த்தர்'],
    [/\bkartharae\b/gi, 'கர்த்தரே'],
    [/\bkarthare\b/gi, 'கர்த்தரே'],
    [/\bkirubai\b/gi, 'கிருபை'],
    [/\bkirubaiye\b/gi, 'கிருபையே'],
    [/\bkirubaiyae\b/gi, 'கிருபையே'],
    [/\baaraadhanai\b/gi, 'ஆராதனை'],
    [/\baarathanai\b/gi, 'ஆராதனை'],
    [/\baradhanai\b/gi, 'ஆராதனை'],
    [/\barathanai\b/gi, 'ஆராதனை'],
    [/\bsthothiram\b/gi, 'ஸ்தோத்திரம்'],
    [/\bstothiram\b/gi, 'ஸ்தோத்திரம்'],
    [/\bthothiram\b/gi, 'தோத்திரம்'],
    [/\bhalleluya\b/gi, 'அல்லேலூயா'],
    [/\bhallelujah\b/gi, 'அல்லேலூயா'],
    [/\balleluya\b/gi, 'அல்லேலூயா'],
    [/\bthevan\b/gi, 'தேவன்'],
    [/\bdhevan\b/gi, 'தேவன்'],
    [/\bdevan\b/gi, 'தேவன்'],
    [/\bneer\b/gi, 'நீர்'],
    [/\bneere\b/gi, 'நீரே'],
    [/\bneerae\b/gi, 'நீரே'],
    [/\banbu\b/gi, 'அன்பு'],
    [/\banbe\b/gi, 'அன்பே'],
    [/\banbae\b/gi, 'அன்பே'],
    [/\bnandri\b/gi, 'நன்றி'],
    [/\bnanri\b/gi, 'நன்றி'],
    [/\bthuthi\b/gi, 'துதி'],
    [/\bthudhi\b/gi, 'துதி'],
    [/\bparaloga\b/gi, 'பரலோக'],
    [/\bparalogam\b/gi, 'பரலோகம்'],
    [/\brajave\b/gi, 'ராஜாவே'],
    [/\brajavae\b/gi, 'ராஜாவே']
  ];

  function englishToTamil(input) {
    if (!input || typeof input !== 'string') return '';
    let str = input.trim();
    if (!str) return '';

    if (/[\u0B80-\u0BFF]/.test(str)) {
      return str;
    }

    for (let i = 0; i < directPhoneticReplacements.length; i++) {
      const [regex, rep] = directPhoneticReplacements[i];
      if (regex.test(str)) {
        str = str.replace(regex, rep);
      }
    }

    return str.split(/([A-Za-z]+)/).map(token => {
      if (!/^[A-Za-z]+$/.test(token)) return token;
      return transliterateWord(token);
    }).join('');
  }

  function transliterateWord(word) {
    let output = '';
    let i = 0;
    const len = word.length;

    while (i < len) {
      let matchedConsonant = null;
      let matchedConsLen = 0;

      for (let cIdx = 0; cIdx < consonants.length; cIdx++) {
        const c = consonants[cIdx];
        const sub = word.substr(i, c.key.length);
        if (sub === c.key || (c.key !== 'N' && c.key !== 'R' && c.key !== 'L' && c.key !== 'S' && sub.toLowerCase() === c.key.toLowerCase())) {
          matchedConsonant = c;
          matchedConsLen = c.key.length;
          break;
        }
      }

      if (matchedConsonant) {
        if (matchedConsonant.pure) {
          output += matchedConsonant.base;
          i += matchedConsLen;
          continue;
        }

        const nextIdx = i + matchedConsLen;
        let matchedVowelMatra = null;
        let matchedVowelLen = 0;
        const vowelKeys = ['aai', 'aae', 'aa', 'ee', 'ii', 'oo', 'uu', 'ea', 'ae', 'ai', 'ay', 'ey', 'oa', 'au', 'ou', 'ow', 'a', 'A', 'i', 'I', 'u', 'U', 'e', 'E', 'o', 'O'];

        for (let vIdx = 0; vIdx < vowelKeys.length; vIdx++) {
          const vk = vowelKeys[vIdx];
          const vSub = word.substr(nextIdx, vk.length);
          if (vSub.toLowerCase() === vk.toLowerCase()) {
            matchedVowelMatra = vowelMatras[vk.toLowerCase()] !== undefined ? vowelMatras[vk.toLowerCase()] : (vowelMatras[vk] || '');
            matchedVowelLen = vk.length;
            break;
          }
        }

        if (matchedVowelMatra !== null) {
          let base = matchedConsonant.base;
          if (matchedConsonant.key === 'n') {
            base = (i === 0) ? 'ந' : 'ன';
          }
          output += base + matchedVowelMatra;
          i += matchedConsLen + matchedVowelLen;
        } else {
          let base = matchedConsonant.base;
          if (matchedConsonant.key === 'n') {
            base = (i === 0) ? 'ந்' : 'ன்';
          } else {
            base = base + '்';
          }
          output += base;
          i += matchedConsLen;
        }
        continue;
      }

      let matchedStandaloneVowel = null;
      let matchedVowelLen = 0;
      const standaloneKeys = ['aai', 'aae', 'aa', 'ee', 'ii', 'oo', 'uu', 'ea', 'ae', 'ai', 'ay', 'ey', 'oa', 'au', 'ou', 'ow', 'a', 'A', 'i', 'I', 'u', 'U', 'e', 'E', 'o', 'O'];

      for (let sIdx = 0; sIdx < standaloneKeys.length; sIdx++) {
        const vk = standaloneKeys[sIdx];
        const vSub = word.substr(i, vk.length);
        if (vSub.toLowerCase() === vk.toLowerCase()) {
          matchedStandaloneVowel = standaloneVowels[vk.toLowerCase()] || standaloneVowels[vk];
          matchedVowelLen = vk.length;
          break;
        }
      }

      if (matchedStandaloneVowel) {
        output += matchedStandaloneVowel;
        i += matchedVowelLen;
        continue;
      }

      output += word[i];
      i++;
    }

    return output;
  }

  function getPhoneticVariations(query) {
    if (!query || typeof query !== 'string') return [];
    const raw = query.trim();
    if (!raw) return [];

    const variations = new Set();
    variations.add(raw.toLowerCase());

    if (!/[\u0B80-\u0BFF]/.test(raw)) {
      const tamil = englishToTamil(raw);
      if (tamil && tamil !== raw) {
        variations.add(tamil);
      }

      const alt1 = raw.replace(/th/gi, 't');
      const alt2 = raw.replace(/\bt/gi, 'th');
      const alt3 = raw.replace(/d/gi, 'th');
      const alt4 = raw.replace(/s/gi, 'ch');
      const alt5 = raw.replace(/sh/gi, 's');

      [alt1, alt2, alt3, alt4, alt5].forEach(alt => {
        if (alt !== raw) {
          const tAlt = englishToTamil(alt);
          if (tAlt) variations.add(tAlt);
        }
      });
    } else {
      variations.add(raw);
    }

    return Array.from(variations).filter(Boolean);
  }

  function matchesQueryPhonetic(targetText, query, variations) {
    if (!targetText || !query) return false;
    const target = String(targetText).toLowerCase();
    const q = String(query).trim().toLowerCase();
    if (!q) return true;

    if (target.includes(q)) return true;

    const vars = variations || getPhoneticVariations(query);
    for (let i = 0; i < vars.length; i++) {
      const v = vars[i];
      if (v && target.includes(v.toLowerCase())) {
        return true;
      }
    }

    return false;
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

  function highlightMatchedCharacters(text, query, variations) {
    if (!text) return '';
    if (!query || !query.trim()) return escapeHtml(text);

    const vars = variations || getPhoneticVariations(query);
    const sortedVars = vars.slice().sort((a, b) => b.length - a.length);

    const escapedTerms = sortedVars
      .map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter(Boolean);

    if (escapedTerms.length === 0) return escapeHtml(text);

    const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
    const rawString = String(text);

    const parts = rawString.split(regex);
    return parts.map(part => {
      if (!part) return '';
      const isMatch = sortedVars.some(v => v.toLowerCase() === part.toLowerCase());
      if (isMatch) {
        return `<mark class="search-match-hl">${escapeHtml(part)}</mark>`;
      }
      return escapeHtml(part);
    }).join('');
  }

  window.TamilPhonetic = {
    englishToTamil: englishToTamil,
    getPhoneticVariations: getPhoneticVariations,
    matchesQueryPhonetic: matchesQueryPhonetic,
    highlightMatchedCharacters: highlightMatchedCharacters
  };

})(typeof window !== 'undefined' ? window : this);
