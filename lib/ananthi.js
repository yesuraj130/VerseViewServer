// Comprehensive Ananthi font to Unicode converter
export function ananthiToUnicode(text) {
  if (!text || typeof text !== 'string') return text;

  return text.split(/(<slide[^>]*>|<br\s*\/?>|\r?\n)/gi).map(segment => {
    if (/^<slide/i.test(segment) || /^<br/i.test(segment) || segment === '\n' || segment === '\r\n') return segment;
    if (!/[a-zA-Z;\[\]\\#\$%!\{\}\"]/.test(segment)) return segment;

    let s = segment;

    // Pre-normalization
    s = s.replaceAll("\\\\", "\\");

    // Grantha & Special ligatures
    s = s.replaceAll("n#h", "ஷோ");
    s = s.replaceAll("N#h", "ஷோ");
    s = s.replaceAll("b#h", "ஷொ");
    s = s.replaceAll("n#", "ஷே");
    s = s.replaceAll("N#", "ஷே");
    s = s.replaceAll("b#", "ஷெ");
    s = s.replaceAll("i#", "ஷை");
    s = s.replaceAll("#h", "ஷா");
    s = s.replaceAll("#P", "ஷீ");
    s = s.replaceAll("#p", "ஷி");
    s = s.replaceAll("#;", "ஷ்");
    s = s.replaceAll("#", "ஷ");

    s = s.replaceAll("n$h", "ஜோ");
    s = s.replaceAll("N$h", "ஜோ");
    s = s.replaceAll("b$h", "ஜொ");
    s = s.replaceAll("n$", "ஜே");
    s = s.replaceAll("N$", "ஜே");
    s = s.replaceAll("b$", "ஜெ");
    s = s.replaceAll("i$", "ஜை");
    s = s.replaceAll("$h", "ஜா");
    s = s.replaceAll("$P", "ஜீ");
    s = s.replaceAll("$p", "ஜி");
    s = s.replaceAll("$;", "ஜ்");
    s = s.replaceAll("$", "ஜ");

    s = s.replaceAll("n!h", "ஸோ");
    s = s.replaceAll("N!h", "ஸோ");
    s = s.replaceAll("b!h", "ஸொ");
    s = s.replaceAll("n!", "ஸே");
    s = s.replaceAll("N!", "ஸே");
    s = s.replaceAll("b!", "ஸெ");
    s = s.replaceAll("i!", "ஸை");
    s = s.replaceAll("!h", "ஸா");
    s = s.replaceAll("!P", "ஸீ");
    s = s.replaceAll("!p", "ஸி");
    s = s.replaceAll("!:;", "ஸ்");
    s = s.replaceAll("!:", "ஸ்");
    s = s.replaceAll("!;", "ஸ்");
    s = s.replaceAll("!", "ஸ்");

    // Special Ananthi combos
    s = s.replaceAll("h;", "ர்");
    s = s.replaceAll("hp", "ரி");
    s = s.replaceAll("hP", "ரீ");
    s = s.replaceAll("uh", "ரா");
    s = s.replaceAll("up", "ரி");
    s = s.replaceAll("uP", "ரீ");
    s = s.replaceAll("u;", "ர்");

    // N is சூ, Q is அ
    s = s.replaceAll("N", "சூ");
    s = s.replaceAll("Q", "அ");

    // o is டி, O is டீ
    s = s.replaceAll("oL", "டிடு");
    s = s.replaceAll("o", "டி");
    s = s.replaceAll("O", "டீ");

    // Malayalam / Ananthi nasal ligatures
    s = s.replaceAll("\";", "ஞ்");
    s = s.replaceAll("\"h", "ஞா");
    s = s.replaceAll("\"hd;", "ஞான்");
    s = s.replaceAll("\"';", "நாங்");
    s = s.replaceAll("\"';fs;", "நாங்கள்");
    s = s.replaceAll("';fs;", "ங்கள்");
    s = s.replaceAll("';f", "ங்க");
    s = s.replaceAll("';ny", "ங்லே");
    s = s.replaceAll("';", "ங்");
    s = s.replaceAll("\"", "");

    // Specific u and uu diacritics in Ananthi
    s = s.replaceAll("F+", "கூ");
    s = s.replaceAll("F", "கு");
    s = s.replaceAll("R+", "சூ");
    s = s.replaceAll("R", "சு");
    s = s.replaceAll("L+", "டூ");
    s = s.replaceAll("L", "டு");
    s = s.replaceAll("Z+", "ணூ");
    s = s.replaceAll("Z", "ணு");
    s = s.replaceAll("Jh", "தூ");
    s = s.replaceAll("J+", "தூ");
    s = s.replaceAll("J}", "தூ");
    s = s.replaceAll("J", "து");
    s = s.replaceAll("E+", "நூ");
    s = s.replaceAll("Eh", "நூ");
    s = s.replaceAll("E", "நு");
    s = s.replaceAll("g{", "பூ");
    s = s.replaceAll("g[", "பு");
    s = s.replaceAll("G+", "பூ");
    s = s.replaceAll("K+", "மூ");
    s = s.replaceAll("Kh", "மூ");
    s = s.replaceAll("K", "மு");
    s = s.replaceAll("a{", "யூ");
    s = s.replaceAll("a[", "யு");
    s = s.replaceAll("A+", "யூ");
    s = s.replaceAll("A", "யு");
    s = s.replaceAll("u{", "ரூ");
    s = s.replaceAll("U+", "ரூ");
    s = s.replaceAll("U", "ரு");
    s = s.replaceAll("&", "ரூ");
    s = s.replaceAll("Y}", "லூ");
    s = s.replaceAll("Yh", "லூ");
    s = s.replaceAll("Y", "லு");
    s = s.replaceAll("t{", "வூ");
    s = s.replaceAll("t[", "வு");
    s = s.replaceAll("T", "வு");
    s = s.replaceAll("H{", "ழூ");
    s = s.replaceAll("H[", "ழு");
    s = s.replaceAll("G", "ழு");
    s = s.replaceAll("S+", "ளூ");
    s = s.replaceAll("Sh", "ளூ");
    s = s.replaceAll("S", "ளு");
    s = s.replaceAll("W+", "றூ");
    s = s.replaceAll("Wh", "றூ");
    s = s.replaceAll("W", "று");
    s = s.replaceAll("D+", "னூ");
    s = s.replaceAll("Dh", "னூ");
    s = s.replaceAll("D", "னு");

    const consMap = {
      'f': 'க', 'q': 'ங', 'r': 'ச', 'l': 'ட', 'z': 'ண',
      'j': 'த', 'e': 'ந', 'g': 'ப', 'k': 'ம', 'a': 'ய',
      'u': 'ர', 'y': 'ல', 't': 'வ', 'H': 'ழ', 's': 'ள',
      'w': 'ற', 'd': 'ன'
    };

    // 1. Triple Kombu combinations (ஔ, ோ, ொ, ே, ெ, ை)
    for (const [c, tamilCons] of Object.entries(consMap)) {
      s = s.replaceAll(new RegExp(`b${c}s;?`, 'g'), tamilCons + 'ௌ');
      s = s.replaceAll(new RegExp(`n${c}h`, 'g'), tamilCons + 'ோ');
      s = s.replaceAll(new RegExp(`b${c}h`, 'g'), tamilCons + 'ொ');
      s = s.replaceAll(new RegExp(`n${c}`, 'g'), tamilCons + 'ே');
      s = s.replaceAll(new RegExp(`b${c}`, 'g'), tamilCons + 'ெ');
      s = s.replaceAll(new RegExp(`i${c}`, 'g'), tamilCons + 'ை');
    }

    // 2. Secondary vowels on consonants (ா, ி, ீ, ்)
    for (const [c, tamilCons] of Object.entries(consMap)) {
      s = s.replaceAll(new RegExp(`${c}h`, 'g'), tamilCons + 'ா');
      s = s.replaceAll(new RegExp(`${c}P`, 'g'), tamilCons + 'ீ');
      s = s.replaceAll(new RegExp(`${c}p`, 'g'), tamilCons + 'ி');
      s = s.replaceAll(new RegExp(`${c};`, 'g'), tamilCons + '்');
    }

    // 3. Base consonants
    for (const [c, tamilCons] of Object.entries(consMap)) {
      s = s.replaceAll(new RegExp(`${c}`, 'g'), tamilCons);
    }

    // Independent Vowels
    s = s.replaceAll("m", "அ");
    s = s.replaceAll("M", "ஆ");
    s = s.replaceAll(",", "இ");
    s = s.replaceAll("<", "ஈ");
    s = s.replaceAll("c", "உ");
    s = s.replaceAll("C", "ஊ");
    s = s.replaceAll("v", "எ");
    s = s.replaceAll("V", "ஏ");
    s = s.replaceAll("I", "ஐ");
    s = s.replaceAll("xs;", "ஔ");
    s = s.replaceAll("xs", "ஔ");
    s = s.replaceAll("x", "ஒ");
    s = s.replaceAll("X", "ஓ");
    s = s.replaceAll("/", "ஃ");

    // Trailing/standalone modifiers
    s = s.replaceAll("h", "ா");
    s = s.replaceAll(";", "்");
    s = s.replaceAll("*", "");
    s = s.replaceAll("{", "ூ");
    s = s.replaceAll("}", "ூ");
    s = s.replaceAll("[", "ு");
    s = s.replaceAll("]", "");

    // Clean any double pulli or trailing viramas
    s = s.replace(/்+/g, '்');
    // Clean internal semicolon
    s = s.replace(/([\u0B80-\u0BFF]);([\u0B80-\u0BFF])/g, '$1$2');
    s = s.replace(/([\u0B80-\u0BFF]);([\u0B80-\u0BFF])/g, '$1$2');

    return s;
  }).join('');
}

export default {
  ananthiToUnicode
};
