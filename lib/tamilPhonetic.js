// ===========================================================================
// Tamil Phonetic Transliteration & Search Normalizer Engine
// Supports Anjal / Tanglish Romanized English -> Tamil Unicode & Tamil -> Tanglish
// ===========================================================================

// Standalone Tamil Vowels
const standaloneVowels = {
  'aa': 'ஆ', 'a': 'அ', 'A': 'ஆ',
  'ee': 'ஈ', 'ii': 'ஈ', 'i': 'இ', 'I': 'ஈ',
  'oo': 'ஊ', 'uu': 'ஊ', 'u': 'உ', 'U': 'ஊ',
  'ea': 'ஏ', 'ae': 'ஏ', 'ee': 'ஈ', 'e': 'எ', 'E': 'ஏ',
  'ai': 'ஐ', 'ay': 'ஐ', 'ey': 'ஐ',
  'oa': 'ஓ', 'oo': 'ஊ', 'o': 'ஒ', 'O': 'ஓ',
  'au': 'ஔ', 'ou': 'ஔ', 'ow': 'ஔ'
};

// Vowel Matras (attached to consonants)
const vowelMatras = {
  'aa': 'ா', 'a': '', 'A': 'ா',
  'ee': 'ீ', 'ii': 'ீ', 'i': 'ி', 'I': 'ீ',
  'oo': 'ூ', 'uu': 'ூ', 'u': 'ு', 'U': 'ூ',
  'ea': 'ே', 'ae': 'ே', 'e': 'ெ', 'E': 'ே',
  'ai': 'ை', 'ay': 'ை', 'ey': 'ை',
  'oa': 'ோ', 'o': 'ொ', 'O': 'ோ',
  'au': 'ௌ', 'ou': 'ௌ', 'ow': 'ௌ'
};

// Consonant Base Definitions (Consonant key -> Base Tamil consonant without virama)
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

// Special common Christian & devotional word expansions
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

/**
 * Transliterates an English phonetic word / phrase to Tamil Unicode
 */
export function englishToTamil(input)
{
  if (!input || typeof input !== 'string') return '';
  let str = input.trim();
  if (!str) return '';

  // Return if already Tamil
  if (/[\u0B80-\u0BFF]/.test(str))
  {
    return str;
  }

  // Pre-process direct dictionary words
  for (const [regex, rep] of directPhoneticReplacements)
  {
    if (regex.test(str))
    {
      str = str.replace(regex, rep);
    }
  }

  // Split into tokens preserving non-alphabet characters
  return str.split(/([A-Za-z]+)/).map(token =>
  {
    if (!/^[A-Za-z]+$/.test(token)) return token;
    return transliterateWord(token);
  }).join('');
}

function transliterateWord(word)
{
  let output = '';
  let i = 0;
  const len = word.length;

  while (i < len)
  {
    // Check if at the beginning of word or after vowel for standalone vowels
    const isStart = (i === 0);

    // Try multi-character consonant match
    let matchedConsonant = null;
    let matchedConsLen = 0;

    for (const c of consonants)
    {
      const sub = word.substr(i, c.key.length);
      // Case-sensitive check for uppercase N or exact match, otherwise lowercase
      if (sub === c.key || (c.key !== 'N' && c.key !== 'R' && c.key !== 'L' && c.key !== 'S' && sub.toLowerCase() === c.key.toLowerCase()))
      {
        matchedConsonant = c;
        matchedConsLen = c.key.length;
        break;
      }
    }

    if (matchedConsonant)
    {
      if (matchedConsonant.pure)
      {
        output += matchedConsonant.base;
        i += matchedConsLen;
        continue;
      }

      // Consonant matched. Check if followed by a vowel
      const nextIdx = i + matchedConsLen;
      let matchedVowelMatra = null;
      let matchedVowelLen = 0;

      // Sorted by length descending (e.g. 'aai', 'aee', 'aa', 'ee', etc.)
      const vowelKeys = ['aai', 'aae', 'aa', 'ee', 'ii', 'oo', 'uu', 'ea', 'ae', 'ai', 'ay', 'ey', 'oa', 'au', 'ou', 'ow', 'a', 'A', 'i', 'I', 'u', 'U', 'e', 'E', 'o', 'O'];

      for (const vk of vowelKeys)
      {
        const vSub = word.substr(nextIdx, vk.length);
        if (vSub.toLowerCase() === vk.toLowerCase())
        {
          matchedVowelMatra = vowelMatras[vk.toLowerCase()] !== undefined ? vowelMatras[vk.toLowerCase()] : (vowelMatras[vk] || '');
          matchedVowelLen = vk.length;
          break;
        }
      }

      if (matchedVowelMatra !== null)
      {
        // Special case: initial 'n' followed by vowel is 'ந', otherwise 'ன'
        let base = matchedConsonant.base;
        if (matchedConsonant.key === 'n')
        {
          base = (i === 0) ? 'ந' : 'ன';
        }

        output += base + matchedVowelMatra;
        i += matchedConsLen + matchedVowelLen;
      }
      else
      {
        // Consonant not followed by vowel -> Mei (pure consonant with pulli)
        let base = matchedConsonant.base;
        if (matchedConsonant.key === 'n')
        {
          base = (i === 0) ? 'ந்' : 'ன்';
        }
        else
        {
          base = base + '்';
        }
        output += base;
        i += matchedConsLen;
      }
      continue;
    }

    // Standalone vowel check (when not preceded by a consonant)
    let matchedStandaloneVowel = null;
    let matchedVowelLen = 0;
    const standaloneKeys = ['aai', 'aae', 'aa', 'ee', 'ii', 'oo', 'uu', 'ea', 'ae', 'ai', 'ay', 'ey', 'oa', 'au', 'ou', 'ow', 'a', 'A', 'i', 'I', 'u', 'U', 'e', 'E', 'o', 'O'];

    for (const vk of standaloneKeys)
    {
      const vSub = word.substr(i, vk.length);
      if (vSub.toLowerCase() === vk.toLowerCase())
      {
        matchedStandaloneVowel = standaloneVowels[vk.toLowerCase()] || standaloneVowels[vk];
        matchedVowelLen = vk.length;
        break;
      }
    }

    if (matchedStandaloneVowel)
    {
      output += matchedStandaloneVowel;
      i += matchedVowelLen;
      continue;
    }

    // Character not recognized in Tamil phonetic table, preserve it
    output += word[i];
    i++;
  }

  return output;
}

/**
 * Returns a list of search query variations (exact, Tamil transliterated, and common phonetic variants)
 */
export function getPhoneticVariations(query)
{
  if (!query || typeof query !== 'string') return [];
  const raw = query.trim();
  if (!raw) return [];

  const variations = new Set();
  variations.add(raw.toLowerCase());

  // If input is in English script, compute Tamil phonetic transliteration
  if (!/[\u0B80-\u0BFF]/.test(raw))
  {
    const tamil = englishToTamil(raw);
    if (tamil && tamil !== raw)
    {
      variations.add(tamil);
    }

    // Add alternate transliterations for common phonetic ambiguities (e.g. 'th' vs 't', 'd' vs 'th', 's' vs 'ch')
    const alt1 = raw.replace(/th/gi, 't');
    const alt2 = raw.replace(/\bt/gi, 'th');
    const alt3 = raw.replace(/d/gi, 'th');
    const alt4 = raw.replace(/s/gi, 'ch');
    const alt5 = raw.replace(/sh/gi, 's');

    [alt1, alt2, alt3, alt4, alt5].forEach(alt =>
    {
      if (alt !== raw)
      {
        const tAlt = englishToTamil(alt);
        if (tAlt) variations.add(tAlt);
      }
    });
  }
  else
  {
    // Input is in Tamil, also keep exact Tamil string
    variations.add(raw);
  }

  return Array.from(variations).filter(Boolean);
}

/**
 * Checks if a target text matches a query either directly or via Tamil phonetic transliteration
 */
export function matchesQueryPhonetic(targetText, query, variations = null)
{
  if (!targetText || !query) return false;
  const target = String(targetText).toLowerCase();
  const q = String(query).trim().toLowerCase();
  if (!q) return true;

  if (target.includes(q)) return true;

  const vars = variations || getPhoneticVariations(query);
  for (const v of vars)
  {
    if (v && target.includes(v.toLowerCase()))
    {
      return true;
    }
  }

  return false;
}

/**
 * Highlights matched characters in a text safely using <mark class="search-match-hl">
 */
export function highlightMatchedCharacters(text, query, variations = null)
{
  if (!text) return '';
  if (!query || !query.trim()) return escapeHtml(text);

  const vars = variations || getPhoneticVariations(query);
  // Sort variations by length descending to match longest substring first
  const sortedVars = vars.slice().sort((a, b) => b.length - a.length);

  // Build regex safely escaping special regex characters
  const escapedTerms = sortedVars
    .map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(Boolean);

  if (escapedTerms.length === 0) return escapeHtml(text);

  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
  const rawString = String(text);

  // Split and escape non-matched parts while marking matched parts
  const parts = rawString.split(regex);
  return parts.map(part =>
  {
    if (!part) return '';
    const isMatch = sortedVars.some(v => v.toLowerCase() === part.toLowerCase());
    if (isMatch)
    {
      return `<mark class="search-match-hl">${escapeHtml(part)}</mark>`;
    }
    return escapeHtml(part);
  }).join('');
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
  englishToTamil,
  getPhoneticVariations,
  matchesQueryPhonetic,
  highlightMatchedCharacters
};
