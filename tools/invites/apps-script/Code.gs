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
  SITE_URL    : 'https://matoui01.github.io/Wedding/',
  PASSWORD    : 'XXXXXX',                 // ← the site password from your invite gate
  SENDER_NAME : 'Ilaria & Maxime',
  REPLY_TO    : 'maxime.ilaria@gmail.com',

  // Hosted images, already live on the site.
  IMG_BASE : 'https://matoui01.github.io/Wedding/assets/img/',
  IMG_CREST: 'email-crest.png',
  IMG_SPRIG: 'email-sprig.png',
  IMG_HERO : 'estate-cut.png',

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

/* --------- palette / type (kept in sync with the site tokens) ------------ */
const T = {
  panna:'#FAF6EC', panna2:'#F2EBD9', salvia:'#93A586', salviaDeep:'#6E7B5B',
  terracotta:'#C47A54', oro:'#B08D4F', ink:'#3D352A', muted:'#897C68',
  line:'#E4DCC9', lineGold:'#DCC9A4',
  fDisplay:"'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  fBody:"'EB Garamond', Georgia, 'Times New Roman', serif",
  fUi:"'Jost', Helvetica, Arial, sans-serif",
  fScript:"'Pinyon Script', 'Cormorant Garamond', Georgia, cursive"
};

/* ------------------------- trilingual copy ------------------------------- */
const COPY = {
  it:{
    over:'VILLA CORSINI A MEZZOMONTE · FIRENZE', tag:'Ci sposiamo', date:'Venerdì 23 luglio 2027',
    fallbackGreet:'Cari tutti,',
    body:'Insieme alle nostre famiglie, abbiamo la gioia di invitarvi a celebrare il nostro matrimonio. Ci sposiamo tra le colline di Firenze, a Villa Corsini a Mezzomonte: una giornata di festa fra giardini, arte e buon vino, con le persone che amiamo.',
    kDay:'Il giorno', vDay:'Venerdì 23 luglio 2027',
    kWhere:'Dove', vWhere:'Villa Corsini a Mezzomonte · Impruneta, Firenze',
    kDress:'Dress code', vDress:'Cocktail elegante',
    plus:'Saremo felici di accogliere anche il vostro accompagnatore.',
    plusNamed:d=>'Saremo felici di accogliere anche '+d+'.',
    siteLead:'Programma, viaggio, regali e conferma di presenza sono tutti sul nostro sito.',
    pwk:'Password del sito', cta:'Apri il sito e rispondi',
    by:d=>'Vi preghiamo di confermare entro il '+d+'.',
    close:'A presto,',
    fl:'Ilaria & Maxime · 23 luglio 2027 · Villa Corsini a Mezzomonte',
    fcLead:'Domande?',
    rTag:'Un piccolo promemoria',
    rBody:'Non abbiamo ancora ricevuto la vostra risposta per il 23 luglio 2027 a Villa Corsini a Mezzomonte. Ci farebbe davvero piacere sapere se ci sarete — bastano due minuti sul sito. E se avete già risposto, perdonateci il doppio messaggio!'
  },
  fr:{
    over:'VILLA CORSINI A MEZZOMONTE · FLORENCE', tag:'Nous nous marions', date:'Vendredi 23 juillet 2027',
    fallbackGreet:'Chers tous,',
    body:'Avec nos familles, nous avons la joie de vous inviter à célébrer notre mariage. Nous nous marions sur les collines de Florence, à la Villa Corsini a Mezzomonte : une journée de fête entre jardins, art et bon vin, avec ceux que nous aimons.',
    kDay:'Le jour', vDay:'Vendredi 23 juillet 2027',
    kWhere:'Lieu', vWhere:'Villa Corsini a Mezzomonte · Impruneta, Florence',
    kDress:'Tenue', vDress:'Cocktail élégant',
    plus:"Vous pouvez venir accompagné·e — nous serons ravis de l'accueillir.",
    plusNamed:d=>'Nous serons ravis d’accueillir également '+d+'.',
    siteLead:'Le programme, le voyage, les cadeaux et votre réponse sont sur notre site.',
    pwk:'Mot de passe du site', cta:'Ouvrir le site et répondre',
    by:d=>'Merci de confirmer avant le '+d+'.',
    close:'À très bientôt,',
    fl:'Ilaria & Maxime · 23 juillet 2027 · Villa Corsini a Mezzomonte',
    fcLead:'Questions ?',
    rTag:'Un petit rappel',
    rBody:"Nous n'avons pas encore reçu votre réponse pour le 23 juillet 2027 à la Villa Corsini a Mezzomonte. Cela nous ferait vraiment plaisir de savoir si vous serez des nôtres — deux minutes sur le site suffisent. Et si vous avez déjà répondu, pardonnez-nous ce doublon !"
  },
  en:{
    over:'VILLA CORSINI A MEZZOMONTE · FLORENCE', tag:"We're getting married", date:'Friday · 23 July 2027',
    fallbackGreet:'Dear all,',
    body:"Together with our families, we are delighted to invite you to celebrate our wedding. We're getting married in the hills of Florence, at Villa Corsini a Mezzomonte — a day of celebration among gardens, art and good wine, with the people we love.",
    kDay:'The day', vDay:'Friday 23 July 2027',
    kWhere:'Where', vWhere:'Villa Corsini a Mezzomonte · Impruneta, Florence',
    kDress:'Dress code', vDress:'Elegant cocktail',
    plus:"You're warmly invited to bring a plus-one.",
    plusNamed:d=>"We'd be delighted to welcome "+d+' as well.',
    siteLead:'The programme, travel, gifts and your RSVP all live on our site.',
    pwk:'Site password', cta:'Open the site and RSVP',
    by:d=>'Kindly reply by '+d+'.',
    close:'See you soon,',
    fl:'Ilaria & Maxime · 23 July 2027 · Villa Corsini a Mezzomonte',
    fcLead:'Questions?',
    rTag:'A gentle reminder',
    rBody:"We haven't yet had your reply for 23 July 2027 at Villa Corsini a Mezzomonte. We'd love to know whether you can join us — it only takes two minutes on the site. And if you've already replied, do forgive the duplicate!"
  }
};

/* Column letters are derived, never typed: every formula below asks
   GUEST_HEADER where a column actually is. Inserting a column then costs
   nothing, where a hard-coded "!V2:V" would quietly start reading its
   neighbour. */
function colLetter_(name){
  const i = GUEST_HEADER.indexOf(name);
  if(i < 0) throw new Error('unknown Guests column: ' + name);
  let n = i + 1, out = '';
  while(n > 0){ const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
}
function gCol_(name){ const L = colLetter_(name); return SHEETS.GUESTS + '!' + L + '2:' + L; }
function gA1_(name){ const L = colLetter_(name); return L + '2:' + L; }

/* =============================== MENU ==================================== */
function onOpen(){
  SpreadsheetApp.getUi().createMenu('💌 Wedding HQ')
    .addItem('Set up / repair the workbook',   'setupWorkbook')
    .addSeparator()
    .addItem('Generate missing invite links',  'generateLinks')
    .addItem('Create drafts — selected rows',  'createDraftsForSelected')
    .addItem('Create drafts — filtered rows',  'createDraftsForFiltered')
    .addItem('Create drafts — a whole wave…',  'createDraftsForWave')
    .addSeparator()
    .addItem('Create reminder drafts — past their deadline', 'createReminders')
    .addSeparator()
    .addItem('Send a test to me',              'sendTestToMe')
    .addItem('Reset invite status — selected rows', 'resetSelectedStatus')
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
  toast_('Workbook ready. Fill in Guests (columns A–N), then run "Generate missing invite links".');
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
  sh.getRange(1, 1, 1, GUEST_HEADER.length).setValues([GUEST_HEADER]);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);

  sh.getRange(1, 1, 1, GUEST_FILL_COLS)
    .setBackground(T.salvia).setFontColor('#FFFFFF').setFontWeight('bold');
  sh.getRange(1, GUEST_FILL_COLS + 1, 1, GUEST_HEADER.length - GUEST_FILL_COLS)
    .setBackground(T.panna2).setFontColor(T.muted).setFontWeight('bold').setFontStyle('italic');
  sh.getRange(1, 1, 1, GUEST_HEADER.length).setVerticalAlignment('middle');
  sh.setRowHeight(1, 34);

  const widths = [190, 150, 80, 140, 70, 80, 130, 150, 80, 70, 70, 60, 230, 90, 190, 250,
                  60, 80, 290, 110, 120, 110, 110, 70, 70, 70, 70, 190, 80, 130];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));

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

  // the script-written block, tinted so nobody types into it
  sh.getRange(2, GUEST_FILL_COLS + 1, Math.max(sh.getMaxRows() - 1, 1),
              GUEST_HEADER.length - GUEST_FILL_COLS).setBackground('#FCFAF4');
  R('Reply by').setNumberFormat('d mmm yyyy');

  // Seats you are planning for: the invitee, a plus-one if they have one, and
  // your own estimate of their children. Replaced by the real count on reply.
  sh.getRange(colLetter_('Seats') + '2').setFormula(
    '=ARRAYFORMULA(IF(' + gA1_('Invitee') + '="","",' +
    '1+IF(LOWER(' + gA1_('Plus-one') + ')="yes",1,0)+N(' + gA1_('Kids est.') + ')))');

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
    rule().whenFormulaSatisfied('=AND($' + colLetter_('Invitee') + '2<>"",$' + colLetter_('Email') + '2="")')
      .setBackground('#F6E6DE').setRanges([R('Email')]).build(),
    // your estimate versus what the parents actually said
    rule().whenFormulaSatisfied('=AND($' + colLetter_('RSVP') + '2<>"",$' +
        colLetter_('Children') + '2<>$' + colLetter_('Kids est.') + '2)')
      .setBackground('#F4EEDD').setRanges([R('Children')]).build()
  ]);

  if(!sh.getFilter()){
    sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), GUEST_HEADER.length).createFilter();
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
    ['Awaiting reply',     '=SUMIFS(' + gCol_('Seats') + ',' + gCol_('Invite sent') + ',"<>",' + gCol_('RSVP') + ',"")'],
    ['Room left to offer', '=B5-B6-B7'],
    ['On hold',            '=SUMIF(' + gCol_('Send?') + ',"Hold",' + gCol_('Seats') + ')'],
    ['Cut',                '=SUMIF(' + gCol_('Send?') + ',"Cut",' + gCol_('Seats') + ')'],
    ['', ''],
    ['INVITES', ''],
    ['Queued to send',     '=SUMIFS(' + gCol_('Seats') + ',' + gCol_('Send?') + ',"Send",' + gCol_('Invite sent') + ',"")'],
    ['Drafts created',     '=COUNTIF(' + gCol_('Invite status') + ',"*draft*")'],
    ['Invites sent',       '=COUNTA(' + gCol_('Invite sent') + ')'],
    ['Reminders sent',     '=COUNTA(' + gCol_('Reminder sent') + ')'],
    ['Missing an email',   '=COUNTIFS(' + gCol_('Invitee') + ',"<>",' + gCol_('Email') + ',"")'],
    ['', ''],
    ['REPLIES', ''],
    ['Replied',            '=COUNTIF(' + gCol_('RSVP') + ',"<>")'],
    ['Coming (households)','=COUNTIF(' + gCol_('RSVP') + ',"Yes")'],
    ['Not coming',         '=COUNTIF(' + gCol_('RSVP') + ',"No")'],
    ['Children — you guessed', '=SUM(' + gCol_('Kids est.') + ')'],
    ['Children — confirmed',   '=SUM(' + gCol_('Children') + ')'],
    ['Shuttle seats',      '=SUMIF(' + gCol_('Shuttle') + ',"Yes",' + gCol_('Coming') + ')']
  ];
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
      sh.getRange(r, 5).setFormula('=COUNTIF(' + gc + ',' + q + ')');
      sh.getRange(r, 6).setFormula('=SUMIF(' + gc + ',' + q + ',' + gCol_('Seats') + ')');
      sh.getRange(r, 7).setFormula('=COUNTIFS(' + gc + ',' + q + ',' + gCol_('RSVP') + ',"<>")');
      sh.getRange(r, 8).setFormula('=SUMIFS(' + gCol_('Coming') + ',' + gc + ',' + q + ')');
      if(withDeadline){
        sh.getRange(r, 9).setFormula('=IFERROR(VLOOKUP(D' + r + ',' + D + '!A:B,2,FALSE),"")')
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
    sh.getRange(anchor + '6').setFormula(formula);
  }
  listBlock('K', 'NEXT TO PROMOTE — on hold, best priority first',
    ['Household', 'Subcategory', 'Priority', 'Seats'],
    '=IFERROR(SORT(FILTER({' + gCol_('Household') + ',' + gCol_('Subcategory') + ',' +
      gCol_('Priority') + ',' + gCol_('Seats') + '},(' + gCol_('Send?') + '="Hold")*(' +
      gCol_('Household') + '<>"")),3,TRUE),"— nobody on hold —")');

  listBlock('P', 'WHO HASN’T REPLIED — invited, still silent',
    ['Household', 'Subcategory', 'Priority'],
    '=IFERROR(SORT(FILTER({' + gCol_('Household') + ',' + gCol_('Subcategory') + ',' +
      gCol_('Priority') + '},(' + gCol_('Invite sent') + '<>"")*(' + gCol_('RSVP') + '="")),3,TRUE),' +
      '"— everyone invited has replied —")');

  listBlock('T', 'DIETARY NEEDS', ['Household', 'Note'],
    '=IFERROR(FILTER({' + gCol_('Household') + ',' + gCol_('Diet') + '},' +
      gCol_('Diet') + '<>""),"— none noted yet —")');

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

function generateLinks(){
  const ctx = readGuests_();
  let made = 0;
  for(let i = 0; i < ctx.data.length; i++){
    if(!String(cell_(ctx, i, 'invitee') || cell_(ctx, i, 'email') || '').trim()) continue;
    if(String(cell_(ctx, i, 'token') || '').trim()) continue;
    ensureToken_(ctx, i);
    made++;
  }
  toast_(made
    ? made + ' invite link(s) generated.'
    : 'Every guest already has an invite link.');
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

function runInvites_(ctx, rowIdxs){
  const deadlines = deadlineMap_();
  let made = 0, skipped = 0;
  rowIdxs.forEach(i => {
    const to = String(cell_(ctx, i, 'email') || '').trim();
    if(!sendable_(ctx, i)){ skipped++; return; }
    const g = guestFromRow_(ctx, i);
    g.token = ensureToken_(ctx, i);
    g.replyBy = deadlineFor_(deadlines, g.category, g.lang);
    const m = buildEmail_(g);
    GmailApp.createDraft(to, m.subject, m.text, {
      htmlBody: m.html, name: CFG.SENDER_NAME, replyTo: CFG.REPLY_TO
    });
    // record the date we actually promised this guest, not today's config
    setCell_(ctx, i, 'reply by', rawDeadline_(deadlines, g.category));
    setCell_(ctx, i, 'invite status', 'Draft created');
    setCell_(ctx, i, 'invite sent', new Date());
    made++;
  });
  toast_(made + ' draft(s) created in Gmail' +
         (skipped ? ' · ' + skipped + ' skipped (no email, or on Hold/Cut)' : '') +
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
      htmlBody: m.html, name: CFG.SENDER_NAME, replyTo: CFG.REPLY_TO
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

function sendTestToMe(){
  const me = Session.getActiveUser().getEmail() || CFG.REPLY_TO;
  const ctx = readGuests_();
  const deadlines = deadlineMap_();
  let g;
  if(ctx.data.length){
    g = guestFromRow_(ctx, 0);
    g.token = String(cell_(ctx, 0, 'token') || '').trim() || 'testtok';
  } else {
    g = { lang:'it', category:'', greeting:'Cari Marco e Giulia,', names:'', plusOne:true,
          note:'Non vediamo l’ora di festeggiare con voi.', token:'testtok' };
  }
  g.replyBy = deadlineFor_(deadlines, g.category, g.lang);
  const m = buildEmail_(g);
  GmailApp.sendEmail(me, '[TEST] ' + m.subject, m.text, {
    htmlBody: m.html, name: CFG.SENDER_NAME, replyTo: CFG.REPLY_TO
  });
  toast_('Test sent to ' + me + '.');
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

function guestFromRow_(ctx, i){
  return {
    lang:     normLang_(cell_(ctx, i, 'language')),
    category: String(cell_(ctx, i, 'category') || '').trim(),
    priority: String(cell_(ctx, i, 'priority') || '').trim(),
    greeting: String(cell_(ctx, i, 'greeting') || '').trim(),
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
    const m = MONTHS[lang] || MONTHS.it;
    return v.getDate() + ' ' + m[v.getMonth()] + ' ' + v.getFullYear();
  }
  const s = String(v || '').trim();
  return s || CFG.RSVP_BY[lang] || CFG.RSVP_BY.it;
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
      const hCol = GUEST_HEADER.indexOf('Household') + 1;
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
        const c = GUEST_HEADER.indexOf(colName);
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
        const vals = sh.getRange(row, 1, 1, GUEST_HEADER.length).getValues()[0];
        const get = (n) => vals[GUEST_HEADER.indexOf(n)];
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
        out.replyBy  = deadlineFor_(deadlineMap_(), String(get('Category') || ''), lang);
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
  const tokCol = GUEST_HEADER.indexOf('Token');
  const emCol  = GUEST_HEADER.indexOf('Email');
  const vals = sh.getRange(2, 1, last - 1, GUEST_HEADER.length).getValues();

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
  const greet = g.greeting || (g.names ? greetingFromNames_(g.names, g.lang) : c.fallbackGreet);
  const note = (g.note ? noteBlock_(esc_(g.note)) : '');
  const plus = (g.plusOne ? plusBlock_(plusLine_(c, g)) : '');
  const link = inviteLink_(g.token || '');
  const I = CFG.IMG_BASE;

  const html =
`<!doctype html><html lang="${g.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=EB+Garamond:ital,wght@0,400;1,400&family=Pinyon+Script&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>a{text-decoration:none} @media (max-width:620px){.px{padding-left:24px!important;padding-right:24px!important}.nm{font-size:60px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${T.panna2};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${c.tag} — ${c.date}, Villa Corsini a Mezzomonte.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.panna2};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:${T.panna};border-radius:3px;">

    <tr><td align="center" style="padding:40px 0 0;">
      <img src="${I}${CFG.IMG_CREST}" width="120" height="138" alt="Ilaria & Maxime" style="display:block;border:0;width:120px;height:auto;">
    </td></tr>

    <tr><td align="center" class="px" style="padding:22px 40px 0;font-family:${T.fUi};font-size:11px;letter-spacing:5px;color:${T.salviaDeep};text-transform:uppercase;">${c.over}</td></tr>

    <tr><td align="center" class="nm" style="padding:6px 16px 0;font-family:${T.fScript};font-size:76px;line-height:0.9;color:${T.ink};">Ilaria <span style="color:${T.terracotta};">&amp;</span> Maxime</td></tr>

    <tr><td align="center" style="padding:4px 16px 0;font-family:${T.fDisplay};font-style:italic;font-size:23px;color:${T.muted};">${c.tag}</td></tr>

    <tr><td align="center" style="padding:14px 16px 0;font-family:${T.fUi};font-size:13px;letter-spacing:4px;color:${T.ink};text-transform:uppercase;">${c.date}</td></tr>

    <tr><td style="padding:26px 0 0;">
      <img src="${I}${CFG.IMG_HERO}" width="600" alt="Villa Corsini a Mezzomonte" style="display:block;border:0;width:100%;height:auto;">
    </td></tr>

    <tr><td class="px" style="padding:30px 52px 0;font-family:${T.fDisplay};font-size:24px;color:${T.ink};">${esc_(greet)}</td></tr>

    <tr><td class="px" style="padding:14px 52px 0;font-family:${T.fBody};font-size:17px;line-height:1.62;color:${T.ink};">${c.body}</td></tr>

    ${note}

    <tr><td class="px" style="padding:30px 52px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${factRow_(c.kDay,   c.vDay,   true)}
        ${factRow_(c.kWhere, c.vWhere, false)}
        ${factRow_(c.kDress, c.vDress, false)}
      </table>
    </td></tr>

    ${plus}

    <tr><td align="center" style="padding:30px 0 6px;">
      <img src="${I}${CFG.IMG_SPRIG}" width="24" height="24" alt="" style="display:block;border:0;width:24px;height:auto;">
    </td></tr>

    <tr><td class="px" align="center" style="padding:14px 52px 0;font-family:${T.fBody};font-size:17px;line-height:1.55;color:${T.ink};">${c.siteLead}</td></tr>

    <tr><td align="center" style="padding:18px 52px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid ${T.lineGold};border-radius:3px;background:${T.panna2};">
        <tr><td align="center" style="padding:11px 26px;">
          <div style="font-family:${T.fUi};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${T.muted};">${c.pwk}</div>
          <div style="font-family:${T.fUi};font-weight:500;font-size:20px;letter-spacing:5px;color:${T.ink};padding-top:3px;">${esc_(CFG.PASSWORD)}</div>
        </td></tr>
      </table>
    </td></tr>

    <tr><td align="center" style="padding:22px 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${T.salvia}" style="border-radius:2px;">
        <a href="${link}" style="display:inline-block;font-family:${T.fUi};font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#FBF8EF;padding:15px 36px;">${c.cta}</a>
      </td></tr></table>
    </td></tr>

    <tr><td align="center" style="padding:14px 40px 0;font-family:${T.fUi};font-size:12px;letter-spacing:1px;color:${T.muted};">${c.by(g.replyBy || CFG.RSVP_BY[g.lang])}</td></tr>

    <tr><td align="center" style="padding:34px 16px 0;font-family:${T.fDisplay};font-style:italic;font-size:22px;color:${T.ink};">${c.close}</td></tr>
    <tr><td align="center" style="padding:2px 16px 0;font-family:${T.fScript};font-size:34px;color:${T.ink};">Ilaria &amp; Maxime</td></tr>

    <tr><td style="padding:34px 40px 0;"><div style="border-top:1px solid ${T.line};"></div></td></tr>
    <tr><td align="center" style="padding:18px 40px 6px;font-family:${T.fUi};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${T.muted};">${c.fl}</td></tr>
    <tr><td align="center" style="padding:0 40px 42px;font-family:${T.fBody};font-size:13px;color:${T.muted};">${c.fcLead} <a href="mailto:${CFG.REPLY_TO}" style="color:${T.salviaDeep};">${CFG.REPLY_TO}</a></td></tr>

  </table>
</td></tr></table>
</body></html>`;

  const text =
`${greet}

${c.body}
${g.note ? '\n' + g.note + '\n' : ''}
${c.kDay}: ${c.vDay}
${c.kWhere}: ${c.vWhere}
${c.kDress}: ${c.vDress}
${g.plusOne ? '\n' + c.plus + '\n' : ''}
${c.siteLead}
${c.pwk}: ${CFG.PASSWORD}
${link}
${c.by(g.replyBy || CFG.RSVP_BY[g.lang])}

${c.close}
Ilaria & Maxime
${CFG.REPLY_TO}`;

  return { subject: CFG.SUBJECT[g.lang] || CFG.SUBJECT.it, html, text };
}

/* A shorter, quieter second email for the people who haven't replied. */
function buildReminder_(g){
  const c = COPY[g.lang] || COPY.it;
  const greet = g.greeting || (g.names ? greetingFromNames_(g.names, g.lang) : c.fallbackGreet);
  const link = inviteLink_(g.token || '');
  const I = CFG.IMG_BASE;

  const html =
`<!doctype html><html lang="${g.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=EB+Garamond:ital,wght@0,400;1,400&family=Pinyon+Script&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>a{text-decoration:none} @media (max-width:620px){.px{padding-left:24px!important;padding-right:24px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${T.panna2};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.panna2};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:${T.panna};border-radius:3px;">

    <tr><td align="center" style="padding:38px 0 0;">
      <img src="${I}${CFG.IMG_CREST}" width="86" height="99" alt="Ilaria & Maxime" style="display:block;border:0;width:86px;height:auto;">
    </td></tr>

    <tr><td align="center" style="padding:18px 40px 0;font-family:${T.fDisplay};font-style:italic;font-size:22px;color:${T.muted};">${c.rTag}</td></tr>

    <tr><td class="px" style="padding:26px 52px 0;font-family:${T.fDisplay};font-size:23px;color:${T.ink};">${esc_(greet)}</td></tr>

    <tr><td class="px" style="padding:14px 52px 0;font-family:${T.fBody};font-size:17px;line-height:1.62;color:${T.ink};">${c.rBody}</td></tr>

    <tr><td class="px" style="padding:26px 52px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${factRow_(c.kDay,   c.vDay,   true)}
        ${factRow_(c.kWhere, c.vWhere, false)}
      </table>
    </td></tr>

    <tr><td align="center" style="padding:26px 52px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid ${T.lineGold};border-radius:3px;background:${T.panna2};">
        <tr><td align="center" style="padding:11px 26px;">
          <div style="font-family:${T.fUi};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${T.muted};">${c.pwk}</div>
          <div style="font-family:${T.fUi};font-weight:500;font-size:20px;letter-spacing:5px;color:${T.ink};padding-top:3px;">${esc_(CFG.PASSWORD)}</div>
        </td></tr>
      </table>
    </td></tr>

    <tr><td align="center" style="padding:22px 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${T.salvia}" style="border-radius:2px;">
        <a href="${link}" style="display:inline-block;font-family:${T.fUi};font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#FBF8EF;padding:15px 36px;">${c.cta}</a>
      </td></tr></table>
    </td></tr>

    <tr><td align="center" style="padding:14px 40px 0;font-family:${T.fUi};font-size:12px;letter-spacing:1px;color:${T.muted};">${c.by(g.replyBy || CFG.RSVP_BY[g.lang])}</td></tr>

    <tr><td align="center" style="padding:30px 16px 0;font-family:${T.fDisplay};font-style:italic;font-size:21px;color:${T.ink};">${c.close}</td></tr>
    <tr><td align="center" style="padding:2px 16px 0;font-family:${T.fScript};font-size:32px;color:${T.ink};">Ilaria &amp; Maxime</td></tr>

    <tr><td style="padding:30px 40px 0;"><div style="border-top:1px solid ${T.line};"></div></td></tr>
    <tr><td align="center" style="padding:16px 40px 38px;font-family:${T.fUi};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${T.muted};">${c.fl}</td></tr>

  </table>
</td></tr></table>
</body></html>`;

  const text =
`${greet}

${c.rBody}

${c.kDay}: ${c.vDay}
${c.kWhere}: ${c.vWhere}

${c.pwk}: ${CFG.PASSWORD}
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
function noteBlock_(noteHtml){
  return '<tr><td class="px" style="padding:24px 52px 0;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1EA;border-left:3px solid ' + T.salvia + ';border-radius:2px;">' +
    '<tr><td style="padding:16px 20px;font-family:' + T.fBody + ';font-style:italic;font-size:16px;line-height:1.55;color:' + T.ink + ';">' + noteHtml + '</td></tr></table></td></tr>';
}
/* "…and we'd love to see Sophie too" reads better than "bring a plus-one" —
   but only when we actually know the name. Placeholders like "femme" or
   "copine" in the sheet are left blank, and the guest gets the general line. */
function plusLine_(c, g){
  return (g.plusName && c.plusNamed) ? c.plusNamed(esc_(g.plusName)) : c.plus;
}

function plusBlock_(txt){
  return '<tr><td align="center" class="px" style="padding:24px 52px 0;font-family:' + T.fDisplay + ';font-style:italic;font-size:18px;color:' + T.salviaDeep + ';">' + txt + '</td></tr>';
}

/* ====================== 6. sheet plumbing =============================== */
/* The web app has no "active spreadsheet", so the workbook id is remembered in
   script properties the first time setup runs. */
function book_(){
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if(id){ try { return SpreadsheetApp.openById(id); } catch(_){ /* fall through */ } }
  const ss = SpreadsheetApp.getActive();
  if(ss){
    try { props.setProperty('SHEET_ID', ss.getId()); } catch(_){}
    return ss;
  }
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
  const ranges = (sh.getActiveRangeList() ? sh.getActiveRangeList().getRanges() : [sh.getActiveRange()]);
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
function normLang_(v){ v = String(v || '').trim().toLowerCase().slice(0, 2); return (v === 'fr' || v === 'en' || v === 'it') ? v : 'it'; }
function truthy_(v){ v = String(v || '').trim().toLowerCase(); return v === 'yes' || v === 'y' || v === 'true' || v === '1' || v === 'si' || v === 'sì' || v === 'oui' || v === 'x'; }
function greetingFromNames_(names, lang){
  const lead = { it:'Cari ', fr:'Chers ', en:'Dear ' }[lang] || 'Dear ';
  return lead + names + ',';
}
function esc_(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function toast_(msg){ SpreadsheetApp.getActive().toast(msg, '💌 Wedding HQ', 8); }
