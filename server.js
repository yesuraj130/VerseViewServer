import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = 3000;
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// 1. Persistent SQLite Databases with WAL Mode
// ---------------------------------------------------------------------------
const smDbPath = path.join(dataDir, 'sm.db');
const smDb = new DatabaseSync(smDbPath);
smDb.exec('PRAGMA journal_mode = WAL;');
smDb.exec(`
  CREATE TABLE IF NOT EXISTS sm (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cat TEXT,
    lyrics TEXT NOT NULL,
    lyrics2 TEXT
  );
`);

const tamilDbPath = path.join(dataDir, 'tamil.db');
const tamilDb = new DatabaseSync(tamilDbPath);
tamilDb.exec('PRAGMA journal_mode = WAL;');
tamilDb.exec(`
  CREATE TABLE IF NOT EXISTS words (
    wordId INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    bookNum INTEGER NOT NULL,
    chNum INTEGER NOT NULL,
    verseNum INTEGER NOT NULL
  );
`);
tamilDb.exec('CREATE INDEX IF NOT EXISTS idx_tamil_lookup ON words (bookNum, chNum, verseNum);');

const kjvDbPath = path.join(dataDir, 'kjv.db');
const kjvDb = new DatabaseSync(kjvDbPath);
kjvDb.exec('PRAGMA journal_mode = WAL;');
kjvDb.exec(`
  CREATE TABLE IF NOT EXISTS words (
    wordId INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    bookNum INTEGER NOT NULL,
    chNum INTEGER NOT NULL,
    verseNum INTEGER NOT NULL
  );
`);
kjvDb.exec('CREATE INDEX IF NOT EXISTS idx_kjv_lookup ON words (bookNum, chNum, verseNum);');

// ---------------------------------------------------------------------------
// Seed Data if Tables are Empty
// ---------------------------------------------------------------------------
const songCountRow = smDb.prepare('SELECT COUNT(*) as count FROM sm').get();
if (!songCountRow || songCountRow.count === 0) {
  console.log('Seeding initial songs in sm.db...');
  const insertSong = smDb.prepare(
    'INSERT INTO sm (name, cat, lyrics, lyrics2) VALUES (?, ?, ?, ?)'
  );

  const seedSongs = [
    {
      name: 'Amazing Grace',
      cat: 'Hymns',
      lyrics: 'Amazing grace! How sweet the sound<BR>That saved a wretch like me!<BR>I once was lost, but now am found;<BR>Was blind, but now I see.<slide>\'Twas grace that taught my heart to fear,<BR>And grace my fears relieved;<BR>How precious did that grace appear<BR>The hour I first believed.<slide>Through many dangers, toils and snares,<BR>I have already come;<BR>\'Tis grace hath brought me safe thus far,<BR>And grace will lead me home.<slide>When we\'ve been there ten thousand years,<BR>Bright shining as the sun,<BR>We\'ve no less days to sing God\'s praise<BR>Than when we\'d first begun.',
      lyrics2: 'John Newton (1779)'
    },
    {
      name: '10,000 Reasons (Bless the Lord)',
      cat: 'Praise & Worship',
      lyrics: 'Bless the Lord, O my soul<BR>O my soul, worship His holy name<BR>Sing like never before, O my soul<BR>I\'ll worship Your holy name<slide>The sun comes up, it\'s a new day dawning<BR>It\'s time to sing Your song again<BR>Whatever may pass, and whatever lies before me<BR>Let me be singing when the evening comes<slide>Bless the Lord, O my soul<BR>O my soul, worship His holy name<BR>Sing like never before, O my soul<BR>I\'ll worship Your holy name<slide>You\'re rich in love, and You\'re slow to anger<BR>Your name is great, and Your heart is kind<BR>For all Your goodness I will keep on singing<BR>Ten thousand reasons for my heart to find<slide>And on that day when my strength is failing<BR>The end draws near and my time has come<BR>Still my soul will sing Your praise unending<BR>Ten thousand years and then forevermore',
      lyrics2: 'Matt Redman & Jonas Myrin'
    },
    {
      name: 'என் உயிரான இயேசு (En Uyirana Yesu)',
      cat: 'Tamil Worship',
      lyrics: 'என் உயிரான இயேசு என் உயிரோடு கலந்தீர்<BR>என் உயிரே நான் உம்மைத் துதிப்பேன்<BR>என் உயிரான உயிரான உயிரான இயேசுவே<slide>உலகம் என்னை வெறுத்தாலும்<BR>உறவுகள் என்னை மறந்தாலும்<BR>நீர் என்னை மறக்க மாட்டீர்<BR>என்னை என்றும் பிரிய மாட்டீர்<slide>என் உயிரான இயேசு என் உயிரோடு கலந்தீர்<BR>என் உயிரே நான் உம்மைத் துதிப்பேன்<BR>என் உயிரான உயிரான உயிரான இயேசுவே<slide>தாயின் கருவில் உருவான நாள் முதல்<BR>தாயை போல என்னை தேற்றினீர்<BR>தந்தையை போல தோளில் சுமந்தீர்<BR>நித்திய ஜீவன் எனக்கு அளித்தீர்',
      lyrics2: 'Tamil Christian Worship'
    },
    {
      name: 'Great Is Thy Faithfulness',
      cat: 'Hymns',
      lyrics: 'Great is Thy faithfulness, O God my Father<BR>There is no shadow of turning with Thee<BR>Thou changest not, Thy compassions, they fail not<BR>As Thou hast been Thou forever wilt be<slide>Great is Thy faithfulness!<BR>Great is Thy faithfulness!<BR>Morning by morning new mercies I see<BR>All I have needed Thy hand hath provided<BR>Great is Thy faithfulness, Lord, unto me!<slide>Summer and winter, and springtime and harvest<BR>Sun, moon and stars in their courses above<BR>Join with all nature in manifold witness<BR>To Thy great faithfulness, mercy and love<slide>Pardon for sin and a peace that endureth<BR>Thine own dear presence to cheer and to guide<BR>Strength for today and bright hope for tomorrow<BR>Blessings all mine, with ten thousand beside!',
      lyrics2: 'Thomas O. Chisholm (1923)'
    },
    {
      name: 'நன்றி சொல்லி உம்மை பாடுவேன் (Nandri Solli)',
      cat: 'Tamil Praise',
      lyrics: 'நன்றி சொல்லி உம்மை பாடுவேன்<BR>நல்லவரே உம்மை துதிப்பேன்<BR>என்னை வாழ வைக்கும் இயேசு ராஜா<BR>உம்மை உயர்த்தி உயர்த்தி பாடுவேன்<slide>ஆராதனை ஆராதனை<BR>அப்பா அப்பா உங்களுக்குத்தான்<BR>உயிர் உள்ள நாளெல்லாம் பாடுவேன்<BR>உம் நாமத்தை உயர்த்துவேன்<slide>பாவத்தில் வாழ்ந்த என்னை மீட்டவரே<BR>பரிசுத்த இரத்தத்தினால் கழுவினீரே<BR>புது வாழ்வு எனக்கு தந்தவரே<BR>புதிய பாடல் நாவினில் தந்தவரே<slide>வியாதிகள் வந்தபோது சுகமானீரே<BR>கண்ணீரின் பாதையிலே துணையானீரே<BR>காரிருள் வேளையிலும் வெளிச்சமானீர்<BR>காலமெல்லாம் என்னை காப்பவரே',
      lyrics2: 'Tamil Thanksgiving Hymn'
    },
    {
      name: 'How Great Thou Art',
      cat: 'Worship',
      lyrics: 'O Lord, my God, when I in awesome wonder<BR>Consider all the worlds Thy Hands have made<BR>I see the stars, I hear the rolling thunder<BR>Thy power throughout the universe displayed<slide>Then sings my soul, my Saviour God, to Thee<BR>How great Thou art, how great Thou art<BR>Then sings my soul, my Saviour God, to Thee<BR>How great Thou art, how great Thou art!<slide>When through the woods, and forest glades I wander<BR>And hear the birds sing sweetly in the trees<BR>When I look down, from lofty mountain grandeur<BR>And see the brook, and feel the gentle breeze<slide>When Christ shall come, with shout of acclamation<BR>And take me home, what joy shall fill my heart<BR>Then I shall bow in humble adoration<BR>And then proclaim: My God, how great Thou art!',
      lyrics2: 'Carl Boberg / Stuart K. Hine'
    },
    {
      name: 'உம்மை அல்லாமல் எனக்கு யாருண்டு (Ummai Allamal)',
      cat: 'Tamil Worship',
      lyrics: 'உம்மை அல்லாமல் எனக்கு யாருண்டு பரலோகத்தில்<BR>உம்மையன்றி வேறே விருப்பமில்லை பூலோகத்தில்<BR>இயேசுவே இயேசுவே என் ஆதரவு நீரே<slide>என் மாம்சமும் என் இதயமும் அழிந்து போகலாம்<BR>தேவனே என்றென்றைக்கும் என் கன்மலையானவர்<BR>இயேசுவே இயேசுவே என் பங்கும் சொத்தும் நீரே<slide>உம் சமூகமே எனக்கு ஆனந்த பாக்கியமே<BR>உம் பாதமே எனக்கு நித்திய இளைப்பாறுதலே<BR>இயேசுவே இயேசுவே என் வாழ்வும் நம்பிக்கையும் நீரே',
      lyrics2: 'Tamil Scripture Song - Psalm 73:25'
    }
  ];

  for (const s of seedSongs) {
    insertSong.run(s.name, s.cat, s.lyrics, s.lyrics2);
  }
}

// Seed Tamil Bible verses if empty
const tamilCountRow = tamilDb.prepare('SELECT COUNT(*) as count FROM words').get();
if (!tamilCountRow || tamilCountRow.count === 0) {
  console.log('Seeding initial Bible verses in tamil.db...');
  const insertTamil = tamilDb.prepare(
    'INSERT INTO words (word, bookNum, chNum, verseNum) VALUES (?, ?, ?, ?)'
  );

  const tamilVerses = [
    // John (Book 43) Chapter 3
    { bookNum: 43, chNum: 3, verseNum: 16, word: 'தேவன், தம்முடைய ஒரேபேறான குமாரனை விசுவாசிக்கிறவன் எவனோ அவன் கெட்டுப்போகாமல் நித்தியஜீவனை அடையும்படிக்கு, அவரைத் தந்தருளி, இவ்வளவாய் உலகத்தில் அன்புகூர்ந்தார்.' },
    { bookNum: 43, chNum: 3, verseNum: 17, word: 'உலகத்தை ஆக்கினைக்குள்ளாகத் தீர்க்கும்படி தேவன் தம்முடைய குமாரனை உலகத்தில் அனுப்பாமல், அவராலே உலகம் இரட்சிக்கப்படுவதற்காகவே அவரை அனுப்பினார்.' },
    // John Chapter 1
    { bookNum: 43, chNum: 1, verseNum: 1, word: 'ஆதியிலே வார்த்தை இருந்தது, அந்த வார்த்தை தேவனிடத்திலிருந்தது, அந்த வார்த்தை தேவனாயிருந்தது.' },
    { bookNum: 43, chNum: 1, verseNum: 2, word: 'அவர் ஆதியிலே தேவனோடிருந்தார்.' },
    { bookNum: 43, chNum: 1, verseNum: 3, word: 'சகலமும் அவர் மூலமாய் உண்டாயிற்று; உண்டானதொன்றும் அவராலேயல்லாமல் உண்டாகவில்லை.' },
    { bookNum: 43, chNum: 1, verseNum: 4, word: 'அவருக்குள் ஜீவன் இருந்தது, அந்த ஜீவன் மனுஷருக்கு ஒளியாயிருந்தது.' },
    { bookNum: 43, chNum: 1, verseNum: 14, word: 'அந்த வார்த்தை மாம்சமாகி, கிருபையினாலும் சத்தியத்தினாலும் நிறைந்தவராய், நமக்குள்ளே வாசம்பண்ணினார்; அவருடைய மகிமையைக் கண்டோம், அது பிதாவுக்கு ஒரேபேறானவருடைய மகிமைக்கு ஏற்ற மகிமையாகவே இருந்தது.' },
    // John Chapter 14
    { bookNum: 43, chNum: 14, verseNum: 1, word: 'உங்கள் இருதயம் கலங்காதிருப்பதாக; தேவனிடத்தில் விசுவாசமாயிருங்கள், என்னிடத்திலும் விசுவாசமாயிருங்கள்.' },
    { bookNum: 43, chNum: 14, verseNum: 6, word: 'அதற்கு இயேசு: நானே வழியும் சத்தியமும் ஜீவனுமாயிருக்கிறேன்; என்னாலேயல்லாமல் ஒருவனும் பிதாவினிடத்தில் வரான்.' },
    { bookNum: 43, chNum: 14, verseNum: 27, word: 'சமாதானத்தை உங்களுக்கு வைத்துப்போகிறேன், என்னுடைய சமாதானத்தையே உங்களுக்குக் கொடுக்கிறேன்; உலகம் கொடுக்கிறபிரகாரம் நான் உங்களுக்குக் கொடுக்கிறதில்லை. உங்கள் இருதயம் கலங்காமலும் பயப்படாமலும் இருப்பதாக.' },
    // Psalms (Book 19) Chapter 23
    { bookNum: 19, chNum: 23, verseNum: 1, word: 'கர்த்தர் என் மேய்ப்பராயிருக்கிறார்; நான் தாழ்ச்சியடையேன்.' },
    { bookNum: 19, chNum: 23, verseNum: 2, word: 'அவர் என்னைப் பசும்புல்லுள்ள இடங்களில் படுக்கப்பண்ணி, அமர்ந்த தண்ணீர்கள் அண்டையில் என்னைக் கொண்டுபோய் விடுகிறார்.' },
    { bookNum: 19, chNum: 23, verseNum: 3, word: 'அவர் என் ஆத்துமாவைத் தேற்றி, தம்முடைய நாமத்தினிமித்தம் என்னை நீதியின் பாதைகளில் நடத்துகிறார்.' },
    { bookNum: 19, chNum: 23, verseNum: 4, word: 'நான் மரண இருளின் பள்ளத்தாக்கிலே நடந்தாலும் பொல்லாப்புக்கு பயப்படேன்; தேவரீர் என்னோடேகூட இருக்கிறீர்; உமது கோலும் உமது தடியும் என்னைத் தேற்றும்.' },
    { bookNum: 19, chNum: 23, verseNum: 5, word: 'என் சத்துருக்களுக்கு முன்பாக நீர் எனக்கு ஒரு பந்தியை ஆயத்தப்படுத்தி, என் தலையை எண்ணெயினால் அபிஷேகம் பண்ணுகிறீர்; என் பாத்திரம் நிரம்பி வழிகிறது.' },
    { bookNum: 19, chNum: 23, verseNum: 6, word: 'என் ஜீவனுள்ள நாளெல்லாம் நன்மையும் கிருபையும் என்னைத் தொடரும்; நான் கர்த்தருடைய வீட்டிலே நீடித்த நாட்களாய் நிலைத்திருப்பேன்.' },
    // Psalms Chapter 121
    { bookNum: 19, chNum: 121, verseNum: 1, word: 'எனக்கு ஒத்தாசை வரும் பர்வதங்களுக்கு நேராக என் கண்களை ஏறெடுக்கிறேன்.' },
    { bookNum: 19, chNum: 121, verseNum: 2, word: 'வானத்தையும் பூமியையும் உண்டாக்கின கர்த்தரிடத்திலிருந்து எனக்கு ஒத்தாசை வரும்.' },
    { bookNum: 19, chNum: 121, verseNum: 8, word: 'கர்த்தர் உன் போக்கையும் உன் வரத்தையும் இதுமுதற்கொண்டு என்றென்றைக்கும் காப்பார்.' },
    // Genesis (Book 1) Chapter 1
    { bookNum: 1, chNum: 1, verseNum: 1, word: 'ஆதியிலே தேவன் வானத்தையும் பூமியையும் சிருஷ்டித்தார்.' },
    { bookNum: 1, chNum: 1, verseNum: 2, word: 'பூமியானது ஒழுங்கின்மையும் வெறுமையுமாயிருந்தது; ஆழத்தின்மேல் இருள் இருந்தது; தேவனுடைய ஆவியானவர் ஜலத்தின்மேல் அசைவாடிக்கொண்டிருந்தார்.' },
    { bookNum: 1, chNum: 1, verseNum: 3, word: 'தேவன்: வெளிச்சம் உண்டாகக்கடவது என்றார், வெளிச்சம் உண்டாயிற்று.' },
    // Proverbs (Book 20) Chapter 3
    { bookNum: 20, chNum: 3, verseNum: 5, word: 'உன் சுயபுத்தியின்மேல் சாயாமல், உன் முழு இருதயத்தோடும் கர்த்தரில் நம்பிக்கையாயிருந்து;' },
    { bookNum: 20, chNum: 3, verseNum: 6, word: 'உன் வழிகளிலெல்லாம் அவரை நினைத்துக்கொள்; அப்பொழுது அவர் உன் பாதைகளைச் செவ்வைப்படுத்துவார்.' },
    // Matthew (Book 40) Chapter 6
    { bookNum: 40, chNum: 6, verseNum: 9, word: 'நீங்கள் ஜெபம்பண்ணவேண்டிய விதமாவது: பரமண்டலங்களிலிருக்கிற எங்கள் பிதாவே, உம்முடைய நாமம் பரிசுத்தப்படுவதாக;' },
    { bookNum: 40, chNum: 6, verseNum: 10, word: 'உம்முடைய ராஜ்யம் வருவதாக; உம்முடைய சித்தம் பரமண்டலத்திலே செய்யப்படுகிறதுபோல பூமியிலேயும் செய்யப்படுவதாக;' },
    { bookNum: 40, chNum: 6, verseNum: 33, word: 'முதலாவது தேவனுடைய ராஜ்யத்தையும் அவருடைய நீதியையும் தேடுங்கள், அப்பொழுது இவைகளெல்லாம் உங்களுக்குக்கூடக் கொடுக்கப்படும்.' },
    // Romans (Book 45) Chapter 8
    { bookNum: 45, chNum: 8, verseNum: 28, word: 'அன்றியும், அவருடைய தீர்மானத்தின்படி அழைக்கப்பட்டவர்களாய் தேவனிடத்தில் அன்புகூருகிறவர்களுக்குச் சகலமும் நன்மைக்கு ஏதுவாக நடக்கிறதென்று அறிந்திருக்கிறோம்.' },
    { bookNum: 45, chNum: 8, verseNum: 31, word: 'இவைகளைக்குறித்து நாம் என்ன சொல்வோம்? தேவன் நம்முடைய பட்சத்திலிருந்தால் நமக்கு விரோதமாயிருப்பவன் யார்?' },
    // Philippians (Book 50) Chapter 4
    { bookNum: 50, chNum: 4, verseNum: 13, word: 'என்னைப் பலப்படுத்துகிற கிறிஸ்துவினாலே எல்லாவற்றையுஞ்செய்ய எனக்குப் பெலனுண்டு.' },
    // Revelation (Book 66) Chapter 21
    { bookNum: 66, chNum: 21, verseNum: 4, word: 'அவர்களுடைய கண்ணீர் யாவையும் தேவன் துடைப்பார்; இனி மரணமுமில்லை, துக்கமுமில்லை, அலறுதலுமில்லை, வருத்தமுமில்லை; முந்தினவைகள் ஒழிந்துபோயின என்று விளம்பினது.' }
  ];

  for (const v of tamilVerses) {
    insertTamil.run(v.word, v.bookNum, v.chNum, v.verseNum);
  }
}

// Seed KJV Bible verses if empty
const kjvCountRow = kjvDb.prepare('SELECT COUNT(*) as count FROM words').get();
if (!kjvCountRow || kjvCountRow.count === 0) {
  console.log('Seeding initial Bible verses in kjv.db...');
  const insertKjv = kjvDb.prepare(
    'INSERT INTO words (word, bookNum, chNum, verseNum) VALUES (?, ?, ?, ?)'
  );

  const kjvVerses = [
    // John (Book 43) Chapter 3
    { bookNum: 43, chNum: 3, verseNum: 16, word: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
    { bookNum: 43, chNum: 3, verseNum: 17, word: 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.' },
    // John Chapter 1
    { bookNum: 43, chNum: 1, verseNum: 1, word: 'In the beginning was the Word, and the Word was with God, and the Word was God.' },
    { bookNum: 43, chNum: 1, verseNum: 2, word: 'The same was in the beginning with God.' },
    { bookNum: 43, chNum: 1, verseNum: 3, word: 'All things were made by him; and without him was not any thing made that was made.' },
    { bookNum: 43, chNum: 1, verseNum: 4, word: 'In him was life; and the life was the light of men.' },
    { bookNum: 43, chNum: 1, verseNum: 14, word: 'And the Word was made flesh, and dwelt among us, (and we beheld his glory, the glory as of the only begotten of the Father,) full of grace and truth.' },
    // John Chapter 14
    { bookNum: 43, chNum: 14, verseNum: 1, word: 'Let not your heart be troubled: ye believe in God, believe also in me.' },
    { bookNum: 43, chNum: 14, verseNum: 6, word: 'Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.' },
    { bookNum: 43, chNum: 14, verseNum: 27, word: 'Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you. Let not your heart be troubled, neither let it be afraid.' },
    // Psalms (Book 19) Chapter 23
    { bookNum: 19, chNum: 23, verseNum: 1, word: 'The LORD is my shepherd; I shall not want.' },
    { bookNum: 19, chNum: 23, verseNum: 2, word: 'He maketh me to lie down in green pastures: he leadeth me beside the still waters.' },
    { bookNum: 19, chNum: 23, verseNum: 3, word: 'He restoreth my soul: he leadeth me in the paths of righteousness for his name\'s sake.' },
    { bookNum: 19, chNum: 23, verseNum: 4, word: 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.' },
    { bookNum: 19, chNum: 23, verseNum: 5, word: 'Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.' },
    { bookNum: 19, chNum: 23, verseNum: 6, word: 'Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.' },
    // Psalms Chapter 121
    { bookNum: 19, chNum: 121, verseNum: 1, word: 'I will lift up mine eyes unto the hills, from whence cometh my help.' },
    { bookNum: 19, chNum: 121, verseNum: 2, word: 'My help cometh from the LORD, which made heaven and earth.' },
    { bookNum: 19, chNum: 121, verseNum: 8, word: 'The LORD shall preserve thy going out and thy coming in from this time forth, and even for evermore.' },
    // Genesis (Book 1) Chapter 1
    { bookNum: 1, chNum: 1, verseNum: 1, word: 'In the beginning God created the heaven and the earth.' },
    { bookNum: 1, chNum: 1, verseNum: 2, word: 'And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters.' },
    { bookNum: 1, chNum: 1, verseNum: 3, word: 'And God said, Let there be light: and there was light.' },
    // Proverbs (Book 20) Chapter 3
    { bookNum: 20, chNum: 3, verseNum: 5, word: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.' },
    { bookNum: 20, chNum: 3, verseNum: 6, word: 'In all thy ways acknowledge him, and he shall direct thy paths.' },
    // Matthew (Book 40) Chapter 6
    { bookNum: 40, chNum: 6, verseNum: 9, word: 'After this manner therefore pray ye: Our Father which art in heaven, Hallowed be thy name.' },
    { bookNum: 40, chNum: 6, verseNum: 10, word: 'Thy kingdom come. Thy will be done in earth, as it is in heaven.' },
    { bookNum: 40, chNum: 6, verseNum: 33, word: 'But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.' },
    // Romans (Book 45) Chapter 8
    { bookNum: 45, chNum: 8, verseNum: 28, word: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.' },
    { bookNum: 45, chNum: 8, verseNum: 31, word: 'What shall we then say to these things? If God be for us, who can be against us?' },
    // Philippians (Book 50) Chapter 4
    { bookNum: 50, chNum: 4, verseNum: 13, word: 'I can do all things through Christ which strengtheneth me.' },
    // Revelation (Book 66) Chapter 21
    { bookNum: 66, chNum: 21, verseNum: 4, word: 'And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain: for the former things are passed away.' }
  ];

  for (const v of kjvVerses) {
    insertKjv.run(v.word, v.bookNum, v.chNum, v.verseNum);
  }
}

// Bible DB lookup helper
const bibleDbs = {
  'tamil.db': tamilDb,
  'kjv.db': kjvDb,
  'tamil': tamilDb,
  'kjv': kjvDb
};

function getBibleDb(versionIdOrDbFile) {
  return bibleDbs[versionIdOrDbFile] || tamilDb;
}

// ---------------------------------------------------------------------------
// 2. Authoritative Real-Time Global State
// ---------------------------------------------------------------------------
let currentState = {
  type: 'song',
  status: 'live', // 'live' | 'blank' | 'clear'
  title: 'Amazing Grace',
  reference: 'Hymns • Slide 1 of 4',
  lines: [
    'Amazing grace! How sweet the sound',
    'That saved a wretch like me!',
    'I once was lost, but now am found;',
    'Was blind, but now I see.'
  ],
  rawSlide: 'Amazing grace! How sweet the sound<BR>That saved a wretch like me!<BR>I once was lost, but now am found;<BR>Was blind, but now I see.',
  slideIndex: 1,
  totalSlides: 4,
  songId: 1,
  verseInfo: null,
  updatedAt: Date.now()
};

const connectedClients = new Map();

function broadcastState(senderSocket = null) {
  io.emit('display:update', currentState);
}

function broadcastStats() {
  let presenterCount = 0;
  let displayCount = 0;
  for (const role of connectedClients.values()) {
    if (role === 'presenter') presenterCount++;
    else if (role === 'display') displayCount++;
  }
  io.emit('stats:update', {
    presenters: presenterCount,
    displays: displayCount,
    total: connectedClients.size
  });
}

// ---------------------------------------------------------------------------
// 3. Socket.io Real-Time Synchronization ("Last-Click-Wins")
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  connectedClients.set(socket.id, 'viewer');
  broadcastStats();

  // Immediately send current active state upon connection
  socket.emit('display:update', currentState);

  socket.on('role:register', (data) => {
    if (data && (data.role === 'presenter' || data.role === 'display')) {
      connectedClients.set(socket.id, data.role);
      broadcastStats();
    }
  });

  socket.on('get:state', () => {
    socket.emit('display:update', currentState);
  });

  // Action: Present Slide (Song or Scripture)
  socket.on('action:present', (payload) => {
    if (!payload) return;
    const lines = Array.isArray(payload.lines)
      ? payload.lines
      : (payload.rawSlide ? payload.rawSlide.split('<BR>') : []);

    currentState = {
      ...currentState,
      type: payload.type || 'song',
      status: 'live',
      title: payload.title || '',
      reference: payload.reference || '',
      lines: lines,
      rawSlide: payload.rawSlide || lines.join('<BR>'),
      slideIndex: Number(payload.slideIndex) || 1,
      totalSlides: Number(payload.totalSlides) || 1,
      songId: payload.songId !== undefined ? payload.songId : null,
      verseInfo: payload.verseInfo || null,
      updatedAt: Date.now()
    };

    broadcastState();
  });

  // Action: Blank Screen (Toggle or set blank)
  socket.on('action:blank', (payload) => {
    if (payload && payload.force !== undefined) {
      currentState.status = payload.force ? 'blank' : 'live';
    } else {
      currentState.status = currentState.status === 'blank' ? 'live' : 'blank';
    }
    currentState.updatedAt = Date.now();
    broadcastState();
  });

  // Action: Clear Text (Toggle or set clear)
  socket.on('action:clear', (payload) => {
    if (payload && payload.force !== undefined) {
      currentState.status = payload.force ? 'clear' : 'live';
    } else {
      currentState.status = currentState.status === 'clear' ? 'live' : 'clear';
    }
    currentState.updatedAt = Date.now();
    broadcastState();
  });

  // Action: Show Slide (restore live view)
  socket.on('action:show', () => {
    currentState.status = 'live';
    currentState.updatedAt = Date.now();
    broadcastState();
  });

  socket.on('disconnect', () => {
    connectedClients.delete(socket.id);
    broadcastStats();
  });
});

// ---------------------------------------------------------------------------
// 4. Express Middlewares & REST API
// ---------------------------------------------------------------------------
app.use(express.json());

// API: Current Live State
app.get('/api/state', (req, res) => {
  res.json(currentState);
});

app.post('/api/state', (req, res) => {
  const payload = req.body;
  if (!payload) return res.status(400).json({ error: 'Missing body' });
  
  const lines = Array.isArray(payload.lines)
    ? payload.lines
    : (payload.rawSlide ? payload.rawSlide.split('<BR>') : []);

  currentState = {
    ...currentState,
    ...payload,
    lines,
    status: payload.status || 'live',
    updatedAt: Date.now()
  };

  broadcastState();
  res.json({ success: true, state: currentState });
});

// API: Songs (sm.db)
app.get('/api/songs', (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : '';
    const cat = req.query.cat ? String(req.query.cat).trim() : '';

    let sql = 'SELECT id, name, cat, lyrics, lyrics2 FROM sm';
    const params = [];
    const conditions = [];

    if (q) {
      conditions.push('(name LIKE ? OR lyrics LIKE ? OR lyrics2 LIKE ?)');
      const term = `%${q}%`;
      params.push(term, term, term);
    }
    if (cat && cat !== 'All') {
      conditions.push('cat = ?');
      params.push(cat);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY id DESC';

    const stmt = smDb.prepare(sql);
    const rows = stmt.all(...params);

    // Format songs and calculate slide count
    const songs = rows.map((r) => {
      const slides = r.lyrics ? r.lyrics.split('<slide>') : [];
      return {
        id: r.id,
        name: r.name,
        cat: r.cat || 'General',
        lyrics: r.lyrics,
        lyrics2: r.lyrics2 || '',
        slideCount: slides.length
      };
    });

    res.json(songs);
  } catch (err) {
    console.error('Error fetching songs:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/songs/:id', (req, res) => {
  try {
    const songId = Number(req.params.id);
    const stmt = smDb.prepare('SELECT id, name, cat, lyrics, lyrics2 FROM sm WHERE id = ?');
    const song = stmt.get(songId);

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const slides = (song.lyrics || '').split('<slide>').map((s, idx) => {
      return {
        slideIndex: idx + 1,
        rawSlide: s,
        lines: s.split('<BR>').map(l => l.trim()).filter(Boolean)
      };
    });

    res.json({
      ...song,
      slides,
      slideCount: slides.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/songs', (req, res) => {
  try {
    const { name, cat, lyrics, lyrics2 } = req.body;
    if (!name || !lyrics) {
      return res.status(400).json({ error: 'Name and lyrics are required' });
    }

    const stmt = smDb.prepare(
      'INSERT INTO sm (name, cat, lyrics, lyrics2) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(name.trim(), (cat || 'General').trim(), lyrics.trim(), (lyrics2 || '').trim());
    const newId = Number(result.lastInsertRowid);

    const created = smDb.prepare('SELECT id, name, cat, lyrics, lyrics2 FROM sm WHERE id = ?').get(newId);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/songs/:id', (req, res) => {
  try {
    const songId = Number(req.params.id);
    const { name, cat, lyrics, lyrics2 } = req.body;
    if (!name || !lyrics) {
      return res.status(400).json({ error: 'Name and lyrics are required' });
    }

    const stmt = smDb.prepare(
      'UPDATE sm SET name = ?, cat = ?, lyrics = ?, lyrics2 = ? WHERE id = ?'
    );
    stmt.run(name.trim(), (cat || 'General').trim(), lyrics.trim(), (lyrics2 || '').trim(), songId);

    const updated = smDb.prepare('SELECT id, name, cat, lyrics, lyrics2 FROM sm WHERE id = ?').get(songId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/songs/:id', (req, res) => {
  try {
    const songId = Number(req.params.id);
    const stmt = smDb.prepare('DELETE FROM sm WHERE id = ?');
    stmt.run(songId);
    res.json({ success: true, deletedId: songId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/categories', (req, res) => {
  try {
    const rows = smDb.prepare('SELECT DISTINCT cat FROM sm WHERE cat IS NOT NULL AND cat != "" ORDER BY cat').all();
    const categories = rows.map(r => r.cat);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Bible Metadata (version.json) & Lookup
app.get('/api/bible/versions', (req, res) => {
  try {
    const versionFile = path.join(dataDir, 'version.json');
    if (fs.existsSync(versionFile)) {
      const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      res.json(data.versions || []);
    } else {
      res.json([]);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bible/:version/books', (req, res) => {
  try {
    const versionId = req.params.version;
    const versionFile = path.join(dataDir, 'version.json');
    if (fs.existsSync(versionFile)) {
      const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      const ver = (data.versions || []).find(v => v.id === versionId || v.dbFile === versionId);
      if (ver) {
        return res.json({
          version: ver,
          books: ver.books.map((b, idx) => ({ bookNum: idx + 1, name: b }))
        });
      }
    }
    res.status(404).json({ error: 'Version not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bible/:version/chapters', (req, res) => {
  try {
    const versionId = req.params.version;
    const bookNum = Number(req.query.bookNum);
    if (!bookNum) return res.status(400).json({ error: 'bookNum query param required' });

    // Find db file
    let dbFile = 'tamil.db';
    const versionFile = path.join(dataDir, 'version.json');
    if (fs.existsSync(versionFile)) {
      const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      const ver = (data.versions || []).find(v => v.id === versionId || v.dbFile === versionId);
      if (ver) dbFile = ver.dbFile;
    }
    const db = getBibleDb(dbFile);

    const rows = db.prepare(
      'SELECT DISTINCT chNum FROM words WHERE bookNum = ? ORDER BY chNum'
    ).all(bookNum);

    const chapters = rows.map(r => r.chNum);
    res.json(chapters);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bible/:version/verses', (req, res) => {
  try {
    const versionId = req.params.version;
    const bookNum = Number(req.query.bookNum);
    const chNum = Number(req.query.chNum);
    if (!bookNum || !chNum) {
      return res.status(400).json({ error: 'bookNum and chNum required' });
    }

    let dbFile = 'tamil.db';
    const versionFile = path.join(dataDir, 'version.json');
    if (fs.existsSync(versionFile)) {
      const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      const ver = (data.versions || []).find(v => v.id === versionId || v.dbFile === versionId);
      if (ver) dbFile = ver.dbFile;
    }
    const db = getBibleDb(dbFile);

    const rows = db.prepare(
      'SELECT DISTINCT verseNum FROM words WHERE bookNum = ? AND chNum = ? ORDER BY verseNum'
    ).all(bookNum, chNum);

    const verses = rows.map(r => r.verseNum);
    res.json(verses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bible/:version/text', (req, res) => {
  try {
    const versionId = req.params.version;
    const bookNum = Number(req.query.bookNum);
    const chNum = Number(req.query.chNum);
    const verseNum = req.query.verseNum !== undefined ? Number(req.query.verseNum) : null;

    if (!bookNum || !chNum) {
      return res.status(400).json({ error: 'bookNum and chNum required' });
    }

    let dbFile = 'tamil.db';
    let versionName = 'Tamil Bible';
    let bookName = `Book ${bookNum}`;
    const versionFile = path.join(dataDir, 'version.json');
    if (fs.existsSync(versionFile)) {
      const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      const ver = (data.versions || []).find(v => v.id === versionId || v.dbFile === versionId);
      if (ver) {
        dbFile = ver.dbFile;
        versionName = ver.name;
        if (ver.books && ver.books[bookNum - 1]) {
          bookName = ver.books[bookNum - 1];
        }
      }
    }
    const db = getBibleDb(dbFile);

    let rows;
    if (verseNum) {
      rows = db.prepare(
        'SELECT wordId, word, bookNum, chNum, verseNum FROM words WHERE bookNum = ? AND chNum = ? AND verseNum = ? ORDER BY verseNum'
      ).all(bookNum, chNum, verseNum);
    } else {
      rows = db.prepare(
        'SELECT wordId, word, bookNum, chNum, verseNum FROM words WHERE bookNum = ? AND chNum = ? ORDER BY verseNum'
      ).all(bookNum, chNum);
    }

    res.json({
      version: versionId,
      versionName,
      bookNum,
      bookName,
      chNum,
      verseNum,
      verses: rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Quick Bible Search
app.get('/api/bible/:version/search', (req, res) => {
  try {
    const versionId = req.params.version;
    const q = req.query.q ? String(req.query.q).trim() : '';
    if (!q) return res.json([]);

    let dbFile = 'tamil.db';
    let bookList = [];
    const versionFile = path.join(dataDir, 'version.json');
    if (fs.existsSync(versionFile)) {
      const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      const ver = (data.versions || []).find(v => v.id === versionId || v.dbFile === versionId);
      if (ver) {
        dbFile = ver.dbFile;
        bookList = ver.books || [];
      }
    }
    const db = getBibleDb(dbFile);

    const rows = db.prepare(
      'SELECT wordId, word, bookNum, chNum, verseNum FROM words WHERE word LIKE ? LIMIT 50'
    ).all(`%${q}%`);

    const results = rows.map(r => {
      const bName = bookList[r.bookNum - 1] || `Book ${r.bookNum}`;
      return {
        ...r,
        bookName: bName,
        reference: `${bName} ${r.chNum}:${r.verseNum}`
      };
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Stats & System Info
app.get('/api/stats', (req, res) => {
  try {
    const songCount = smDb.prepare('SELECT COUNT(*) as count FROM sm').get().count;
    const tamilCount = tamilDb.prepare('SELECT COUNT(*) as count FROM words').get().count;
    const kjvCount = kjvDb.prepare('SELECT COUNT(*) as count FROM words').get().count;

    let presenterCount = 0;
    let displayCount = 0;
    for (const role of connectedClients.values()) {
      if (role === 'presenter') presenterCount++;
      else if (role === 'display') displayCount++;
    }

    res.json({
      songs: songCount,
      tamilVerses: tamilCount,
      kjvVerses: kjvCount,
      clients: {
        presenters: presenterCount,
        displays: displayCount,
        total: connectedClients.size
      },
      currentLive: {
        title: currentState.title,
        status: currentState.status,
        type: currentState.type
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 5. Static Files & Routing
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

// Explicit redirects for clean paths
app.get('/presenter', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'presenter', 'index.html'));
});

app.get('/display', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display', 'index.html'));
});

// Fallback to public index
app.get('*', (req, res) => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(publicIndex)) {
    res.sendFile(publicIndex);
  } else {
    res.redirect('/presenter');
  }
});

// ---------------------------------------------------------------------------
// 6. Start HTTP + Socket.io Server
// ---------------------------------------------------------------------------
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Church Presentation Server running at http://0.0.0.0:${PORT}`);
  console.log(`Presenter Console: http://0.0.0.0:${PORT}/presenter/`);
  console.log(`Display Output:    http://0.0.0.0:${PORT}/display/`);
});
