/* ============================================================================
   Wedding HQ — invite + RSVP engine  (Ilaria & Maxime)
   ----------------------------------------------------------------------------
   ONE Google Sheet runs the whole guest list. Bind this script to it
   (Extensions ▸ Apps Script) while logged into the wedding account, then run
   "Set up / repair the workbook" once — the script builds every tab, header,
   dropdown and dashboard formula itself. Nothing to import by hand.

   It does three jobs:

     1. INVITES OUT — reads the Guests tab and creates a personalised, on-brand
        Gmail DRAFT per guest (IT / FR / EN). You review each one and hit Send.
        Every guest's link carries a private token: .../Wedding/?g=k7m2qx
        Guests carry a Category (family / friends / work / …) and a Priority
        (A / B / C), so you can filter the sheet and invite one slice at a time.
        Each category gets its own RSVP deadline on the Deadlines tab — that
        date is what goes into that guest's email, in their own language.

     2. RSVPs IN  — deployed as a web app, it receives the site's RSVP form,
        logs every reply on the RSVP tab, and — matching on that token — writes
        the answer back onto the right guest's row automatically.

     3. THE PICTURE — a live Dashboard tab: headcount, shuttle seats, dietary
        needs, and exactly who still hasn't replied.

   Menu (appears after you reload the sheet):  💌 Wedding HQ
     • Set up / repair the workbook
     • Generate missing invite links
     • Create drafts — selected rows / filtered rows / all pending
     • Create reminder drafts — everyone past their own deadline
     • Send a test to me
     • Reset invite status — selected rows

   Deploy for RSVPs:  Deploy ▸ New deployment ▸ Web app
     Execute as: Me   ·   Who has access: Anyone
   Then paste the /exec URL into RSVP_ENDPOINT in site/js/main.js.
   ========================================================================== */

/* ----------------------------- CONFIG ------------------------------------ */
const CFG = {
  SITE_URL    : 'https://ilariaemaxime.com/',
  SENDER_NAME : 'Ilaria & Maxime',
  REPLY_TO    : 'maxime.ilaria@gmail.com',

  // Left empty on purpose — see sitePassword_() below. Never commit the real
  // password: this repository is public.
  PASSWORD    : '',

  // Deliberately the github.io address and not the custom domain: this URL
  // keeps working after ilariaemaxime.com is allowed to lapse. Only the script
  // ever fetches it — every image is embedded in the message before sending,
  // so a guest opening the invitation in 2030 is not fetching anything at all.
  IMG_BASE : 'https://matoui01.github.io/Wedding/assets/img/',
  IMG_CREST: 'email-crest.png',
  IMG_SPRIG: 'email-sprig.png',
  // The names, set in Pinyon Script and rendered to a PNG: Gmail strips <link>
  // web fonts, so as live text they fall back to Georgia and the design goes
  // with them. Built by tools/invites/assets/build-email-assets.py.
  IMG_MARK : 'email-wordmark.png',
  // The two display lines, per language. Same reason as the wordmark: Gmail
  // will not load Cormorant, and these are where the design lives.
  IMG_TAG  : function(l){ return 'email-tag-' + l + '.png'; },
  IMG_CLOSE: function(l){ return 'email-close-' + l + '.png'; },
  // The parts of the invitation that never change per guest — the header
  // (crest, names, tagline, date) and the facts table, one per language —
  // drawn from the site's own CSS by tools/invites/assets/render-pieces.js.
  // The invitation itself is drawn at send time: see mailBlob_.
  // Slides quietly ignores the page size asked for when a presentation is
  // created, so the invitation is drawn on a copy of a template whose size
  // was set once by hand. This is the name to look for in the Drive.
  TEMPLATE : 'Wedding HQ · invitation template',
  SCRATCH  : 'Wedding HQ · invitation (scratch)',
  IMG_HEAD : function(l){ return 'email-head-' + l + '.png'; },
  IMG_FACTS: function(l){ return 'email-facts-' + l + '.png'; },
  // Slides has no Jost and no letter-spacing at all, so every line that
  // depends on either is drawn in the browser and fetched as a picture. None
  // of them carries anything about a guest — the password stays live text,
  // because a public asset must never be the place it is written down.
  IMG_PWK  : function(l){ return 'email-pwk-' + l + '.png'; },
  IMG_BY   : function(l){ return 'email-by-' + l + '.png'; },
  IMG_CTA  : function(l){ return 'email-cta-' + l + '.png'; },
  // An email-weight copy of the hero — the site's own cut-out is 1.5 MB.
  IMG_HERO : 'email-estate.jpg',

  // Fallback deadline only — real per-category dates live on the Deadlines tab.
  RSVP_BY  : { it:'30 aprile 2027', fr:'30 avril 2027', en:'30 April 2027' },
  SUBJECT  : {
    it:'Ilaria & Maxime · Ci sposiamo a Firenze — siete invitati',
    fr:'Ilaria & Maxime · Nous nous marions à Florence — vous êtes invités',
    en:"Ilaria & Maxime · We're getting married in Florence — you're invited"
  },
  SUBJECT_R: {
    it:'Ilaria & Maxime · Un piccolo promemoria per il 23 luglio',
    fr:'Ilaria & Maxime · Un petit rappel pour le 23 juillet',
    en:'Ilaria & Maxime · A gentle reminder about 23 July'
  }
};

/* ------------------------- workbook shape -------------------------------- */
const SHEETS = { GUESTS:'Guests', RSVP:'RSVP', DEADLINES:'Deadlines', DASH:'Dashboard' };

/* Guests tab — columns A…AD. You fill A–P; the script writes Q–AD.
   One row = one invitation = one email.

   Children run on two tracks, because you need a planning number long before
   parents commit to one: "Kids est." is your own guess and feeds Seats, while
   "Children" is what the parents actually answered on the RSVP. Watching the
   two converge is how you know whether the estimate was any good. */
const GUEST_HEADER = [
  'Household', 'Invitee', 'Plus-one', 'Plus-one name', 'Kids?', 'Kids est.',
  'Category', 'Subcategory', 'Side', 'Priority', 'Send?', 'Wave',
  'Email', 'Language', 'Greeting', 'Personal note',
  'Seats', 'Token', 'Invite link', 'Reply by', 'Invite status', 'Invite sent',
  'Reminder sent', 'RSVP', 'Adults', 'Children', 'Coming', 'Diet', 'Shuttle', 'RSVP at'
];
const GUEST_FILL_COLS = 16;  // A–P are yours; Q onward is the script's

/* RSVP tab — the raw, append-only log. Every reply lands here, always. */
const RSVP_HEADER = [
  'Timestamp', 'Token', 'Matched guest', 'Name', 'Email', 'Attending', 'Phone',
  'Address', 'Party', 'Plus-one name', 'Children', "Children's names",
  'Diet', 'Shuttle', 'Staying', 'Message', 'Language'
];

/* Deadlines tab — one row per category, and the date it is asked to reply by.
   The "(default)" row covers anyone with no category set. */
const DEADLINE_HEADER = ['Category', 'Reply by', 'Notes'];

/* Seeded once, on a brand-new Deadlines tab — edit the dates in the sheet, not
   here. Also what the email preview harness renders, so the two can't drift. */
const DEADLINE_SEED = [
  ['Close Family',   [2027, 0, 31], 'Closest family — we need these numbers first, for the villa.'],
  ['Family',         [2027, 1, 28], 'Atoui and Baudoin sides.'],
  ['Family Friends', [2027, 2, 15], ''],
  ['Friends',        [2027, 2, 31], ''],
  ['(default)',      [2027, 3, 30], 'Used for any guest whose Category is blank or unlisted.']
];

/* The two axes you slice by. Category is the broad band; Subcategory is the
   circle inside it — which is what makes "everyone from Geneva" one click. */
const CATEGORIES = ['Close Family', 'Family', 'Family Friends', 'Friends'];
const SUBCATEGORIES = [
  'Atoui', 'Baudoin', 'Geneva', 'Geneva · Italian', 'Italy',
  'Prépa', 'Engineering school', 'Distant family'
];
const SIDES = ['Maxime', 'Ilaria', 'Common'];
const PRIORITIES = [1, 2, 3];

/* Send? is the lever for getting 143 seats down to the target. Nobody is
   deleted — held rows keep their history and can be promoted the moment
   somewhere else declines. */
const SEND_STATES = ['Send', 'Hold', 'Cut'];

const TARGET_CELL = 'B5';   // the headline target on the Dashboard, editable
const DEFAULT_TARGET = 100;

/* Month names, so a real date on the Deadlines tab renders in each guest's
   own language rather than as a raw cell value. */
const MONTHS = {
  it:['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'],
  fr:['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
  en:['January','February','March','April','May','June','July','August','September','October','November','December']
};

/* The site password is deliberately not in this file. The repository is
   public, and the site itself only stores a SHA-256 hash precisely so the
   password cannot be read out of it — writing it here in clear would undo
   that. Set it once in Apps Script:

     Project Settings ▸ Script properties ▸ Add script property
       SITE_PASSWORD = <the site password>

   Nothing else needs changing, and the email preview harness overrides it
   from its own field. */
function sitePassword_(){
  if(CFG.PASSWORD) return CFG.PASSWORD;          // preview harness / local override
  try {
    return PropertiesService.getScriptProperties().getProperty('SITE_PASSWORD') || 'XXXXXX';
  } catch(_){ return 'XXXXXX'; }
}

/* --------- palette / type (kept in sync with the site tokens) ------------ */
const T = {
  // three grounds, read as one object: the envelope (panna2) holds a mat
  // (panna) which holds the letter (carta). Paper is the lightest thing in
  // the frame, the way it is on a desk.
  carta:'#FDFBF5', panna:'#FAF6EC', panna2:'#F2EBD9', salvia:'#93A586', salviaDeep:'#6E7B5B',
  terracotta:'#C47A54', oro:'#B08D4F', ink:'#3D352A', muted:'#897C68',
  line:'#E4DCC9', lineGold:'#DCC9A4',
  fDisplay:"'Cormorant Garamond', 'Hoefler Text', Baskerville, 'Palatino Linotype', Palatino, Garamond, Georgia, serif",
  fBody:"'EB Garamond', 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Garamond, Georgia, serif",
  fUi:"'Jost', Futura, 'Century Gothic', 'Avenir Next', Avenir, 'Trebuchet MS', Helvetica, Arial, sans-serif",
  fScript:"'Pinyon Script', 'Cormorant Garamond', Georgia, cursive"
};


/* Apple Mail, iOS Mail and Outlook for Mac honour @font-face and will render
   the real faces. Gmail, Outlook for Windows and Yahoo strip it — no sender
   can make those load a web font, which is why the couple's names ship as an
   image and everything else falls down the stack below. */
const FACE_CSS =
"@font-face{font-family:'EB Garamond';font-style:normal;font-weight:400;src:url(https://fonts.gstatic.com/s/ebgaramond/v33/SlGDmQSNjdsmc35JDF1K5E55YMjF_7DPuGi-6_RUAw.ttf) format('truetype');}" +
"@font-face{font-family:'EB Garamond';font-style:italic;font-weight:400;src:url(https://fonts.gstatic.com/s/ebgaramond/v33/SlGFmQSNjdsmc35JDF1K5GRwUjcdlttVFm-rI7e8QI96.ttf) format('truetype');}" +
"@font-face{font-family:'Cormorant Garamond';font-style:normal;font-weight:400;src:url(https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_v86GnM.ttf) format('truetype');}" +
"@font-face{font-family:'Cormorant Garamond';font-style:italic;font-weight:400;src:url(https://fonts.gstatic.com/s/cormorantgaramond/v21/co3smX5slCNuHLi8bLeY9MK7whWMhyjYrGFEsdtdc62E6zd58jDOjw.ttf) format('truetype');}" +
"@font-face{font-family:'Jost';font-style:normal;font-weight:400;src:url(https://fonts.gstatic.com/s/jost/v20/92zPtBhPNqw79Ij1E865zBUv7myjJQVG.ttf) format('truetype');}" +
"@font-face{font-family:'Jost';font-style:normal;font-weight:500;src:url(https://fonts.gstatic.com/s/jost/v20/92zPtBhPNqw79Ij1E865zBUv7myRJQVG.ttf) format('truetype');}";

/* ------------------------- trilingual copy ------------------------------- */
const COPY = {
  it:{
    over:'VILLA CORSINI A MEZZOMONTE · FIRENZE', tag:'Ci sposiamo', date:'Venerdì 23 luglio 2027',
    body:'Insieme alle nostre famiglie, abbiamo la gioia di invitarvi a celebrare il nostro matrimonio. Ci sposiamo tra le colline di Firenze, a Villa Corsini a Mezzomonte: una giornata di festa fra giardini, arte e buon vino, con le persone che amiamo.',
    kDay:'Il giorno', vDay:'Venerdì 23 luglio 2027',
    kWhere:'Dove', vWhere:'Villa Corsini a Mezzomonte · Impruneta, Firenze',
    kDress:'Dress code', vDress:'Cocktail elegante',
    siteLead:'Programma, viaggio, regali e conferma di presenza sono tutti sul nostro sito.',
    pwk:'Password del sito', cta:'Apri il sito e rispondi', byLabel:'Rispondete entro il',
    by:d=>'Vi preghiamo di confermare entro il '+d+'.',
    close:'A presto,',
    fl:'Ilaria & Maxime · 23 luglio 2027 · Villa Corsini a Mezzomonte',
    fcLead:'Domande?',
    rTag:'Un piccolo promemoria',
    rBody:'Non abbiamo ancora ricevuto la vostra risposta per il 23 luglio 2027 a Villa Corsini a Mezzomonte. Ci farebbe davvero piacere sapere se ci sarete — bastano due minuti sul sito. E se avete già risposto, perdonateci il doppio messaggio!'
  },
  fr:{
    over:'VILLA CORSINI A MEZZOMONTE · FLORENCE', tag:'Nous nous marions', date:'Vendredi 23 juillet 2027',
    body:'Avec nos familles, nous avons la joie de vous inviter à célébrer notre mariage. Nous nous marions sur les collines de Florence, à la Villa Corsini a Mezzomonte : une journée de fête entre jardins, art et bon vin, avec ceux que nous aimons.',
    kDay:'Le jour', vDay:'Vendredi 23 juillet 2027',
    kWhere:'Lieu', vWhere:'Villa Corsini a Mezzomonte · Impruneta, Florence',
    kDress:'Tenue', vDress:'Cocktail élégant',
    siteLead:'Le programme, le voyage, les cadeaux et votre réponse sont sur notre site.',
    pwk:'Mot de passe du site', cta:'Ouvrir le site et répondre', byLabel:'Merci de répondre avant le',
    by:d=>'Merci de confirmer avant le '+d+'.',
    close:'À très bientôt,',
    fl:'Ilaria & Maxime · 23 juillet 2027 · Villa Corsini a Mezzomonte',
    fcLead:'Questions ?',
    rTag:'Un petit rappel',
    rBody:"Nous n'avons pas encore reçu votre réponse pour le 23 juillet 2027 à la Villa Corsini a Mezzomonte. Cela nous ferait vraiment plaisir de savoir si vous serez des nôtres — deux minutes sur le site suffisent. Et si vous avez déjà répondu, pardonnez-nous ce doublon !"
  },
  en:{
    over:'VILLA CORSINI A MEZZOMONTE · FLORENCE', tag:"We're getting married", date:'Friday · 23 July 2027',
    body:"Together with our families, we are delighted to invite you to celebrate our wedding. We're getting married in the hills of Florence, at Villa Corsini a Mezzomonte — a day of celebration among gardens, art and good wine, with the people we love.",
    kDay:'The day', vDay:'Friday 23 July 2027',
    kWhere:'Where', vWhere:'Villa Corsini a Mezzomonte · Impruneta, Florence',
    kDress:'Dress code', vDress:'Elegant cocktail',
    siteLead:'The programme, travel, gifts and your RSVP all live on our site.',
    pwk:'Site password', cta:'Open the site and RSVP', byLabel:'Kindly reply by',
    by:d=>'Kindly reply by '+d+'.',
    close:'See you soon,',
    fl:'Ilaria & Maxime · 23 July 2027 · Villa Corsini a Mezzomonte',
    fcLead:'Questions?',
    rTag:'A gentle reminder',
    rBody:"We haven't yet had your reply for 23 July 2027 at Villa Corsini a Mezzomonte. We'd love to know whether you can join us — it only takes two minutes on the site. And if you've already replied, do forgive the duplicate!"
  }
};

/* ======================= words shared with the renderer ================== */
/* >>> shared
   Everything between these two markers is plain JavaScript with no Apps
   Script in it: the words a guest is addressed with, and nothing else.
   tools/invites/preview/build-preview.py lifts exactly this text into the
   proof sheet, so what the preview says and what is sent cannot drift apart.
   Keep it that way: nothing here may touch CFG, COPY, SpreadsheetApp or any
   other global. */

const JOIN     = { it:' e ',   fr:' et ',   en:' and ' };
const PLURAL   = { it:'Cari ', fr:'Chers ', en:'Dear ' };
const FALLBACK = { it:'Cari tutti,', fr:'Chers tous,', en:'Dear all,' };

// French and Italian gender the singular ("Chère", "Caro"), and nothing on the
// row records a guest's gender. The ending of the first name decides, except
// for the common names where that rule is wrong.
const FEMININE = {
  it: ['irene','beatrice','alice','matilde','rachele','adele','noemi','agnese',
       'cloe','zoe','nives','ester','ines','carmen','miriam','sarah','giuditta'],
  fr: ['chantal','maud','margot','anais','anaïs','ingrid','karen','carmen',
       'meriem','maryam','sarah','ines','inès','agnes','agnès','marion','manon',
       'dolores','elisabeth','judith','ruth','edith','myriam','miriam','zeynep']
};
const MASCULINE = {
  it: ['andrea','luca','nicola','mattia','elia','tobia','simone','davide',
       'daniele','gabriele','emanuele','michele','giuseppe','pasquale',
       'raffaele','samuele','cesare','oreste','felice'],
  fr: ['maxime','theophile','théophile','jerome','jérôme','etienne','étienne',
       'pierre','alexandre','guillaume','jean-baptiste','antoine','philippe',
       'christophe','stephane','stéphane','jeremie','jérémie','come','côme',
       'hippolyte','timothee','timothée','barnabe','barnabé']
};

// said only to a guest whose plus-one is open — a named one is greeted instead
const PLUS_COPY = {
  it:'Saremo felici di accogliere anche il vostro accompagnatore.',
  fr:"Vous pouvez venir accompagné·e — nous serons ravis de l'accueillir.",
  en:"You're warmly invited to bring a plus-one."
};

function normLang_(v){ v = String(v || '').trim().toLowerCase().slice(0, 2); return (v === 'fr' || v === 'en' || v === 'it') ? v : 'it'; }
function normText_(s){ return String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').trim(); }
function truthy_(v){ v = String(v || '').trim().toLowerCase(); return v === 'yes' || v === 'y' || v === 'true' || v === '1' || v === 'si' || v === 'sì' || v === 'oui' || v === 'x'; }

// The people a letter is addressed to, as the Household cell names them —
// "Paul et Véro", "Thibault & Clara", "Zia Antonella" — because that cell is
// written the way the couple actually call them, where Invitee may carry a
// surname to tell two Thomases apart. A trailing initial ("Thomas J") is how
// the sheet tells them apart too, not how anyone is greeted. With no
// Household, the invitee and, if invited, the plus-one.
const SPLIT_NAMES = /\s*(?:&|\+|\bet\b|\be\b|\band\b)\s*/i;
// a Household still waiting for a real name — flagged, never printed quietly
const PLACEHOLDER = /\b(sa femme|son mari|son conjoint|sa conjointe|sa compagne|son compagnon|his wife|her husband|partner|moglie|marito|compagn[oa])\b/i;
function invitedPlus_(g){ return g.plusOne ? normText_(g.plusName) : ''; }
function addressees_(g){
  const hh = normText_(g.household);
  let names = hh ? hh.split(SPLIT_NAMES).map(normText_).filter(Boolean) : [];
  if(!names.length){
    names = [normText_(g.names)].filter(Boolean);
    const p = invitedPlus_(g);
    if(p) names.push(p);
  }
  return names.map(n => n.replace(/\s+[A-Za-z]\.?$/, ''));
}

// "Cari Sara e Riccardo," / "Chère Clara," — from the names on the row
function greetingFor_(names, lang){
  lang = normLang_(lang);
  if(!names.length) return FALLBACK[lang];
  const joined = names.length > 1
    ? names.slice(0, -1).join(', ') + JOIN[lang] + names[names.length - 1]
    : names[0];
  if(lang === 'en') return 'Dear ' + joined + ',';
  if(names.length > 1) return PLURAL[lang] + joined + ',';
  // one person, in French or Italian: the article has a gender and nothing
  // on the row records one, so the first name decides, hint lists first
  const first = names[0].split(' ')[0].toLowerCase();
  let fem;
  if(FEMININE[lang].indexOf(first) >= 0) fem = true;
  else if(MASCULINE[lang].indexOf(first) >= 0) fem = false;
  else fem = lang === 'fr' ? /[ae]$/.test(first) : /a$/.test(first);
  return (lang === 'fr' ? (fem ? 'Chère ' : 'Cher ') : (fem ? 'Cara ' : 'Caro ')) + joined + ',';
}

// What the Greeting cell says — whether the =GREETING() formula put it there
// or you typed over it — and, only if the cell is empty, what the names give.
function greetingOf_(g){ return normText_(g.greeting) || greetingFor_(addressees_(g), g.lang); }

// 'typed' when the cell holds your own words; otherwise 'guessed' when a
// gender had to be guessed, 'placeholder' when "sa femme" still stands in for
// a name — the rows worth a look before sending. '' when nothing to flag.
function greetingDoubtful_(g){
  const names = addressees_(g);
  const auto = greetingFor_(names, g.lang);
  const cell = normText_(g.greeting);
  if(cell && cell !== auto) return PLACEHOLDER.test(cell) ? 'placeholder' : 'typed';
  if(names.some(n => PLACEHOLDER.test(n))) return 'placeholder';
  return (normLang_(g.lang) !== 'en' && names.length === 1) ? 'guessed' : '';
}

// The open-plus-one sentence — or nothing: a couple already named in the
// greeting ("Chers Paul et Véro,") is not being offered a third.
function plusLine_(g){
  if(!g.plusOne || addressees_(g).length > 1) return '';
  return PLUS_COPY[normLang_(g.lang)];
}

/* <<< shared */

/**
 * The greeting a letter opens with, from the names in Household and the
 * language — "Cari Sara e Riccardo," "Chère Clara," "Dear Rachid and Sara,".
 * The Greeting column holds =GREETING($A2;$N2;$B2;$C2;$D2) on every row; type
 * over it on any row that needs its own words, and that is what the letter
 * will say.
 *
 * @param {string} household The Household cell, e.g. "Paul et Véro".
 * @param {string} language  it · fr · en
 * @param {string} [invitee] Used only when Household is empty.
 * @param {string} [plusOne] yes/no — used only with invitee.
 * @param {string} [plusName] The plus-one's name — used only with invitee.
 * @return {string} The greeting, comma included.
 * @customfunction
 */
function GREETING(household, language, invitee, plusOne, plusName){
  const g = { household: household, names: invitee, plusOne: truthy_(plusOne),
              plusName: plusName, lang: language, greeting: '' };
  return greetingFor_(addressees_(g), g.lang);
}

/* Column letters are derived, never typed: every formula below asks
   GUEST_HEADER where a column actually is. Inserting a column then costs
   nothing, where a hard-coded "!V2:V" would quietly start reading its
   neighbour. */
/* Column positions come from the header row as it is, not from GUEST_HEADER's
   order — columns get dragged around, and a formula pointing at the wrong one
   is the kind of bug that counts the wrong thing without a word. */
let HEADER_ = null;
function liveHeader_(){
  if(HEADER_) return HEADER_;
  const sh = book_().getSheetByName(SHEETS.GUESTS);
  const n = sh ? sh.getLastColumn() : 0;
  const keys = n ? sh.getRange(1, 1, 1, n).getValues()[0].map(canon_) : [];
  HEADER_ = keys.some(k => k) ? keys : GUEST_HEADER.map(h => h.toLowerCase());
  return HEADER_;
}
function colIndex_(name){
  const i = liveHeader_().indexOf(String(name).toLowerCase());
  if(i < 0) throw new Error('Guests has no "' + name + '" column — run "Set up / repair the workbook"');
  return i + 1;
}
function colLetter_(name){
  let n = colIndex_(name), out = '';
  while(n > 0){ const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

/* Formulas written by a script must use this sheet's own argument separator:
   "," in an English sheet, ";" where the decimal mark is a comma (an Italian
   or French one) — and there, columns inside {…} are split by "\" instead.
   Found out once, on a scratch cell, rather than assumed from the locale.
   Templates below write § for the argument separator and ¦ for the array one. */
let SEP_ = null;
function sep_(){
  if(SEP_) return SEP_;
  const ss = book_();
  const sh = ss.getSheetByName(SHEETS.DEADLINES) || ss.getSheetByName(SHEETS.DASH) || ss.getSheets()[0];
  const probe = sh.getRange('Z100');
  try {
    probe.setFormula('=IF(1=1;7;0)');
    SpreadsheetApp.flush();
    SEP_ = probe.getDisplayValue() === '7' ? ';' : ',';
  } catch(_){ SEP_ = ','; }
  finally { probe.clearContent(); }
  return SEP_;
}
function f_(tpl){
  const sp = sep_();
  return tpl.replace(/§/g, sp).replace(/¦/g, sp === ';' ? '\\' : ',');
}
function gCol_(name){ const L = colLetter_(name); return SHEETS.GUESTS + '!' + L + '2:' + L; }
function gA1_(name){ const L = colLetter_(name); return L + '2:' + L; }

/* =============================== MENU ==================================== */
function onOpen(){
  SpreadsheetApp.getUi().createMenu('💌 Wedding HQ')
    .addItem('Set up / repair the workbook',   'setupWorkbook')
    .addSeparator()
    .addItem('Make invite links for new rows',  'prepareGuests')
    .addItem('Review greetings — as they will be drawn', 'reviewGreetings')
    .addItem('Send this invitation now',       'sendSelectedRowNow')
    .addItem('Preview this row’s invitation — to my inbox', 'previewSelectedCard')
    .addSeparator()
    .addItem('Create drafts — selected rows',  'createDraftsForSelected')
    .addItem('Create drafts — filtered rows',  'createDraftsForFiltered')
    .addItem('Create drafts — a whole wave…',  'createDraftsForWave')
    .addSeparator()
    .addItem('Create reminder drafts — past their deadline', 'createReminders')
    .addSeparator()
    .addItem('Send a test to me',              'sendTestToMe')
    .addItem('Reset invite status — selected rows', 'resetSelectedStatus')
    .addItem('Clean up leftover scratch files', 'cleanUpScratch')
    .addToUi();
}

/* ============================ 1. SETUP =================================== */
/* Idempotent: safe to run any time. Creates missing tabs, repairs headers and
   formatting, and never touches guest data you've already typed. */
function setupWorkbook(){
  const ss = book_();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());

  buildDeadlines_(ss);   // first — the Guests category dropdown reads from it
  buildGuests_(ss);
  buildRsvp_(ss);
  buildDashboard_(ss);

  ss.setActiveSheet(ss.getSheetByName(SHEETS.DASH));
  toast_('Workbook ready. Fill in Guests, then run "Prepare guests — invite links & greetings".');
}

/* --- Deadlines: one row per category, with the date it must reply by ------ */
function buildDeadlines_(ss){
  const sh = ss.getSheetByName(SHEETS.DEADLINES) || ss.insertSheet(SHEETS.DEADLINES, 1);
  sh.getRange(1, 1, 1, DEADLINE_HEADER.length).setValues([DEADLINE_HEADER]);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, DEADLINE_HEADER.length)
    .setBackground(T.oro).setFontColor('#FFFFFF').setFontWeight('bold').setVerticalAlignment('middle');
  sh.setRowHeight(1, 34);
  [200, 140, 440].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.getRange('B2:B').setNumberFormat('d mmmm yyyy');

  if(sh.getLastRow() < 2){
    sh.getRange(2, 1, DEADLINE_SEED.length, 3).setValues(
      DEADLINE_SEED.map(r => [r[0], new Date(r[1][0], r[1][1], r[1][2]), r[2]]));
  }
  sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), 1).setFontWeight('bold');
  return sh;
}

function buildGuests_(ss){
  const sh = ss.getSheetByName(SHEETS.GUESTS) || ss.insertSheet(SHEETS.GUESTS, 0);
  // A fresh sheet gets the full header. An existing one keeps its columns in
  // whatever order you have put them, and only gains the ones it lacks.
  const n = sh.getLastColumn();
  const have = n ? sh.getRange(1, 1, 1, n).getValues()[0].map(canon_) : [];
  if(!have.some(k => k)){
    sh.getRange(1, 1, 1, GUEST_HEADER.length).setValues([GUEST_HEADER]);
  } else {
    const missing = GUEST_HEADER.filter(h => have.indexOf(h.toLowerCase()) < 0);
    if(missing.length) sh.getRange(1, n + 1, 1, missing.length).setValues([missing]);
  }
  HEADER_ = null;
  const cols = sh.getLastColumn();
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);

  // the columns you fill, and the ones the script writes — tinted so nobody
  // types into the latter — told apart by name, wherever they sit
  const yours = GUEST_HEADER.slice(0, GUEST_FILL_COLS).map(h => h.toLowerCase());
  const widths = { household:190, invitee:150, 'plus-one':80, 'plus-one name':140, 'kids?':70,
    'kids est.':80, side:80, category:130, subcategory:150, priority:70, 'send?':70, wave:60,
    email:230, language:90, greeting:190, 'personal note':250, seats:60, token:80,
    'invite link':290, 'reply by':110, 'invite status':120, 'invite sent':110,
    'reminder sent':110, rsvp:70, adults:70, children:70, coming:70, diet:190, shuttle:80,
    'rsvp at':130 };
  liveHeader_().forEach((k, i) => {
    if(!k) return;
    const head = sh.getRange(1, i + 1);
    if(yours.indexOf(k) >= 0){
      head.setBackground(T.salvia).setFontColor('#FFFFFF').setFontWeight('bold').setFontStyle('normal');
    } else {
      head.setBackground(T.panna2).setFontColor(T.muted).setFontWeight('bold').setFontStyle('italic');
      sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setBackground('#FCFAF4');
    }
    if(widths[k]) sh.setColumnWidth(i + 1, widths[k]);
  });
  sh.getRange(1, 1, 1, cols).setVerticalAlignment('middle');
  sh.setRowHeight(1, 34);

  const list = (vals, strict) => SpreadsheetApp.newDataValidation()
    .requireValueInList(vals, true).setAllowInvalid(!strict).build();
  const R = (name) => sh.getRange(gA1_(name));
  R('Plus-one').setDataValidation(list(['yes', 'no'], true));
  R('Kids?').setDataValidation(list(['yes', 'no'], true));
  R('Category').setDataValidation(list(CATEGORIES, false));
  R('Subcategory').setDataValidation(list(SUBCATEGORIES, false));
  R('Side').setDataValidation(list(SIDES, false));
  R('Priority').setDataValidation(list(PRIORITIES, false));
  R('Send?').setDataValidation(list(SEND_STATES, true));
  R('Language').setDataValidation(list(['it', 'fr', 'en'], true));

  R('Reply by').setNumberFormat('d mmm yyyy');

  // Seats you are planning for: the invitee, a plus-one if they have one, and
  // your own estimate of their children. One formula that grows with the
  // list — unless someone has typed real numbers into the column, which win.
  const seats = sh.getRange(2, colIndex_('Seats'), Math.max(sh.getLastRow() - 1, 1), 1);
  const typed = seats.getValues().some((r, k) => r[0] !== '' && !seats.getFormulas()[k][0]);
  if(!typed){
    seats.clearContent();
    sh.getRange(colLetter_('Seats') + '2').setFormula(f_(
      '=ARRAYFORMULA(IF(' + gA1_('Invitee') + '=""§""§' +
      '1+IF(LOWER(' + gA1_('Plus-one') + ')="yes"§1§0)+N(' + gA1_('Kids est.') + ')))'));
  }

  const rule = () => SpreadsheetApp.newConditionalFormatRule();
  sh.setConditionalFormatRules([
    // the RSVP answer
    rule().whenTextEqualTo('Yes').setBackground('#E4EBDE').setFontColor(T.salviaDeep)
      .setRanges([R('RSVP')]).build(),
    rule().whenTextEqualTo('No').setBackground('#F6E6DE').setFontColor(T.terracotta)
      .setRanges([R('RSVP')]).build(),
    // the send decision — held and cut rows should read as set aside
    rule().whenTextEqualTo('Hold').setBackground('#F4EEDD').setFontColor(T.oro)
      .setRanges([R('Send?')]).build(),
    rule().whenTextEqualTo('Cut').setBackground('#EDEAE4').setFontColor(T.muted)
      .setRanges([R('Send?')]).build(),
    // a guest with no email can never be invited — make that impossible to miss
    rule().whenFormulaSatisfied(f_('=AND($' + colLetter_('Invitee') + '2<>""§$' + colLetter_('Email') + '2="")'))
      .setBackground('#F6E6DE').setRanges([R('Email')]).build(),
    // your estimate versus what the parents actually said
    rule().whenFormulaSatisfied(f_('=AND($' + colLetter_('RSVP') + '2<>""§$' +
        colLetter_('Children') + '2<>$' + colLetter_('Kids est.') + '2)'))
      .setBackground('#F4EEDD').setRanges([R('Children')]).build()
  ]);

  if(!sh.getFilter()){
    sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), cols).createFilter();
  }
  return sh;
}

function buildRsvp_(ss){
  const sh = ss.getSheetByName(SHEETS.RSVP) || ss.insertSheet(SHEETS.RSVP, 2);
  sh.getRange(1, 1, 1, RSVP_HEADER.length).setValues([RSVP_HEADER]);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, RSVP_HEADER.length)
    .setBackground(T.salviaDeep).setFontColor('#FFFFFF').setFontWeight('bold')
    .setVerticalAlignment('middle');
  sh.setRowHeight(1, 34);
  [150, 80, 190, 190, 230, 90, 140, 240, 90, 170, 80, 200, 200, 80, 200, 320, 80]
    .forEach((w, i) => sh.setColumnWidth(i + 1, w));
  return sh;
}

/* --------------------------- the dashboard ------------------------------- */
/* Every column letter below comes from gCol_(), so this survives the Guests
   tab changing shape. The headline is "Room left to offer": target, minus who
   has said yes, minus the seats still out with people who haven't answered. */
function buildDashboard_(ss){
  const sh = ss.getSheetByName(SHEETS.DASH) || ss.insertSheet(SHEETS.DASH, 3);
  const target = sh.getRange(TARGET_CELL).getValue();   // keep an edited target
  sh.clear();
  sh.clearConditionalFormatRules();
  const D = SHEETS.DEADLINES;

  const stats = [
    ['Wedding HQ', ''],
    ['Ilaria & Maxime · Villa Corsini a Mezzomonte · 23 July 2027', ''],
    ['', ''],
    ['SEATS', ''],
    ['Target', (typeof target === 'number' && target > 0) ? target : DEFAULT_TARGET],
    ['Confirmed coming',   '=SUM(' + gCol_('Coming') + ')'],
    ['Awaiting reply',     '=SUMIFS(' + gCol_('Seats') + '§' + gCol_('Invite sent') + '§"<>"§' + gCol_('RSVP') + '§"")'],
    ['Room left to offer', '=B5-B6-B7'],
    ['On hold',            '=SUMIF(' + gCol_('Send?') + '§"Hold"§' + gCol_('Seats') + ')'],
    ['Cut',                '=SUMIF(' + gCol_('Send?') + '§"Cut"§' + gCol_('Seats') + ')'],
    ['', ''],
    ['INVITES', ''],
    ['Queued to send',     '=SUMIFS(' + gCol_('Seats') + '§' + gCol_('Send?') + '§"Send"§' + gCol_('Invite sent') + '§"")'],
    ['Drafts created',     '=COUNTIF(' + gCol_('Invite status') + '§"*draft*")'],
    ['Invites sent',       '=COUNTA(' + gCol_('Invite sent') + ')'],
    ['Reminders sent',     '=COUNTA(' + gCol_('Reminder sent') + ')'],
    ['Missing an email',   '=COUNTIFS(' + gCol_('Invitee') + '§"<>"§' + gCol_('Email') + '§"")'],
    ['', ''],
    ['REPLIES', ''],
    ['Replied',            '=COUNTIF(' + gCol_('RSVP') + '§"<>")'],
    ['Coming (households)','=COUNTIF(' + gCol_('RSVP') + '§"Yes")'],
    ['Not coming',         '=COUNTIF(' + gCol_('RSVP') + '§"No")'],
    ['Children — you guessed', '=SUM(' + gCol_('Kids est.') + ')'],
    ['Children — confirmed',   '=SUM(' + gCol_('Children') + ')'],
    ['Shuttle seats',      '=SUMIF(' + gCol_('Shuttle') + '§"Yes"§' + gCol_('Coming') + ')']
  ].map(r => [r[0], (typeof r[1] === 'string' && r[1].charAt(0) === '=') ? f_(r[1]) : r[1]]);
  sh.getRange(1, 1, stats.length, 2).setValues(stats);

  sh.getRange('A1').setFontSize(22).setFontColor(T.ink).setFontWeight('bold');
  sh.getRange('A2').setFontSize(11).setFontColor(T.muted).setFontStyle('italic');
  ['A4', 'A12', 'A19'].forEach(a => sh.getRange(a)
    .setFontSize(10).setFontWeight('bold').setFontColor(T.salviaDeep));
  sh.getRange('B5:B10').setFontSize(15).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange('B13:B17').setFontSize(13).setHorizontalAlignment('left');
  sh.getRange('B20:B25').setFontSize(13).setHorizontalAlignment('left');
  sh.getRange(TARGET_CELL).setBackground('#FFFFFF')
    .setBorder(true, true, true, true, false, false, T.oro, null);
  sh.getRange('A8:B8').setFontSize(17).setFontWeight('bold').setFontColor(T.salviaDeep);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0)
      .setBackground('#F6E6DE').setFontColor(T.terracotta)
      .setRanges([sh.getRange('B8')]).build()
  ]);

  /* --- breakdowns, stacked down columns D–I ----------------------------- */
  function table(anchorRow, title, values, guestColName, withDeadline){
    const gc = gCol_(guestColName);
    sh.getRange(anchorRow, 4).setValue(title)
      .setFontSize(10).setFontWeight('bold').setFontColor(T.salviaDeep);
    const head = ['', 'Invited', 'Seats', 'Replied', 'Coming'].concat(withDeadline ? ['Reply by'] : []);
    sh.getRange(anchorRow + 1, 4, 1, head.length).setValues([head])
      .setFontWeight('bold').setFontColor(T.muted).setFontSize(10);
    values.forEach((v, i) => {
      const r = anchorRow + 2 + i, q = '"' + v + '"';
      sh.getRange(r, 4).setValue(v);
      sh.getRange(r, 5).setFormula(f_('=COUNTIF(' + gc + '§' + q + ')'));
      sh.getRange(r, 6).setFormula(f_('=SUMIF(' + gc + '§' + q + '§' + gCol_('Seats') + ')'));
      sh.getRange(r, 7).setFormula(f_('=COUNTIFS(' + gc + '§' + q + '§' + gCol_('RSVP') + '§"<>")'));
      sh.getRange(r, 8).setFormula(f_('=SUMIFS(' + gCol_('Coming') + '§' + gc + '§' + q + ')'));
      if(withDeadline){
        sh.getRange(r, 9).setFormula(f_('=IFERROR(VLOOKUP(D' + r + '§' + D + '!A:B§2§FALSE)§"")'))
          .setNumberFormat('d mmm yyyy');
      }
    });
    return anchorRow + 2 + values.length;
  }
  let row = table(4, 'BY CATEGORY', CATEGORIES, 'Category', true);
  row = table(row + 2, 'BY SUBCATEGORY', SUBCATEGORIES, 'Subcategory', false);
  row = table(row + 2, 'BY SIDE', SIDES, 'Side', false);
  table(row + 2, 'BY PRIORITY', PRIORITIES.map(String), 'Priority', false);

  /* --- the action lists, each in its own column band so a long one cannot
         collide with the next -------------------------------------------- */
  function listBlock(anchor, title, headers, formula){
    const col = anchor.charCodeAt(0) - 64;
    sh.getRange(anchor + '4').setValue(title)
      .setFontSize(10).setFontWeight('bold').setFontColor(T.salviaDeep);
    sh.getRange(5, col, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setFontColor(T.muted).setFontSize(10);
    sh.getRange(anchor + '6').setFormula(f_(formula));
  }
  listBlock('K', 'NEXT TO PROMOTE — on hold, best priority first',
    ['Household', 'Subcategory', 'Priority', 'Seats'],
    '=IFERROR(SORT(FILTER({' + gCol_('Household') + '¦' + gCol_('Subcategory') + '¦' +
      gCol_('Priority') + '¦' + gCol_('Seats') + '}§(' + gCol_('Send?') + '="Hold")*(' +
      gCol_('Household') + '<>""))§3§TRUE)§"— nobody on hold —")');

  listBlock('P', 'WHO HASN’T REPLIED — invited, still silent',
    ['Household', 'Subcategory', 'Priority'],
    '=IFERROR(SORT(FILTER({' + gCol_('Household') + '¦' + gCol_('Subcategory') + '¦' +
      gCol_('Priority') + '}§(' + gCol_('Invite sent') + '<>"")*(' + gCol_('RSVP') + '=""))§3§TRUE)§' +
      '"— everyone invited has replied —")');

  listBlock('T', 'DIETARY NEEDS', ['Household', 'Note'],
    '=IFERROR(FILTER({' + gCol_('Household') + '¦' + gCol_('Diet') + '}§' +
      gCol_('Diet') + '<>"")§"— none noted yet —")');

  [210, 90, 30, 150, 70, 60, 70, 70, 100, 30, 190, 150, 70, 60, 30,
   190, 150, 70, 30, 190, 240].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.setHiddenGridlines(true);
  return sh;
}

/* ========================= 2. INVITE LINKS =============================== */
/* A short private token per guest, carried in their invite link. It is what
   lets an RSVP find its way back to the right row without anyone typing a
   name twice. Ambiguous characters (0/O, 1/l/I) are left out so a token is
   safe to read aloud down the phone. */
const TOKEN_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/* Every row that names someone gets an invite link and a greeting. Links are
   never regenerated — the link in an email already sent has to keep working —
   and greetings are only filled where the cell is empty, so anything you
   typed yourself stays. */
/* Every row that names someone gets an invite link. Links are never
   regenerated — the link in an email already sent has to keep working. */
/* Invite links for rows that lack one — optional, since a row is given its
   link the moment it is sent anyway. Links are never regenerated: the link in
   an email already sent has to keep working. */
function prepareGuests(){
  const ctx = readGuests_();
  let links = 0;
  for(let i = 0; i < ctx.data.length; i++){
    const names = normText_(cell_(ctx, i, 'household')) || normText_(cell_(ctx, i, 'invitee'));
    if(!names && !String(cell_(ctx, i, 'email') || '').trim()) continue;
    if(!String(cell_(ctx, i, 'token') || '').trim()){ ensureToken_(ctx, i); links++; }
  }
  toast_(links ? links + ' invite link(s) made.' : 'Every guest already has an invite link.');
}

/* Every greeting as it would be drawn right now, in one dialog — the rows
   where the gender was guessed or a placeholder stands in for a name are
   marked, so they can be fixed in Household (or overridden in Greeting)
   before anything goes out. */
function reviewGreetings(){
  const ctx = readGuests_();
  const lines = [];
  let doubtful = 0;
  for(let i = 0; i < ctx.data.length; i++){
    const g = guestFromRow_(ctx, i);
    if(!g.household && !g.names) continue;
    const why = greetingDoubtful_(g);
    if(why) doubtful++;
    const flag = why === 'placeholder' || why === 'guessed';
    if(!flag && why) doubtful--;
    lines.push('<tr' + (flag ? ' class="d"' : '') + '><td>' + (i + 2) + '</td><td>' + esc_(g.household || g.names) +
               '</td><td>' + esc_(greetingOf_(g)) + '</td><td>' + esc_(plusLine_(g)) + '</td><td>' +
               (why === 'placeholder' ? '⚠ placeholder name' : why === 'guessed' ? 'gender guessed' :
                why === 'typed' ? 'your own words' : '') + '</td></tr>');
  }
  const html = '<style>body{font:13px/1.4 system-ui,sans-serif;color:#3D352A}table{border-collapse:collapse;width:100%}' +
    'td,th{padding:4px 8px;border-bottom:1px solid #E4DCC9;text-align:left;vertical-align:top}th{color:#897C68;font-weight:600}' +
    'tr.d td{background:#FDF3E7}</style>' +
    '<p>' + lines.length + ' letters · ' + doubtful + ' worth a look (shaded). The letter says exactly what the ' +
    '<b>Greeting</b> cell says: edit <b>Household</b> to change the names the formula uses, or type your own line over it.</p>' +
    '<table><tr><th>Row</th><th>Household</th><th>Greeting</th><th>Plus-one line</th><th></th></tr>' + lines.join('') + '</table>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(860).setHeight(600),
    'Greetings — as they will be drawn');
}

function ensureToken_(ctx, i){
  let tok = String(cell_(ctx, i, 'token') || '').trim().toLowerCase();
  if(!tok){
    const taken = {};
    ctx.data.forEach(r => {
      const t = String(r[ctx.idx['token']] || '').trim().toLowerCase();
      if(t) taken[t] = true;
    });
    do { tok = randomToken_(6); } while(taken[tok]);
    setCell_(ctx, i, 'token', tok);
  }
  setCell_(ctx, i, 'invite link', inviteLink_(tok));
  return tok;
}

function randomToken_(n){
  let s = '';
  for(let i = 0; i < n; i++){
    s += TOKEN_ALPHABET.charAt(Math.floor(Math.random() * TOKEN_ALPHABET.length));
  }
  return s;
}

function inviteLink_(token){
  const base = CFG.SITE_URL + (CFG.SITE_URL.indexOf('?') < 0 ? '?' : '&');
  return base + 'g=' + encodeURIComponent(token);
}

/* =========================== 3. INVITES OUT ============================== */
/* One row, sent immediately. The couple pick a guest, press the button, and
   that guest's invitation leaves — no draft to find, no batch to review. It
   refuses rather than sends something wrong: a guest with no email, a guest
   set to Hold or Cut, or a guest whose card has not been published yet. */
/* One click, one guest, straight to their inbox — after showing you exactly
   which words are going. It refuses, and says why, rather than sending
   anything doubtful: no address, a row on Hold or Cut, a letter that could
   not be drawn. */
function sendSelectedRowNow(){
  const ui = SpreadsheetApp.getUi();
  const ctx = readGuests_();
  const rows = selectedDataRows_(ctx);
  if(rows.length !== 1){
    toast_('Select exactly one guest row first — you have ' + rows.length + ' selected.');
    return;
  }
  const i = rows[0];
  const to = String(cell_(ctx, i, 'email') || '').trim();
  const who = String(cell_(ctx, i, 'household') || cell_(ctx, i, 'invitee') || 'this guest');
  if(!to){ toast_('No email address for ' + who + '. Nothing sent.'); return; }
  const state = String(cell_(ctx, i, 'send?') || '').trim();
  if(state && state.toLowerCase() !== 'send'){
    toast_(who + ' is set to ' + state + '. Change Send? to Send first. Nothing sent.'); return;
  }

  const g = guestFromRow_(ctx, i);
  g.token = ensureToken_(ctx, i);
  g.replyBy = deadlineFor_(deadlineMap_(), g.category, g.lang);

  const already = String(cell_(ctx, i, 'invite status') || '').trim();
  const sentOn  = cell_(ctx, i, 'invite sent');
  const answer = ui.alert('Send now?',
    (already ? '⚠ This row is already marked “' + already + '”' +
               (sentOn instanceof Date ? ' on ' + sentOn.toLocaleDateString() : '') + '.\n\n' : '') +
    'Send the invitation to ' + to + '?\n\n' +
    '“' + greetingOf_(g) + '”' +
    (plusLine_(g) ? '\n' + plusLine_(g) : '') +
    (g.note ? '\n' + g.note : '') +
    '\n\nLanguage: ' + g.lang.toUpperCase() + ' · reply by ' + g.replyBy + '.',
    ui.ButtonSet.OK_CANCEL);
  if(answer !== ui.Button.OK) return;

  toast_('Drawing ' + who + '’s invitation…');
  let imgs;
  try { imgs = inlineImages_(g, 'invite'); }
  catch(err){ toast_('Nothing sent to ' + who + ' — ' + err.message); return; }
  const m = buildEmail_(g);
  GmailApp.sendEmail(to, m.subject, m.text, {
    htmlBody: m.html, name: CFG.SENDER_NAME, replyTo: CFG.REPLY_TO, inlineImages: imgs
  });
  setCell_(ctx, i, 'reply by', rawDeadline_(deadlineMap_(), g.category));
  setCell_(ctx, i, 'invite status', 'Sent');
  setCell_(ctx, i, 'invite sent', new Date());
  toast_('Invitation sent to ' + who + ' at ' + to + '.');
}

function createDraftsForSelected(){
  const ctx = readGuests_();
  const rows = selectedDataRows_(ctx);
  if(!rows.length){ toast_('Select one or more guest rows first.'); return; }
  runInvites_(ctx, rows);
}

/* Everything the current filter leaves visible and still pending. This is the
   "invite one category / one priority at a time" button: filter the Guests tab
   to the slice you want, then run this. */
function createDraftsForFiltered(){
  const ctx = readGuests_();
  const rows = visibleDataRows_(ctx).filter(i => sendable_(ctx, i) &&
    String(cell_(ctx, i, 'invite status') || '').toLowerCase().indexOf('draft') < 0);
  if(!rows.length){ toast_('Nothing to send among the visible rows — they already have drafts, are on Hold or Cut, or have no email.'); return; }
  runInvites_(ctx, rows);
}

/* Batch by wave: fill the Wave column to plan who goes out when, then send one
   number at a time and let the replies come back before opening the next. */
function createDraftsForWave(){
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Send a wave', 'Which wave number should go out?', ui.ButtonSet.OK_CANCEL);
  if(res.getSelectedButton() !== ui.Button.OK) return;
  const wave = String(res.getResponseText() || '').trim();
  if(!wave){ toast_('No wave number given.'); return; }

  const ctx = readGuests_();
  const rows = [];
  for(let i = 0; i < ctx.data.length; i++){
    if(!sendable_(ctx, i)) continue;
    if(String(cell_(ctx, i, 'wave') || '').trim() !== wave) continue;
    if(String(cell_(ctx, i, 'invite status') || '').toLowerCase().indexOf('draft') >= 0) continue;
    rows.push(i);
  }
  if(!rows.length){ toast_('Nothing pending in wave ' + wave + '.'); return; }
  runInvites_(ctx, rows);
}

function createDraftsForPending(){
  const ctx = readGuests_();
  const rows = [];
  for(let i = 0; i < ctx.data.length; i++){
    const st = String(cell_(ctx, i, 'invite status') || '').toLowerCase();
    if(sendable_(ctx, i) && st.indexOf('draft') < 0) rows.push(i);
  }
  if(!rows.length){ toast_('Nothing pending — every sendable guest already has a draft.'); return; }
  runInvites_(ctx, rows);
}

/* Fetch the guest's card and embed it in the message rather than linking to
   it. A hotlinked image goes through Gmail's own proxy, which refuses some
   hosts outright and blocks images by default for unknown senders — an
   invitation that arrives as an empty rectangle is worse than no invitation.
   An embedded image travels inside the mail and cannot be refused.
   Returns null if the card has not been rendered and deployed yet, in which
   case the draft still goes out with the alt text and the live details. */
function fetchBlob_(file, name){
  try {
    const res = UrlFetchApp.fetch(CFG.IMG_BASE + file, { muteHttpExceptions: true });
    if(res.getResponseCode() !== 200) return null;
    return res.getBlob().setName(name);
  } catch(_){ return null; }
}

/* ====================== THE LETTER, DRAWN AT SEND TIME =================== */
/* Gmail, Outlook and Yahoo strip web fonts, so the letter cannot travel as
   live text — it travels as a picture of itself. That picture is drawn here,
   when you press Send, from the row as it reads at that moment: greeting,
   plus-one line, note. Nothing is drawn in advance and nothing is stored.

   The drawing surface is Google Slides, the one Google service that
   rasterises text in a chosen Google Font — and Cormorant Garamond and EB
   Garamond are Google Fonts. A scratch presentation is created with a page
   exactly the height this letter needs, the panel and its text are laid out
   to the site's own CSS metrics (1 pt here = 1 px there), the page is
   exported as a 1600 px PNG, and the scratch file goes to the bin. The
   header and the facts table, which never change per guest, are PNGs drawn
   from the same CSS; the villa is a JPEG. Stacked in the email they read as
   one card. */
/* Advance widths per em, measured from the real font files by
   tools/invites/assets/metrics.js. Slides gives no way to ask how tall a
   paragraph came out, so the letter's height is computed the way Slides will
   lay it out: greedy word wrap at these widths. */
const METRICS = {"cormorant":{"0":0.5,"1":0.5,"2":0.5,"3":0.5,"4":0.5,"5":0.5,"6":0.5,"7":0.5,"8":0.5,"9":0.5," ":0.25,"!":0.333,"\"":0.408,"#":0.5,"$":0.5,"%":0.833,"&":0.778,"'":0.18,"(":0.333,")":0.333,"*":0.5,"+":0.564,",":0.25,"-":0.333,".":0.25,"/":0.278,":":0.278,";":0.278,"<":0.564,"=":0.564,">":0.564,"?":0.444,"@":0.921,"A":0.722,"B":0.667,"C":0.667,"D":0.722,"E":0.611,"F":0.556,"G":0.722,"H":0.722,"I":0.333,"J":0.389,"K":0.722,"L":0.611,"M":0.889,"N":0.722,"O":0.722,"P":0.556,"Q":0.722,"R":0.667,"S":0.556,"T":0.611,"U":0.722,"V":0.722,"W":0.944,"X":0.722,"Y":0.722,"Z":0.611,"[":0.333,"\\":0.278,"]":0.333,"^":0.469,"_":0.5,"`":0.333,"a":0.444,"b":0.5,"c":0.444,"d":0.5,"e":0.444,"f":0.333,"g":0.5,"h":0.5,"i":0.278,"j":0.278,"k":0.5,"l":0.278,"m":0.778,"n":0.5,"o":0.5,"p":0.5,"q":0.5,"r":0.333,"s":0.389,"t":0.278,"u":0.5,"v":0.5,"w":0.722,"x":0.5,"y":0.5,"z":0.444,"{":0.48,"|":0.2,"}":0.48,"~":0.541,"à":0.444,"á":0.444,"â":0.444,"ã":0.444,"ä":0.444,"å":0.444,"ç":0.444,"è":0.444,"é":0.444,"ê":0.444,"ë":0.444,"ì":0.278,"í":0.278,"î":0.278,"ï":0.278,"ñ":0.5,"ò":0.5,"ó":0.5,"ô":0.5,"õ":0.5,"ö":0.5,"ù":0.5,"ú":0.5,"û":0.5,"ü":0.5,"ý":0.5,"ÿ":0.5,"À":0.722,"Á":0.722,"Â":0.722,"Ã":0.722,"Ä":0.722,"Å":0.722,"Ç":0.667,"È":0.611,"É":0.611,"Ê":0.611,"Ë":0.611,"Ì":0.333,"Í":0.333,"Î":0.333,"Ï":0.333,"Ñ":0.722,"Ò":0.722,"Ó":0.722,"Ô":0.722,"Õ":0.722,"Ö":0.722,"Ù":0.722,"Ú":0.722,"Û":0.722,"Ü":0.722,"Ÿ":0.722,"’":0.333,"‘":0.333,"“":0.444,"”":0.444,"·":0.333,"—":1,"–":0.5,"…":1,"«":0.5,"»":0.5},"cormorant-italic":{"0":0.5,"1":0.5,"2":0.5,"3":0.5,"4":0.5,"5":0.5,"6":0.5,"7":0.5,"8":0.5,"9":0.5," ":0.25,"!":0.333,"\"":0.42,"#":0.5,"$":0.5,"%":0.833,"&":0.778,"'":0.214,"(":0.333,")":0.333,"*":0.5,"+":0.675,",":0.25,"-":0.333,".":0.25,"/":0.278,":":0.333,";":0.333,"<":0.675,"=":0.675,">":0.675,"?":0.5,"@":0.92,"A":0.611,"B":0.611,"C":0.667,"D":0.722,"E":0.611,"F":0.611,"G":0.722,"H":0.722,"I":0.333,"J":0.444,"K":0.667,"L":0.556,"M":0.833,"N":0.667,"O":0.722,"P":0.611,"Q":0.722,"R":0.611,"S":0.5,"T":0.556,"U":0.722,"V":0.611,"W":0.833,"X":0.611,"Y":0.556,"Z":0.556,"[":0.389,"\\":0.278,"]":0.389,"^":0.422,"_":0.5,"`":0.333,"a":0.5,"b":0.5,"c":0.444,"d":0.5,"e":0.444,"f":0.278,"g":0.5,"h":0.5,"i":0.278,"j":0.278,"k":0.444,"l":0.278,"m":0.722,"n":0.5,"o":0.5,"p":0.5,"q":0.5,"r":0.389,"s":0.389,"t":0.278,"u":0.5,"v":0.444,"w":0.667,"x":0.444,"y":0.444,"z":0.389,"{":0.4,"|":0.275,"}":0.4,"~":0.541,"à":0.5,"á":0.5,"â":0.5,"ã":0.5,"ä":0.5,"å":0.5,"ç":0.444,"è":0.444,"é":0.444,"ê":0.444,"ë":0.444,"ì":0.278,"í":0.278,"î":0.278,"ï":0.278,"ñ":0.5,"ò":0.5,"ó":0.5,"ô":0.5,"õ":0.5,"ö":0.5,"ù":0.5,"ú":0.5,"û":0.5,"ü":0.5,"ý":0.444,"ÿ":0.444,"À":0.611,"Á":0.611,"Â":0.611,"Ã":0.611,"Ä":0.611,"Å":0.611,"Ç":0.667,"È":0.611,"É":0.611,"Ê":0.611,"Ë":0.611,"Ì":0.333,"Í":0.333,"Î":0.333,"Ï":0.333,"Ñ":0.667,"Ò":0.722,"Ó":0.722,"Ô":0.722,"Õ":0.722,"Ö":0.722,"Ù":0.722,"Ú":0.722,"Û":0.722,"Ü":0.722,"Ÿ":0.556,"’":0.333,"‘":0.333,"“":0.556,"”":0.556,"·":0.25,"—":0.889,"–":0.5,"…":0.889,"«":0.5,"»":0.5},"ebg":{"0":0.5,"1":0.5,"2":0.5,"3":0.5,"4":0.5,"5":0.5,"6":0.5,"7":0.5,"8":0.5,"9":0.5," ":0.25,"!":0.333,"\"":0.408,"#":0.5,"$":0.5,"%":0.833,"&":0.778,"'":0.18,"(":0.333,")":0.333,"*":0.5,"+":0.564,",":0.25,"-":0.333,".":0.25,"/":0.278,":":0.278,";":0.278,"<":0.564,"=":0.564,">":0.564,"?":0.444,"@":0.921,"A":0.722,"B":0.667,"C":0.667,"D":0.722,"E":0.611,"F":0.556,"G":0.722,"H":0.722,"I":0.333,"J":0.389,"K":0.722,"L":0.611,"M":0.889,"N":0.722,"O":0.722,"P":0.556,"Q":0.722,"R":0.667,"S":0.556,"T":0.611,"U":0.722,"V":0.722,"W":0.944,"X":0.722,"Y":0.722,"Z":0.611,"[":0.333,"\\":0.278,"]":0.333,"^":0.469,"_":0.5,"`":0.333,"a":0.444,"b":0.5,"c":0.444,"d":0.5,"e":0.444,"f":0.333,"g":0.5,"h":0.5,"i":0.278,"j":0.278,"k":0.5,"l":0.278,"m":0.778,"n":0.5,"o":0.5,"p":0.5,"q":0.5,"r":0.333,"s":0.389,"t":0.278,"u":0.5,"v":0.5,"w":0.722,"x":0.5,"y":0.5,"z":0.444,"{":0.48,"|":0.2,"}":0.48,"~":0.541,"à":0.444,"á":0.444,"â":0.444,"ã":0.444,"ä":0.444,"å":0.444,"ç":0.444,"è":0.444,"é":0.444,"ê":0.444,"ë":0.444,"ì":0.278,"í":0.278,"î":0.278,"ï":0.278,"ñ":0.5,"ò":0.5,"ó":0.5,"ô":0.5,"õ":0.5,"ö":0.5,"ù":0.5,"ú":0.5,"û":0.5,"ü":0.5,"ý":0.5,"ÿ":0.5,"À":0.722,"Á":0.722,"Â":0.722,"Ã":0.722,"Ä":0.722,"Å":0.722,"Ç":0.667,"È":0.611,"É":0.611,"Ê":0.611,"Ë":0.611,"Ì":0.333,"Í":0.333,"Î":0.333,"Ï":0.333,"Ñ":0.722,"Ò":0.722,"Ó":0.722,"Ô":0.722,"Õ":0.722,"Ö":0.722,"Ù":0.722,"Ú":0.722,"Û":0.722,"Ü":0.722,"Ÿ":0.722,"’":0.333,"‘":0.333,"“":0.444,"”":0.444,"·":0.333,"—":1,"–":0.5,"…":1,"«":0.5,"»":0.5},"ebg-italic":{"0":0.5,"1":0.5,"2":0.5,"3":0.5,"4":0.5,"5":0.5,"6":0.5,"7":0.5,"8":0.5,"9":0.5," ":0.25,"!":0.333,"\"":0.42,"#":0.5,"$":0.5,"%":0.833,"&":0.778,"'":0.214,"(":0.333,")":0.333,"*":0.5,"+":0.675,",":0.25,"-":0.333,".":0.25,"/":0.278,":":0.333,";":0.333,"<":0.675,"=":0.675,">":0.675,"?":0.5,"@":0.92,"A":0.611,"B":0.611,"C":0.667,"D":0.722,"E":0.611,"F":0.611,"G":0.722,"H":0.722,"I":0.333,"J":0.444,"K":0.667,"L":0.556,"M":0.833,"N":0.667,"O":0.722,"P":0.611,"Q":0.722,"R":0.611,"S":0.5,"T":0.556,"U":0.722,"V":0.611,"W":0.833,"X":0.611,"Y":0.556,"Z":0.556,"[":0.389,"\\":0.278,"]":0.389,"^":0.422,"_":0.5,"`":0.333,"a":0.5,"b":0.5,"c":0.444,"d":0.5,"e":0.444,"f":0.278,"g":0.5,"h":0.5,"i":0.278,"j":0.278,"k":0.444,"l":0.278,"m":0.722,"n":0.5,"o":0.5,"p":0.5,"q":0.5,"r":0.389,"s":0.389,"t":0.278,"u":0.5,"v":0.444,"w":0.667,"x":0.444,"y":0.444,"z":0.389,"{":0.4,"|":0.275,"}":0.4,"~":0.541,"à":0.5,"á":0.5,"â":0.5,"ã":0.5,"ä":0.5,"å":0.5,"ç":0.444,"è":0.444,"é":0.444,"ê":0.444,"ë":0.444,"ì":0.278,"í":0.278,"î":0.278,"ï":0.278,"ñ":0.5,"ò":0.5,"ó":0.5,"ô":0.5,"õ":0.5,"ö":0.5,"ù":0.5,"ú":0.5,"û":0.5,"ü":0.5,"ý":0.444,"ÿ":0.444,"À":0.611,"Á":0.611,"Â":0.611,"Ã":0.611,"Ä":0.611,"Å":0.611,"Ç":0.667,"È":0.611,"É":0.611,"Ê":0.611,"Ë":0.611,"Ì":0.333,"Í":0.333,"Î":0.333,"Ï":0.333,"Ñ":0.667,"Ò":0.722,"Ó":0.722,"Ô":0.722,"Õ":0.722,"Ö":0.722,"Ù":0.722,"Ú":0.722,"Û":0.722,"Ü":0.722,"Ÿ":0.556,"’":0.333,"‘":0.333,"“":0.556,"”":0.556,"·":0.25,"—":0.889,"–":0.5,"…":0.889,"«":0.5,"»":0.5}};

/* how many lines a string takes in a column that wide, at that size */
function wrapLines_(str, face, sizePt, widthPt){
  const w = METRICS[face] || METRICS.ebg;
  const em = widthPt / sizePt;                       // the column, in ems
  const width = (t) => { let x = 0; for(let i = 0; i < t.length; i++){ const c = w[t.charAt(i)]; x += (c === undefined ? 0.5 : c); } return x; };
  const words = normText_(str).split(' ').filter(Boolean);
  if(!words.length) return 1;
  const space = w[' '] || 0.25;
  let lines = 1, cur = 0;
  for(let i = 0; i < words.length; i++){
    const ww = width(words[i]);
    const next = cur === 0 ? ww : cur + space + ww;
    if(next <= em || cur === 0){ cur = next; }
    else { lines++; cur = ww; }
    if(cur > em){ lines += Math.ceil(cur / em) - 1; cur = em; }   // a word longer than the column
  }
  return lines;
}

const CARD = {
  W: 600,
  PAD:   { top: 30, bottom: 36, x: 34 },             // .letter margin
  IN:    { top: 36, side: 40, bottom: 32 },          // .letter padding
  INSET: 7.2,                                        // Slides' fixed text-box inset
  // natural = the face's own line height as a multiple of its size, which is
  // what Slides' percentage spacing is relative to; lh is the CSS line-height
  GREET: { font: 'Cormorant Garamond', face: 'cormorant', size: 24, lh: 1.25, natural: 1.21 },
  BODY:  { font: 'EB Garamond', face: 'ebg', size: 17, lh: 1.66, natural: 1.27, gap: 13 },
  // a line in the couple's own hand: its own ground, ruled in terracotta
  NOTE:  { font: 'EB Garamond', face: 'ebg-italic', size: 16, lh: 1.62, natural: 1.27, gap: 22, italic: true,
           pad: { x: 18, y: 14 }, bg: '#F6EFE0', rule: '#C47A54' },
  FACTS: { gap: 26, h: 143 },                        // email-facts-<lang>.png, 452 × 143 at 1×
  HEAD:  { h: 383 },                                 // email-head-<lang>.png, 600 × 383
  HERO:  { h: 400 },                                 // email-estate.jpg, 1200 × 801
  // the reply block, read as one movement: a rule, then how to answer
  RULE:  { gap: 34, w: 60 },
  PW:    { gap: 26, w: 300, h: 74, labelH: 26,       // email-pwk-<lang>.png, 600 × 56
           value: { font: 'Cormorant Garamond', face: 'cormorant', size: 27, lh: 1.2, natural: 1.21 } },
  CTA:   { gap: 24, w: 330, h: 35 },                 // email-cta-<lang>.png, 600 × 64
  DEAD:  { gap: 30, labelH: 22,                      // email-by-<lang>.png, 600 × 56
           date: { font: 'Cormorant Garamond', face: 'cormorant', size: 28, lh: 1.25, natural: 1.21 } },
  CLOSE: { gap: 40, h: 30 },                         // email-close-<lang>.png, 600 × 56
  MARK:  { gap: 6, w: 224, h: 63 },                  // email-wordmark.png, 1005 × 297
  FOOT:  { gap: 30, font: 'EB Garamond', face: 'ebg', size: 12.5, lh: 1.5, natural: 1.27 },
  END:   { pad: 40 },
  // how the slack on a fixed-height page is spent: above the letter, above
  // the reply block, under the sign-off
  SLACK: { panel: 0.25, reply: 0.45 },
  PLUS:  { font: 'Cormorant Garamond', face: 'cormorant-italic', size: 18, lh: 1.4, natural: 1.21, gap: 26, italic: true, center: true },
  SITE:  { font: 'EB Garamond', face: 'ebg', size: 16, lh: 1.62, natural: 1.27, gap: 26, center: true },
  SPRIG: { gap: 22, w: 20, h: 20 },
  THUMB: 'LARGE'                                     // the fallback export
};

/* Where everything goes, in pt, for this guest's words. Line counts are
   estimated on the generous side: a line too many costs a little air, a line
   too few would overlap the next block. */
function mailLayout_(lang, words){
  const W = CARD.W;
  const colX = CARD.PAD.x + CARD.IN.side;
  const colW = W - 2 * colX;
  const L = { W, colX, colW, text: [], images: [], shapes: [] };
  let y = 0;

  const text = (spec, str, opt) => {
    opt = opt || {};
    const w = opt.w || colW;
    const x = opt.x === undefined ? (W - w) / 2 : opt.x;
    const h = wrapLines_(str, spec.face || 'ebg', spec.size, w) * spec.size * (spec.lh || 1.4);
    L.text.push({ spec, str, y, h, x, w, center: opt.center !== undefined ? opt.center : spec.center,
                  color: opt.color });
    y += h;
    return h;
  };

  // the fixed head of the letter: crest, names, tagline, date — then the villa
  L.images.push({ key: 'head', x: 0, y, w: W, h: CARD.HEAD.h }); y += CARD.HEAD.h;
  L.images.push({ key: 'hero', x: 0, y, w: W, h: CARD.HERO.h }); y += CARD.HERO.h;

  // the letter itself, on its own paper
  const panelTop = y + CARD.PAD.top;
  y = panelTop + CARD.IN.top;
  text(CARD.GREET, words.greeting, { x: colX });
  y += CARD.BODY.gap;
  text(CARD.BODY, words.body, { x: colX });
  if(words.note){
    y += CARD.NOTE.gap;
    const top = y;
    y += CARD.NOTE.pad.y;
    const h = text(CARD.NOTE, words.note, { x: colX + CARD.NOTE.pad.x, w: colW - 2 * CARD.NOTE.pad.x });
    y += CARD.NOTE.pad.y;
    L.shapes.push({ kind: 'note', x: colX, y: top, w: colW, h: h + 2 * CARD.NOTE.pad.y });
  }
  y += CARD.FACTS.gap;
  L.images.push({ key: 'facts', x: colX, y, w: colW, h: CARD.FACTS.h }); y += CARD.FACTS.h;
  if(words.plus){ y += CARD.PLUS.gap; text(CARD.PLUS, words.plus, { x: colX }); }
  y += CARD.SITE.gap; text(CARD.SITE, words.site, { x: colX });
  y += CARD.SPRIG.gap;
  L.images.push({ key: 'sprig', x: (W - CARD.SPRIG.w) / 2, y, w: CARD.SPRIG.w, h: CARD.SPRIG.h });
  y += CARD.SPRIG.h + CARD.IN.bottom;
  L.panel = { x: CARD.PAD.x, y: panelTop, w: W - 2 * CARD.PAD.x, h: y - panelTop };

  // how to answer: a rule to close the letter, then the password to type, the
  // site to open, and the day to answer by, each with room around it
  y += CARD.RULE.gap;
  L.shapes.push({ kind: 'rule', x: (W - CARD.RULE.w) / 2, y, w: CARD.RULE.w, h: 1 });
  y += 1;

  y += CARD.PW.gap;
  L.shapes.push({ kind: 'pw', x: (W - CARD.PW.w) / 2, y, w: CARD.PW.w, h: CARD.PW.h });
  const pwTop = y;
  y += 13;
  L.images.push({ key: 'pwk', x: (W - CARD.PW.w) / 2, y, w: CARD.PW.w, h: CARD.PW.labelH });
  y += CARD.PW.labelH - 2;
  text(CARD.PW.value, words.password, { w: CARD.PW.w, center: true });
  y = pwTop + CARD.PW.h;

  y += CARD.CTA.gap;
  L.images.push({ key: 'cta', x: (W - CARD.CTA.w) / 2, y, w: CARD.CTA.w, h: CARD.CTA.h });
  y += CARD.CTA.h;

  // the date, set large enough to be remembered rather than read past
  y += CARD.DEAD.gap;
  L.images.push({ key: 'by', x: (W - 300) / 2, y, w: 300, h: CARD.DEAD.labelH });
  y += CARD.DEAD.labelH + 2;
  text(CARD.DEAD.date, words.replyBy, { center: true, color: T.terracotta });

  y += CARD.CLOSE.gap;
  L.images.push({ key: 'close', x: (W - 300) / 2, y, w: 300, h: CARD.CLOSE.h });
  y += CARD.CLOSE.h;
  y += CARD.MARK.gap;
  L.images.push({ key: 'mark', x: (W - CARD.MARK.w) / 2, y, w: CARD.MARK.w, h: CARD.MARK.h });
  y += CARD.MARK.h;

  y += CARD.FOOT.gap;
  text(CARD.FOOT, words.foot, { center: true, color: T.muted });

  L.contentH = y + CARD.END.pad;
  L.pageH = L.contentH;
  return L;
}

/* The page is a fixed height, the letter is not: a note adds lines, a long
   greeting adds one. The difference is spread over three gaps — above the
   letter, above the reply block, under the sign-off — so a short invitation
   reads as generously set rather than as one with a hole in it. */
function fitToPage_(L, pageH){
  L.pageH = pageH;
  const slack = pageH - L.contentH;
  if(Math.abs(slack) < 1) return L;
  const panelTop = L.panel.y, replyTop = L.panel.y + L.panel.h;
  const shift = (y) => (y >= panelTop ? slack * CARD.SLACK.panel : 0) +
                       (y >= replyTop ? slack * CARD.SLACK.reply : 0);
  L.text.forEach(t => { t.y += shift(t.y); });
  L.images.forEach(im => { im.y += shift(im.y); });
  L.shapes.forEach(sp => { sp.y += shift(sp.y); });
  L.panel.y += shift(panelTop);
  return L;
}

function emuToPt_(dim){
  const m = Number(dim && dim.magnitude) || 0;
  return (dim && dim.unit === 'PT') ? m : m / 12700;
}

/* Everything above is measured in the design's own 600 pt column. The
   template page may be wider — twice as wide, say — and then the whole
   drawing is scaled to it, which is the only way to get a picture with enough
   pixels in it: Slides exports a page at its own size, so a bigger page is a
   sharper invitation. */
function scaleLayout_(L, k){
  if(Math.abs(k - 1) < 0.001) return L;
  const S = (o, keys) => keys.forEach(key => { if(typeof o[key] === 'number') o[key] *= k; });
  L.text.forEach(t => {
    S(t, ['x', 'y', 'w', 'h']);
    t.size = t.spec.size * k;                        // the face is set in points too
  });
  L.images.forEach(im => S(im, ['x', 'y', 'w', 'h']));
  L.shapes.forEach(sp => S(sp, ['x', 'y', 'w', 'h']));
  S(L.panel, ['x', 'y', 'w', 'h']);
  S(L, ['W', 'colX', 'colW', 'contentH', 'pageH']);
  L.k = k;
  return L;
}

/* The whole invitation for this guest, as one picture — drawn now, from the
   row as it reads at this moment. Throws, with a sentence a person can act
   on, rather than returning something half-made. */
function mailBlob_(g){
  const lang = normLang_(g.lang);
  const c = COPY[lang] || COPY.it;
  const words = {
    greeting: greetingOf_(g), body: c.body, note: normText_(g.note), plus: plusLine_(g),
    site: c.siteLead, pwLabel: c.pwk, password: sitePassword_(), cta: c.cta,
    byLabel: c.byLabel, replyBy: g.replyBy || CFG.RSVP_BY[lang], foot: c.fcLead + ' ' + CFG.REPLY_TO
  };
  const L = mailLayout_(lang, words);

  const blobs = {
    head:  fetchBlob_(CFG.IMG_HEAD(lang),  'head.png'),
    hero:  fetchBlob_(CFG.IMG_HERO,        'estate.jpg'),
    facts: fetchBlob_(CFG.IMG_FACTS(lang), 'facts.png'),
    sprig: fetchBlob_(CFG.IMG_SPRIG,       'sprig.png'),
    close: fetchBlob_(CFG.IMG_CLOSE(lang), 'close.png'),
    mark:  fetchBlob_(CFG.IMG_MARK,        'wordmark.png'),
    pwk:   fetchBlob_(CFG.IMG_PWK(lang),   'pwk.png'),
    by:    fetchBlob_(CFG.IMG_BY(lang),    'by.png'),
    cta:   fetchBlob_(CFG.IMG_CTA(lang),   'cta.png')
  };
  const missing = Object.keys(blobs).filter(k => !blobs[k]);
  if(missing.length) throw new Error('could not fetch ' + missing.join(', ') + ' from ' + CFG.IMG_BASE);

  const id = copyTemplate_();
  try {
    const info = Slides.Presentations.get(id);
    const page = info.pageSize ? { w: emuToPt_(info.pageSize.width), h: emuToPt_(info.pageSize.height) } : null;
    if(!page || page.w < CARD.W - 2){
      throw new Error('the template page is ' + (page ? Math.round(page.w) + ' pt' : 'an unknown size') +
                      ' wide — it has to be at least ' + CARD.W + ' pt (Slides ▸ File ▸ Page setup ▸ Custom)');
    }
    const k = page.w / CARD.W;                       // 1200 pt wide → drawn at 2×
    scaleLayout_(L, k);
    if(L.contentH > page.h + 1){
      throw new Error('this invitation needs a page ' + Math.round(L.contentH / k) + ' × ' +
                      Math.round(page.w / k) + ' pt at this width; the template is ' +
                      Math.round(page.w) + ' × ' + Math.round(page.h) + ' — make it taller');
    }
    fitToPage_(L, page.h);
    const deck  = SlidesApp.openById(id);
    const slide = deck.getSlides()[0];
    const slideId = slide.getObjectId();
    slide.getPageElements().forEach(el => el.remove());
    slide.getBackground().setSolidFill(T.panna);

    const plain = (shape) => { shape.getBorder().setTransparent(); return shape; };
    // the letter's own paper, under everything the letter says
    const panel = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, L.panel.x, L.panel.y, L.panel.w, L.panel.h);
    panel.getFill().setSolidFill(T.carta);
    panel.getBorder().setWeight(Math.max(1, Math.round(L.k || 1)));
    panel.getBorder().getLineFill().setSolidFill(T.lineGold);

    L.shapes.forEach(sp => {
      if(sp.kind === 'note'){
        plain(slide.insertShape(SlidesApp.ShapeType.RECTANGLE, sp.x, sp.y, sp.w, sp.h))
          .getFill().setSolidFill(CARD.NOTE.bg);
        plain(slide.insertShape(SlidesApp.ShapeType.RECTANGLE, sp.x, sp.y, 2 * (L.k || 1), sp.h))
          .getFill().setSolidFill(CARD.NOTE.rule);
      } else if(sp.kind === 'pw'){
        const box = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, sp.x, sp.y, sp.w, sp.h);
        box.getFill().setSolidFill(T.panna2);
        box.getBorder().setWeight(Math.max(1, Math.round(L.k || 1)));
        box.getBorder().getLineFill().setSolidFill(T.lineGold);
      } else if(sp.kind === 'rule'){
        plain(slide.insertShape(SlidesApp.ShapeType.RECTANGLE, sp.x, sp.y, sp.w, Math.max(1, sp.h)))
          .getFill().setSolidFill(T.lineGold);
      }
    });

    // every piece is drawn at a known width, so none of them has to be
    // measured after the fact — which is what left the sign-off line missing
    L.images.forEach(im => { slide.insertImage(blobs[im.key], im.x, im.y, im.w, im.h); });

    L.text.forEach(t => {
      // the box is taller than the text needs: text is top-aligned, and a box
      // too short would make Slides shrink the type to fit it
      const inset = CARD.INSET * (L.k || 1);
      const box = slide.insertTextBox(t.str, t.x - inset, t.y - inset,
                                      t.w + 2 * inset, t.h + 2 * inset + 40 * (L.k || 1));
      try { box.getAutofit().disableAutofit(); } catch(_){}
      const tr = box.getText();
      tr.getTextStyle().setFontFamily(t.spec.font).setFontSize(t.size || t.spec.size)
        .setForegroundColor(t.color || T.ink)
        .setItalic(!!t.spec.italic).setBold(false);
      tr.getParagraphStyle()
        .setLineSpacing(Math.round((t.spec.lh || 1.4) / (t.spec.natural || 1.2) * 100))
        .setSpaceAbove(0).setSpaceBelow(0)
        .setParagraphAlignment(t.center ? SlidesApp.ParagraphAlignment.CENTER
                                        : SlidesApp.ParagraphAlignment.START);
    });
    deck.saveAndClose();

    // Drive exports the page at its own size — 1 pt becomes 1⅓ px — while a
    // thumbnail caps the long side at 1600 px, which on a page three times
    // taller than it is wide left the invitation 505 px across and Gmail
    // stretching it back up to 600.
    let png = null;
    try {
      const exp = UrlFetchApp.fetch('https://docs.google.com/presentation/d/' + id +
        '/export/png?id=' + id + '&pageid=' + slideId,
        { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
      if(exp.getResponseCode() === 200 && exp.getBlob().getBytes().length > 20000) png = exp.getBlob();
    } catch(_){}
    if(!png){
      const thumb = Slides.Presentations.Pages.getThumbnail(id, slideId, {
        'thumbnailProperties.mimeType': 'PNG', 'thumbnailProperties.thumbnailSize': CARD.THUMB
      });
      const res = UrlFetchApp.fetch(thumb.contentUrl, { muteHttpExceptions: true });
      if(res.getResponseCode() !== 200){
        throw new Error('could not download the drawn invitation (HTTP ' + res.getResponseCode() + ')');
      }
      png = res.getBlob();
    }
    // JPEG: a watercolour on ivory, three thousand pixels tall, is a megabyte
    // as PNG and a fraction of that with no visible difference
    return png.getAs('image/jpeg').setName('invitation.jpg');
  } finally { deleteOwnFile_(id); }
}

/* A copy of the template, to draw this one invitation on and then bin. The
   template exists only because Slides will not make a page of a given size
   through the API; its own size is set once, by hand, in Slides. */
function copyTemplate_(){
  const it = DriveApp.getFilesByName(CFG.TEMPLATE);
  if(!it.hasNext()){
    throw new Error('there is no Drive file named "' + CFG.TEMPLATE + '". Make an empty Google Slides ' +
                    'file with exactly that name, then File ▸ Page setup ▸ Custom ▸ ' + CARD.W +
                    ' × 1900, in points');
  }
  return it.next().makeCopy(CFG.SCRATCH).getId();
}

/* Everything the message embeds. The invitation is drawn here and now, for
   this guest; anything that cannot be drawn throws rather than letting a
   hollow email go out. */
function inlineImages_(g, kind){
  if(kind === 'reminder'){
    const out = {};
    const mark = fetchBlob_(CFG.IMG_MARK, 'wordmark.png');
    if(mark) out.wordmark = mark;
    const close = fetchBlob_(CFG.IMG_CLOSE(g.lang), 'close.png');
    if(close) out.close = close;
    const crest = fetchBlob_(CFG.IMG_CREST, 'crest.png');
    if(crest) out.crest = crest;
    return out;
  }
  return { mail: mailBlob_(g) };
}

/* ------------------------- per-category deadlines ------------------------ */
/* Read once per run, not once per guest. "(default)" — or a blank category —
   catches anyone the Deadlines tab doesn't name. */
function deadlineMap_(){
  const map = { __default__: null };
  const sh = book_().getSheetByName(SHEETS.DEADLINES);
  if(!sh || sh.getLastRow() < 2) return map;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
    const cat = String(r[0] || '').trim();
    if(!cat) return;
    if(/^\(?default\)?$/i.test(cat)) map.__default__ = r[1];
    else map[cat.toLowerCase()] = r[1];
  });
  return map;
}


function guestFromRow_(ctx, i){
  return {
    lang:     normLang_(cell_(ctx, i, 'language')),
    category: String(cell_(ctx, i, 'category') || '').trim(),
    priority: String(cell_(ctx, i, 'priority') || '').trim(),
    greeting: String(cell_(ctx, i, 'greeting') || '').trim(),
    household:String(cell_(ctx, i, 'household') || '').trim(),
    names:    String(cell_(ctx, i, 'invitee') || '').trim(),
    plusOne:  truthy_(cell_(ctx, i, 'plus-one')),
    plusName: String(cell_(ctx, i, 'plus-one name') || '').trim(),
    kids:     truthy_(cell_(ctx, i, 'kids?')),
    note:     String(cell_(ctx, i, 'personal note') || '').trim()
  };
}


/* A row is sendable when it has an email and has not been set aside. A blank
   Send? counts as Send, so a freshly imported list works before anyone has
   made a single hold-or-cut decision. */
function sendable_(ctx, i){
  if(!String(cell_(ctx, i, 'email') || '').trim()) return false;
  const st = String(cell_(ctx, i, 'send?') || '').trim().toLowerCase();
  return st === '' || st === 'send';
}


/* Drafts for a set of rows. Each letter is drawn now, so a big batch takes a
   few seconds a row; the run stops itself short of the six-minute limit and
   says how many are left — running the same menu item again continues, since
   drafted rows are marked and skipped. */
function runInvites_(ctx, rowIdxs){
  const deadlines = deadlineMap_();
  const started = Date.now();
  let made = 0, skipped = 0, failed = 0, left = 0, firstError = '';
  for(let k = 0; k < rowIdxs.length; k++){
    const i = rowIdxs[k];
    if(Date.now() - started > 4.5 * 60 * 1000){ left++; continue; }
    const to = String(cell_(ctx, i, 'email') || '').trim();
    if(!sendable_(ctx, i)){ skipped++; continue; }
    const g = guestFromRow_(ctx, i);
    g.token = ensureToken_(ctx, i);
    g.replyBy = deadlineFor_(deadlines, g.category, g.lang);
    let imgs;
    try { imgs = inlineImages_(g, 'invite'); }
    catch(err){ failed++; if(!firstError) firstError = err.message; continue; }
    const m = buildEmail_(g);
    GmailApp.createDraft(to, m.subject, m.text,
      { htmlBody: m.html, name: CFG.SENDER_NAME, replyTo: CFG.REPLY_TO, inlineImages: imgs });
    // record the date we actually promised this guest, not today's config
    setCell_(ctx, i, 'reply by', rawDeadline_(deadlines, g.category));
    setCell_(ctx, i, 'invite status', 'Draft created');
    setCell_(ctx, i, 'invite sent', new Date());
    made++;
  }
  toast_(made + ' draft(s) created in Gmail' +
         (skipped ? ' · ' + skipped + ' skipped (no email, or on Hold/Cut)' : '') +
         (failed ? ' · ⚠ ' + failed + ' could not be drawn — ' + firstError : '') +
         (left ? ' · ' + left + ' not reached before the time limit: run this again' : '') +
         '. Open Gmail ▸ Drafts to review and send.');
}


/* Reminders: anyone invited, still silent, and already past the deadline their
   own category was given. Someone with a June deadline isn't chased in January
   just because the family list was. */
function createReminders(){
  const ctx = readGuests_();
  const deadlines = deadlineMap_();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let made = 0, notDue = 0;

  for(let i = 0; i < ctx.data.length; i++){
    const to = String(cell_(ctx, i, 'email') || '').trim();
    if(!sendable_(ctx, i)) continue;
    if(String(cell_(ctx, i, 'rsvp') || '').trim()) continue;            // already replied
    if(!String(cell_(ctx, i, 'invite status') || '').trim()) continue;  // never invited
    if(String(cell_(ctx, i, 'reminder sent') || '').trim()) continue;   // already nudged

    const g = guestFromRow_(ctx, i);
    const due = cell_(ctx, i, 'reply by') || rawDeadline_(deadlines, g.category);
    if(due instanceof Date && !isNaN(due) && due >= today){ notDue++; continue; }

    g.token = ensureToken_(ctx, i);
    g.replyBy = deadlineFor_(deadlines, g.category, g.lang);
    const m = buildReminder_(g);
    GmailApp.createDraft(to, m.subject, m.text, {
      htmlBody: m.html, name: CFG.SENDER_NAME, replyTo: CFG.REPLY_TO,
      inlineImages: inlineImages_(g, 'reminder')
    });
    setCell_(ctx, i, 'reminder sent', new Date());
    made++;
  }
  toast_(made
    ? made + ' reminder draft(s) created. Review them in Gmail ▸ Drafts.'
      + (notDue ? ' · ' + notDue + ' not chased yet — their deadline is still ahead.' : '')
    : (notDue
        ? 'Nobody is overdue yet — ' + notDue + ' guest(s) still have time.'
        : 'Nobody to remind — everyone invited has either replied or been nudged already.'));
}




/* The selected row's invitation — or the first row's — to your own inbox,
   exactly as that guest would receive it, subject prefixed [TEST]. */
function sendTestToMe(){
  const me = Session.getActiveUser().getEmail() || CFG.REPLY_TO;
  const ctx = readGuests_();
  if(!ctx.data.length){ toast_('Add a guest row first.'); return; }
  const rows = selectedDataRows_(ctx);
  if(!rows.length){ toast_('Click any cell on the guest row you want to test first.'); return; }
  const i = rows[0];
  const who = String(cell_(ctx, i, 'household') || cell_(ctx, i, 'invitee') || 'row ' + (i + 2));
  const g = guestFromRow_(ctx, i);
  g.token = ensureToken_(ctx, i);
  g.replyBy = deadlineFor_(deadlineMap_(), g.category, g.lang);
  toast_('Drawing ' + who + '’s invitation…');
  let imgs;
  try { imgs = inlineImages_(g, 'invite'); }
  catch(err){ toast_('No test sent — ' + err.message); return; }
  const m = buildEmail_(g);
  GmailApp.sendEmail(me, '[TEST] ' + m.subject, m.text, {
    htmlBody: m.html, name: CFG.SENDER_NAME, replyTo: CFG.REPLY_TO, inlineImages: imgs
  });
  toast_('Test of ' + who + '’s invitation sent to ' + me + '.');
}
/* The selected row's invitation exactly as Send would draw it, sent to you on its
   own — the picture, and nothing else, to look at the design or a long note. */
function previewSelectedCard(){
  const ctx = readGuests_();
  if(!ctx.data.length){ toast_('Add a guest row first.'); return; }
  const rows = selectedDataRows_(ctx);
  if(!rows.length){ toast_('Click any cell on the guest row you want to see first.'); return; }
  const i = rows[0];
  const who = String(cell_(ctx, i, 'household') || cell_(ctx, i, 'invitee') || 'row ' + (i + 2));
  const g = guestFromRow_(ctx, i);
  g.token = ensureToken_(ctx, i);
  g.replyBy = deadlineFor_(deadlineMap_(), g.category, g.lang);
  toast_('Drawing ' + who + '’s invitation…');
  let png;
  try { png = mailBlob_(g); }
  catch(err){ toast_('Could not draw it — ' + err.message); return; }
  const me = Session.getActiveUser().getEmail() || CFG.REPLY_TO;
  GmailApp.sendEmail(me, '[PREVIEW] ' + who + '’s invitation', 'The letter as it would be drawn right now.', {
    name: CFG.SENDER_NAME,
    htmlBody: '<img src="cid:letter" width="600" style="display:block;border:0;width:600px;max-width:100%;height:auto;">',
    inlineImages: { letter: png }
  });
  toast_('Preview of ' + who + '’s invitation sent to ' + me + '.');
}


function resetSelectedStatus(){
  const ctx = readGuests_();
  selectedDataRows_(ctx).forEach(i => {
    setCell_(ctx, i, 'invite status', '');
    setCell_(ctx, i, 'invite sent', '');
    setCell_(ctx, i, 'reminder sent', '');
  });
  toast_('Invite status cleared for the selected rows — they are pending again.');
}

function rawDeadline_(map, category){
  const c = String(category || '').trim().toLowerCase();
  const v = (c && map[c] !== undefined) ? map[c] : map.__default__;
  return (v === undefined || v === null || v === '') ? '' : v;
}


/* The deadline as the guest reads it, in their own language. A real date is
   spelled out ("30 aprile 2027"); anything typed as text is used verbatim. */
function deadlineFor_(map, category, lang){
  const v = rawDeadline_(map, category);
  if(v instanceof Date && !isNaN(v)){
    // the calendar day as the sheet shows it — a script whose own timezone
    // differs from the sheet's would otherwise read 30 April as the 29th
    const ymd = Utilities.formatDate(v, book_().getSpreadsheetTimeZone(), 'yyyy-M-d').split('-').map(Number);
    const m = MONTHS[lang] || MONTHS.it;
    return ymd[2] + ' ' + m[ymd[1] - 1] + ' ' + ymd[0];
  }
  const s = String(v || '').trim();
  return s || CFG.RSVP_BY[lang] || CFG.RSVP_BY.it;
}


/* Delete a scratch file outright rather than trashing it: it existed for the
   two seconds it took to draw one invitation, and a bin filling up with
   copies is its own kind of mess. Falls back to the bin if the delete is
   refused, and says nothing either way — a leftover scratch file must never
   be the reason an invitation fails to go out. */
function deleteOwnFile_(id){
  if(!id) return;
  try {
    const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id, {
      method: 'delete', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true });
    if(res.getResponseCode() < 300) return;
  } catch(_){}
  try { DriveApp.getFileById(id).setTrashed(true); } catch(_){}
}

/* Any scratch copies an earlier run left behind — a run that timed out, or
   died before it could clear up after itself. */
function sweepScratch_(){
  let gone = 0;
  try {
    const it = DriveApp.getFilesByName(CFG.SCRATCH);
    while(it.hasNext()){ deleteOwnFile_(it.next().getId()); gone++; }
  } catch(_){}
  return gone;
}

function cleanUpScratch(){
  const gone = sweepScratch_();
  toast_(gone ? gone + ' leftover scratch file(s) deleted.' : 'No scratch files left behind.');
}

/* ============================ 4. RSVPs IN ================================ */
/* The site posts its RSVP form here (form-encoded, no-cors). Every reply is
   logged on the RSVP tab no matter what; if we can identify the guest — by
   their link token, or failing that by the email they typed — the answer is
   also written back onto their row in Guests. */
function doPost(e){
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch(_){ /* proceed anyway rather than drop a reply */ }
  let matched = '';
  try {
    const p = (e && e.parameter) || {};
    const ss = book_();
    const token = String(p.g || p.token || '').trim().toLowerCase();
    const email = String(p.email || '').trim();

    const guests = ss.getSheetByName(SHEETS.GUESTS);
    let row = 0;
    if(guests) row = matchGuestRow_(guests, token, email);
    if(row){
      const hCol = colIndex_('Household');
      matched = String(guests.getRange(row, hCol).getValue() || 'row ' + row);
    }

    const attending = String(p.attending || '').toLowerCase() === 'yes';
    const adults = !attending ? 0 : (String(p.party || '').toLowerCase() === 'plus' ? 2 : 1);
    const kids = !attending ? 0 : Math.max(0, Math.min(20, parseInt(p.kids, 10) || 0));
    const now = new Date();

    const log = ss.getSheetByName(SHEETS.RSVP) || buildRsvp_(ss);
    log.appendRow([
      now, token, matched || (token ? '— unknown token —' : '— no link token —'),
      p.name || '', email, attending ? 'Yes' : 'No', p.phone || '', p.address || '',
      p.party || '', p.plusname || '', kids, p.kidsnames || '',
      p.diet || '', p.shuttle || '', p.staying || '', p.message || '', p.lang || ''
    ]);

    if(row){
      const set = (colName, v) => {
        const c = liveHeader_().indexOf(colName.toLowerCase());
        if(c >= 0) guests.getRange(row, c + 1).setValue(v);
      };
      set('RSVP', attending ? 'Yes' : 'No');
      set('Adults', adults);
      set('Children', kids);
      set('Coming', adults + kids);
      set('Diet', p.diet || '');
      set('Shuttle', String(p.shuttle || '').toLowerCase() === 'yes' ? 'Yes' : (attending ? 'No' : ''));
      set('RSVP at', now);
    }
  } catch(err){
    console.error('RSVP intake failed: ' + err);
  } finally {
    try { lock.releaseLock(); } catch(_){}
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, matched: !!matched }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* The form asks who is arriving, so the page can greet them by name and put
   the right questions in front of them — the plus-one line only to someone who
   has one, the children question only to a household with children.

   This deliberately returns no email, phone or address: a guessed token gets a
   first name and the shape of the invitation, nothing worth harvesting. */
function doGet(e){
  const out = { ok: false };
  try {
    const token = String((e && e.parameter && e.parameter.g) || '').trim().toLowerCase();
    if(token){
      const sh = book_().getSheetByName(SHEETS.GUESTS);
      const row = sh ? matchGuestRow_(sh, token, '') : 0;
      if(row){
        const H = liveHeader_();
        const vals = sh.getRange(row, 1, 1, H.length).getValues()[0];
        const get = (n) => vals[H.indexOf(n.toLowerCase())];
        const lang = normLang_(get('Language'));
        out.ok       = true;
        out.invitee  = String(get('Invitee') || '');
        out.household= String(get('Household') || '');
        out.lang     = lang;
        out.plusOne  = truthy_(get('Plus-one'));
        out.plusName = String(get('Plus-one name') || '');
        out.kids     = truthy_(get('Kids?'));
        out.kidsEst  = Number(get('Kids est.')) || 0;
        out.replied  = !!String(get('RSVP') || '').trim();
        const map = deadlineMap_();
        out.replyBy  = deadlineFor_(map, String(get('Category') || ''), lang);
        // the same day as a plain date, so the site can word it in whichever
        // language the guest is reading, not the one they were written in
        const raw = rawDeadline_(map, String(get('Category') || ''));
        out.replyByISO = (raw instanceof Date && !isNaN(raw))
          ? Utilities.formatDate(raw, book_().getSpreadsheetTimeZone(), 'yyyy-MM-dd') : '';
      }
    }
  } catch(err){
    console.error('guest lookup failed: ' + err);
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Token first (exact, private), email second (a guest who typed the address we
   hold, having lost the link). Returns a 1-based sheet row, or 0 for no match. */
function matchGuestRow_(sh, token, email){
  const last = sh.getLastRow();
  if(last < 2) return 0;
  const H = liveHeader_();
  const tokCol = H.indexOf('token');
  const emCol  = H.indexOf('email');
  const vals = sh.getRange(2, 1, last - 1, H.length).getValues();

  if(token){
    for(let i = 0; i < vals.length; i++){
      if(String(vals[i][tokCol] || '').trim().toLowerCase() === token) return i + 2;
    }
  }
  email = String(email || '').trim().toLowerCase();
  if(email){
    for(let i = 0; i < vals.length; i++){
      const cellVal = String(vals[i][emCol] || '').toLowerCase();
      if(cellVal.split(/[,;]/).some(x => x.trim() === email)) return i + 2;
    }
  }
  return 0;
}

/* ========================= 5. EMAIL BUILDER ============================== */
function buildEmail_(g){
  const c = COPY[g.lang] || COPY.it;
  const greet = greetingOf_(g);
  const plusText = plusLine_(g);
  const link = inviteLink_(g.token || '');
  const by = c.by(g.replyBy || CFG.RSVP_BY[g.lang]);

  /* The invitation is one picture, and the picture is the link. Gmail,
     Outlook and Yahoo all strip web fonts, so nothing set in Pinyon Script or
     EB Garamond survives as live text — drawn, all of it survives, and a
     single image carries no seams between the parts. Wrapping it in the link
     also takes away Gmail's download/save overlay, which otherwise sits on
     top of the invitation whenever the cursor passes over it.

     Everything a guest needs in words — the password, the address, the day —
     is in the plain-text half of the message below, which is what they get if
     they read with images turned off. */
  const html =
`<!doctype html><html lang="${g.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<style>a{text-decoration:none}</style>
</head>
<body style="margin:0;padding:0;background:${T.panna2};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc_(greet)} ${c.tag} — ${c.date}, Villa Corsini a Mezzomonte.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${T.panna2}" style="background:${T.panna2};">
<tr><td align="center" style="padding:30px 12px;">
  <a href="${link}" style="display:block;width:600px;max-width:100%;">
    <img src="cid:mail" width="600" alt="${esc_(greet)} ${c.body} ${esc_(by)}"
         style="display:block;border:0;width:600px;max-width:100%;height:auto;">
  </a>
  <div style="padding:14px 20px 0;font-family:${T.fBody};font-size:12px;color:${T.muted};">
    <a href="${link}" style="color:${T.salviaDeep};">${esc_(c.cta)}</a>
  </div>
</td></tr></table>
</body></html>`;

  const text =
`${greet}

${c.body}
${g.note ? '\n' + g.note + '\n' : ''}
${c.kDay}: ${c.vDay}
${c.kWhere}: ${c.vWhere}
${c.kDress}: ${c.vDress}
${plusText ? '\n' + plusText + '\n' : ''}
${c.siteLead}
${c.pwk}: ${sitePassword_()}
${link}
${by}

${c.close}
Ilaria & Maxime
${CFG.REPLY_TO}`;

  return { subject: CFG.SUBJECT[g.lang] || CFG.SUBJECT.it, html, text };
}

/* A shorter, quieter second email for the people who haven't replied. */
function buildReminder_(g){
  const c = COPY[g.lang] || COPY.it;
  const greet = greetingOf_(g);
  const link = inviteLink_(g.token || '');
  const I = CFG.IMG_BASE;

  const html =
`<!doctype html><html lang="${g.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<style>${FACE_CSS}a{text-decoration:none} @media (max-width:620px){.px{padding-left:20px!important;padding-right:20px!important}.lx{padding-left:22px!important;padding-right:22px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${T.panna2};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${c.rTag} — ${c.date}, Villa Corsini a Mezzomonte.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${T.panna2}" style="background:${T.panna2};">
<tr><td align="center" style="padding:32px 12px;">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="${T.panna}" style="width:600px;max-width:100%;background:${T.panna};">

    <tr><td align="center" style="padding:40px 0 0;">
      <img src="cid:crest" width="82" height="94" alt="" style="display:block;border:0;width:82px;height:auto;">
    </td></tr>

    <tr><td align="center" class="px" style="padding:16px 40px 0;">
      <img src="cid:wordmark" width="300" alt="Ilaria &amp; Maxime" style="display:block;border:0;width:300px;max-width:100%;height:auto;margin:0 auto;">
    </td></tr>

    <tr><td align="center" style="padding:12px 40px 0;font-family:${T.fDisplay};font-style:italic;font-size:19px;color:${T.muted};">${c.rTag}</td></tr>

    <tr><td class="px" style="padding:26px 34px 34px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${T.carta}" style="background:${T.carta};border:1px solid ${T.lineGold};">

        <tr><td class="lx" style="padding:32px 36px 0;font-family:${T.fDisplay};font-size:22px;color:${T.ink};">${esc_(greet)}</td></tr>

        <tr><td class="lx" style="padding:12px 36px 0;font-family:${T.fBody};font-size:16px;line-height:1.7;color:${T.ink};">${c.rBody}</td></tr>

        <tr><td class="lx" style="padding:24px 36px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${factRow_(c.kDay,   c.vDay,   true)}
            ${factRow_(c.kWhere, c.vWhere, false)}
          </table>
        </td></tr>

        <tr><td align="center" style="padding:24px 36px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" bgcolor="${T.panna}" style="border:1px solid ${T.lineGold};background:${T.panna};">
            <tr><td align="center" style="padding:10px 26px;">
              <div style="font-family:${T.fUi};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${T.muted};">${c.pwk}</div>
              <div style="font-family:${T.fUi};font-weight:500;font-size:19px;letter-spacing:5px;color:${T.ink};padding-top:3px;">${esc_(sitePassword_())}</div>
            </td></tr>
          </table>
        </td></tr>

        <tr><td align="center" style="padding:20px 0 0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${T.salvia}">
            <a href="${link}" style="display:inline-block;font-family:${T.fUi};font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#FBF8EF;padding:15px 36px;">${c.cta}</a>
          </td></tr></table>
        </td></tr>

        <tr><td align="center" style="padding:12px 36px 0;font-family:${T.fUi};font-size:11px;letter-spacing:1px;color:${T.muted};">${c.by(g.replyBy || CFG.RSVP_BY[g.lang])}</td></tr>

        <tr><td align="center" style="padding:28px 16px 0;">
          <img src="cid:close" height="20" alt="${c.close}" style="display:block;border:0;height:20px;width:auto;margin:0 auto;">
        </td></tr>
        <tr><td align="center" style="padding:6px 36px 32px;">
          <img src="cid:wordmark" width="190" alt="Ilaria &amp; Maxime" style="display:block;border:0;width:190px;max-width:100%;height:auto;margin:0 auto;">
        </td></tr>

      </table>
    </td></tr>

    <tr><td align="center" class="px" style="padding:0 40px 40px;font-family:${T.fUi};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${T.muted};">${c.fl}</td></tr>

  </table>
</td></tr></table>
</body></html>`;

  const text =
`${greet}

${c.rBody}

${c.kDay}: ${c.vDay}
${c.kWhere}: ${c.vWhere}

${c.pwk}: ${sitePassword_()}
${link}
${c.by(g.replyBy || CFG.RSVP_BY[g.lang])}

${c.close}
Ilaria & Maxime
${CFG.REPLY_TO}`;

  return { subject: CFG.SUBJECT_R[g.lang] || CFG.SUBJECT_R.it, html, text };
}

/* small html fragments */
function factRow_(k, v, first){
  const top = first ? '' : 'border-top:1px solid ' + T.line + ';';
  return '<tr>' +
    '<td style="' + top + 'padding:12px 14px 12px 0;font-family:' + T.fUi + ';font-size:10px;letter-spacing:3px;text-transform:uppercase;color:' + T.salviaDeep + ';white-space:nowrap;vertical-align:middle;">' + k + '</td>' +
    '<td align="right" style="' + top + 'padding:12px 0;font-family:' + T.fBody + ';font-size:16px;color:' + T.ink + ';vertical-align:middle;">' + v + '</td>' +
  '</tr>';
}

/* ====================== 6. sheet plumbing =============================== */
/* The web app has no "active spreadsheet", so the workbook id is remembered in
   script properties the first time setup runs. */
function book_(){
  const props = PropertiesService.getScriptProperties();
  // The sheet you have open, whenever there is one: a copy fetched by id is a
  // different object and knows nothing about which cells you selected.
  const ss = SpreadsheetApp.getActive();
  if(ss){
    try { props.setProperty('SHEET_ID', ss.getId()); } catch(_){}
    return ss;
  }
  const id = props.getProperty('SHEET_ID');
  if(id){ try { return SpreadsheetApp.openById(id); } catch(_){ /* fall through */ } }
  throw new Error('No workbook bound yet — open the sheet and run "Set up / repair the workbook" once.');
}

function readGuests_(){
  const ss = book_();
  const sh = ss.getSheetByName(SHEETS.GUESTS) || buildGuests_(ss);
  const values = sh.getDataRange().getValues();
  const header = (values[0] || []).map(h => String(h).trim().toLowerCase());
  const idx = {};
  header.forEach((h, c) => { const k = canon_(h); if(k && !(k in idx)) idx[k] = c; });
  GUEST_HEADER.forEach((h, i) => { const k = h.toLowerCase(); if(!(k in idx)) idx[k] = i; });
  return { sh, header, idx, data: values.slice(1) };
}

/* Any exact header name is its own key; the table below only exists for the
   older or translated headings an imported list might arrive with. Deriving
   the rest from GUEST_HEADER means a new column is never silently unreadable. */
const CANON_ALIASES = {
  'group':'household', 'gruppo':'household', 'famiglia':'household', 'famille':'household',
  'names':'invitee', 'name':'invitee', 'nome':'invitee', 'nom':'invitee', 'guests':'invitee',
  'invitati':'invitee', 'invités':'invitee', 'invitee':'invitee',
  'e-mail':'email', 'mail':'email',
  'plus one':'plus-one', 'plusone':'plus-one', '+1':'plus-one', 'accompagnatore':'plus-one',
  'accompagnant':'plus-one',
  'plus one name':'plus-one name', 'plusone name':'plus-one name',
  'kids':'kids?', 'children?':'kids?', 'bambini':'kids?', 'enfants':'kids?',
  'kids est':'kids est.', 'kids estimate':'kids est.', 'children est.':'kids est.',
  'lang':'language', 'langue':'language', 'lingua':'language',
  'categoria':'category', 'catégorie':'category',
  'sub category':'subcategory', 'sub-category':'subcategory', 'circle':'subcategory',
  'maxime/ilaria':'side', 'lato':'side', 'côté':'side',
  'priorità':'priority', 'priorite':'priority', 'priorité':'priority', 'tier':'priority',
  'send':'send?', 'status':'send?', 'decision':'send?',
  'batch':'wave',
  'salutation':'greeting', 'saluto':'greeting', 'salut':'greeting',
  'note':'personal note', 'messaggio':'personal note',
  'code':'token', 'codice':'token',
  'link':'invite link', 'lien':'invite link',
  'deadline':'reply by', 'rsvp by':'reply by', 'scadenza':'reply by',
  'sent':'invite sent', 'reminder':'reminder sent',
  'risposta':'rsvp', 'réponse':'rsvp',
  'headcount':'coming', 'presenti':'coming',
  'allergie':'diet', 'dietary':'diet',
  'navetta':'shuttle',
  'replied at':'rsvp at', 'last updated':'rsvp at', 'updated':'rsvp at'
};

function canon_(h){
  h = String(h || '').trim().toLowerCase();
  if(!h) return '';
  for(let i = 0; i < GUEST_HEADER.length; i++){
    if(GUEST_HEADER[i].toLowerCase() === h) return h;
  }
  return CANON_ALIASES[h] || '';
}

function cell_(ctx, rowIdx, key){
  const c = ctx.idx[key];
  if(c === undefined) return '';
  const r = ctx.data[rowIdx];
  return r ? r[c] : '';
}

/* Writes to the sheet and keeps the in-memory copy in step, so a run that
   touches the same row twice sees its own edits. */
function setCell_(ctx, rowIdx, key, value){
  const c = ctx.idx[key];
  if(c === undefined) return;
  ctx.sh.getRange(rowIdx + 2, c + 1).setValue(value);
  if(ctx.data[rowIdx]) ctx.data[rowIdx][c] = value;
}

/* Rows the user has highlighted. Rows hidden by the filter are dropped: with a
   category filter on, dragging down column A spans the hidden rows too, and
   drafting those would quietly invite the wrong people. */
function selectedDataRows_(ctx){
  const sh = ctx.sh;
  const active = SpreadsheetApp.getActiveSheet();
  if(!active || active.getSheetId() !== sh.getSheetId()) return [];
  const list = active.getActiveRangeList();
  const ranges = list ? list.getRanges() : [active.getActiveRange()].filter(Boolean);
  const set = {};
  ranges.forEach(r => {
    const start = r.getRow(), n = r.getNumRows();
    for(let row = start; row < start + n; row++){
      if(row >= 2 && !isHidden_(sh, row)) set[row - 2] = true;
    }
  });
  return Object.keys(set).map(Number).filter(i => i >= 0 && i < ctx.data.length).sort((a, b) => a - b);
}

/* Every data row the current filter leaves showing. */
function visibleDataRows_(ctx){
  const out = [];
  for(let i = 0; i < ctx.data.length; i++){
    if(!isHidden_(ctx.sh, i + 2)) out.push(i);
  }
  return out;
}

function isHidden_(sh, row){
  try { return sh.isRowHiddenByFilter(row) || sh.isRowHiddenByUser(row); }
  catch(_){ return false; }
}

/* ============================ 7. helpers ================================ */
function esc_(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function toast_(msg){ SpreadsheetApp.getActive().toast(msg, '💌 Wedding HQ', 8); }
