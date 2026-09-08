/**
 * Client-Side Bamini to Unicode Tamil Converter for VerseView
 */
(function(window) {
  function isTamilBibleFont(fontName) {
    if (!fontName || typeof fontName !== 'string') return false;
    return fontName.trim().toLowerCase() === 'tamil bible';
  }

  function isBaminiText(text, fontName) {
    if (!isTamilBibleFont(fontName)) return false;
    if (!text || typeof text !== 'string') return false;
    if (/[\u0B80-\u0BFF]/.test(text)) return false; // Already Tamil Unicode
    return true;
  }

  function baminiToUnicode(text) {
    if (!text || typeof text !== 'string') return '';
    if (/[\u0B80-\u0BFF]/.test(text)) return text;

    const segments = text.split(/(<BR>|<br\s*\/?>|<slide>|\n)/i);

    const converted = segments.map(function(segment) {
      if (/^<BR>$/i.test(segment) || /^<br\s*\/?>$/i.test(segment) || /^<slide>$/i.test(segment) || segment === '\n') {
        return segment;
      }

      let s = segment;

      s = s.replaceAll('my;NyY}ah', 'அல்லேலூயா');
      s = s.replaceAll('my;NyY+ah', 'அல்லேலூயா');
      s = s.replaceAll('my;NyYah', 'அல்லேலூயா');
      s = s.replaceAll('my;NyYh', 'அல்லேலூ');
      s = s.replaceAll(',NaRTf;F', 'இயேசுவுக்கு');
      s = s.replaceAll(',naRTf;F', 'இயேசுவுக்கு');
      s = s.replaceAll(',NaRt', 'இயேசுவ');
      s = s.replaceAll(',naRt', 'இயேசுவ');
      s = s.replaceAll(',NaRNt', 'இயேசுவே');
      s = s.replaceAll(',naRNt', 'இயேசுவே');
      s = s.replaceAll(',NaR', 'இயேசு');
      s = s.replaceAll(',naR', 'இயேசு');
      s = s.replaceAll('];Njhj;jhp', 'ஸ்தோத்தரி');
      s = s.replaceAll('];Njhj;jpuk;', 'ஸ்தோத்திரம்');
      s = s.replaceAll('];Njhj;jpu', 'ஸ்தோத்திர');

      s = s.replaceAll('h;', 'ர்');
      s = s.replaceAll('hp', 'ரி');
      s = s.replaceAll('hP', 'ரீ');
      s = s.replaceAll('u;', 'ர்');
      s = s.replaceAll('up', 'ரி');
      s = s.replaceAll('uP', 'ரீ');
      s = s.replaceAll('H;', 'ழ்');
      s = s.replaceAll('Hp', 'ழி');
      s = s.replaceAll('HP', 'ழீ');
      s = s.replaceAll('];', 'ஸ்');
      s = s.replaceAll('];N', 'ஸ்தே');
      s = s.replaceAll('];n', 'ஸ்தெ');
      s = s.replaceAll('];j', 'ஸ்த');

      const replacements = [
        ['$', 'ஸ்ரீ'],
        ['{', 'ஃ'],
        ['~', 'ஃ'],

        ['nfh', 'கொ'], ['nrh', 'சொ'], ['ngh', 'பொ'], ['neh', 'நொ'], ['njh', 'தொ'],
        ['nkh', 'மொ'], ['nth', 'வொ'], ['nuh', 'ரொ'], ['nyh', 'லொ'], ['nwh', 'றொ'],
        ['ndh', 'னொ'], ['nqh', 'ஙொ'], ['nQh', 'ஞொ'], ['nlh', 'டொ'], ['nzh', 'ணொ'],
        ['noh', 'ழொ'], ['nsh', 'ளொ'], ['n]h', 'ஜொ'], ['n[h', 'ஜொ'], ['n&h', 'ஹொ'], ['n*h', 'ஷொ'],

        ['Nfh', 'கோ'], ['Nrh', 'சோ'], ['Ngh', 'போ'], ['Neh', 'நோ'], ['Njh', 'தோ'],
        ['Nkh', 'மோ'], ['Nth', 'வோ'], ['Nuh', 'ரோ'], ['Nyh', 'லோ'], ['Nwh', 'றோ'],
        ['Ndh', 'னோ'], ['Nqh', 'ஙே'], ['NQh', 'ஞோ'], ['Nlh', 'டோ'], ['Nzh', 'ணோ'],
        ['Noh', 'ழோ'], ['Nsh', 'ளோ'], ['N]h', 'ஜோ'], ['N[h', 'ஜோ'], ['N&h', 'ஹோ'], ['N*h', 'ஷோ'],
        ['Nah', 'யோ'],

        ['nfs;', 'கௌ'], ['nrs;', 'சௌ'], ['ngs;', 'பௌ'], ['nes;', 'நௌ'], ['njs;', 'தௌ'],
        ['nks;', 'மௌ'], ['nts;', 'வௌ'], ['nus;', 'ரௌ'], ['nys;', 'லௌ'], ['nws;', 'றௌ'],
        ['nds;', 'னௌ'], ['nls;', 'டௌ'], ['nzs;', 'ணௌ'], ['nos;', 'ழௌ'], ['nss;', 'ளௌ'],
        ['nfs', 'கௌ'], ['nrs', 'சௌ'], ['ngs', 'பௌ'], ['nes', 'நௌ'], ['njs', 'தௌ'],
        ['nks', 'மௌ'], ['nts', 'வௌ'], ['nus', 'ரௌ'], ['nys', 'லௌ'], ['nws', 'றௌ'],
        ['nds', 'னௌ'], ['nls', 'டௌ'], ['nzs', 'ணௌ'], ['nos', 'ழௌ'], ['nss', 'ளௌ'],

        ['nf', 'கெ'], ['nr', 'செ'], ['ng', 'பெ'], ['ne', 'நெ'], ['nj', 'தெ'],
        ['nk', 'மெ'], ['nt', 'வெ'], ['nu', 'ரெ'], ['ny', 'லெ'], ['nw', 'றெ'],
        ['nd', 'னெ'], ['nq', 'ஙெ'], ['nQ', 'ஞெ'], ['nl', 'டெ'], ['nz', 'ணெ'],
        ['no', 'ழெ'], ['ns', 'ளெ'], ['na', 'யெ'], ['n]', 'ஜெ'], ['n[', 'ஜெ'], ['n&', 'ஹெ'], ['n*', 'ஷெ'],

        ['Nf', 'கே'], ['Nr', 'சே'], ['Ng', 'பே'], ['Ne', 'நே'], ['Nj', 'தே'],
        ['Nk', 'மே'], ['Nt', 'வே'], ['Nu', 'ரே'], ['Ny', 'லே'], ['Nw', 'றே'],
        ['Nd', 'னே'], ['Nq', 'ஙே'], ['NQ', 'ஞே'], ['Nl', 'டே'], ['Nz', 'ணே'],
        ['No', 'ழே'], ['Ns', 'ளே'], ['Na', 'யே'], ['N]', 'ஜே'], ['N[', 'ஜே'], ['N&', 'ஹே'], ['N*', 'ஷே'],

        ['if', 'கை'], ['ir', 'சை'], ['ig', 'பை'], ['ie', 'நை'], ['ij', 'தை'],
        ['ik', 'மை'], ['it', 'வை'], ['iu', 'ரை'], ['ih', 'ரை'], ['iy', 'லை'], ['iw', 'றை'],
        ['id', 'னை'], ['iq', 'ஙை'], ['iQ', 'ஞை'], ['il', 'டை'], ['iz', 'ணை'],
        ['io', 'ழை'], ['is', 'ளை'], ['ia', 'யை'], ['i]', 'ஜை'], ['i[', 'ஜை'], ['i&', 'ஹை'], ['i*', 'ஷை'],

        ['f;', 'க்'], ['q;', 'ங்'], ['r;', 'ச்'], ['Q;', 'ஞ்'], ['l;', 'ட்'],
        ['z;', 'ண்'], ['j;', 'த்'], ['e;', 'ந்'], ['g;', 'ப்'], ['k;', 'ம்'],
        ['a;', 'ய்'], ['y;', 'ல்'], ['t;', 'வ்'],
        ['o;', 'ழ்'], ['s;', 'ள்'], ['w;', 'ற்'], ['d;', 'ன்'],
        ['];', 'ஸ்'], ['[;', 'ஜ்'], ['*;', 'ஷ்'], ['&;', 'ஹ்'], ['#;', 'க்ஷ்'], ['%;', 'க்ஷ்'],

        ['F', 'கு'], ['T', 'கூ'],
        ['R+', 'சூ'], ['R{', 'சூ'], ['R', 'சு'],
        ['L+', 'டூ'], ['^', 'டூ'], ['L', 'டு'],
        ['Z+', 'ணூ'], ['Z', 'ணு'],
        ['J+', 'தூ'], ['J}', 'தூ'], ['Jh', 'தூ'], ['J', 'து'],
        ['E+', 'நூ'], ['E', 'நு'],
        ['G+', 'பூ'], ['g+', 'பூ'], ['G', 'பு'],
        ['K+', 'மூ'], ['k+', 'மூ'], ['%', 'மூ'], ['K', 'மு'],
        ['A+', 'யூ'], ['a+', 'யூ'], ['A', 'யு'],
        ['U+', 'ரூ'], ['u+', 'ரூ'], ['&', 'ரூ'], ['U', 'ரு'],
        ['Y}', 'லூ'], ['Y+', 'லூ'], ['Yh', 'லூ'], ['Y', 'லு'],
        ['T+', 'வூ'], ['T', 'வு'],
        ['O+', 'ழூ'], ['O', 'ழு'],
        ['S+', 'ளூ'], ['S}', 'ளூ'], ['Sh', 'ளூ'], ['S', 'ளு'],
        ['W+', 'றூ'], ['Wh', 'றூ'], ['W', 'று'],
        ['D+', 'னூ'], ['D', 'னு'],
        [']+', 'ஜூ'], ['[+', 'ஜூ'],

        ['fp', 'கி'], ['fP', 'கீ'],
        ['qp', 'ஙி'], ['qP', 'ஙீ'],
        ['rp', 'சி'], ['rP', 'சீ'],
        ['Qp', 'ஞி'], ['QP', 'ஞீ'],
        ['lp', 'டி'], ['lP', 'டீ'],
        ['b', 'டி'],  ['B', 'டீ'],
        ['zp', 'ணி'], ['zP', 'ணீ'],
        ['jp', 'தி'], ['jP', 'தீ'],
        ['ep', 'நி'], ['eP', 'நீ'],
        ['gp', 'பி'], ['gP', 'பீ'],
        ['kp', 'மி'], ['kP', 'மீ'],
        ['ap', 'யி'], ['aP', 'யீ'],
        ['yp', 'லி'], ['yP', 'லீ'],
        ['tp', 'வி'], ['tP', 'வீ'],
        ['op', 'ழி'], ['oP', 'ழீ'],
        ['sp', 'ளி'], ['sP', 'ளீ'],
        ['wp', 'றி'], ['wP', 'றீ'],
        ['dp', 'னி'], ['dP', 'னீ'],
        [']p', 'ஜி'], [']P', 'ஜீ'], ['[p', 'ஜி'], ['[P', 'ஜீ'],
        ['&p', 'ஹி'], ['&P', 'ஹீ'],
        ['*p', 'ஷி'], ['*P', 'ஷீ'],

        ['fh', 'கா'], ['qh', 'ஙா'], ['rh', 'சா'], ['Qh', 'ஞா'], ['lh', 'டா'],
        ['zh', 'ணா'], ['jh', 'தா'], ['eh', 'நா'], ['gh', 'பா'], ['kh', 'மா'],
        ['ah', 'யா'], ['uh', 'ரா'], ['yh', 'லா'], ['th', 'வா'], ['oh', 'ழா'],
        ['sh', 'ளா'], ['wh', 'றா'], ['dh', 'னா'],
        [']h', 'ஜா'], ['[h', 'ஜா'], ['&h', 'ஹா'], ['*h', 'ஷா'],

        ['xs;', 'ஔ'], ['xs', 'ஔ'],
        ['m', 'அ'], ['M', 'ஆ'], [',', 'இ'], ['<', 'ஈ'],
        ['c', 'உ'], ['C', 'ஊ'], ['v', 'எ'], ['V', 'ஏ'],
        ['I', 'ஐ'], ['x', 'ஒ'], ['X', 'ஓ'],

        ['f', 'க'], ['q', 'ங'], ['r', 'ச'], ['Q', 'ஞ'], ['l', 'ட'],
        ['z', 'ண'], ['j', 'த'], ['e', 'ந'], ['g', 'ப'], ['k', 'ம'],
        ['a', 'ய'], ['u', 'ர'], ['y', 'ல'], ['t', 'வ'], ['o', 'ழ'],
        ['s', 'ள'], ['w', 'ற'], ['d', 'ன'],
        ['H', 'ர்'],
        [']', 'ஜ'], ['[', 'ஜ'], ['*', 'ஷ'],

        ['>', ','],
      ];

      for (let i = 0; i < replacements.length; i++) {
        const item = replacements[i];
        s = s.replaceAll(item[0], item[1]);
      }

      return s;
    });

    return converted.join('');
  }

  window.isTamilBibleFont = isTamilBibleFont;
  window.isBaminiText = isBaminiText;
  window.baminiToUnicode = baminiToUnicode;
})(typeof window !== 'undefined' ? window : globalThis);
