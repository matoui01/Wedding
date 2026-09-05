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

/* Guests tab — columns A…T. You fill A–I; the script writes J–T. */
const GUEST_HEADER = [
  'Group', 'Names', 'Email', 'Category', 'Priority', 'Language', 'Plus one',
  'Greeting', 'Personal note',
  'Token', 'Invite link', 'Reply by', 'Invite status', 'Invite sent', 'Reminder sent',
  'RSVP', 'Coming', 'Diet', 'Shuttle', 'RSVP at'
];
const GUEST_FILL_COLS = 9;   // A–I are yours; J onward is the script's

/* RSVP tab — the raw, append-only log. Every reply lands here, always. */
const RSVP_HEADER = [
  'Timestamp', 'Token', 'Matched guest', 'Name', 'Email', 'Attending', 'Phone',
  'Address', 'Party', 'Plus-one name', 'Diet', 'Shuttle', 'Staying', 'Message', 'Language'
];

/* Deadlines tab — one row per category, and the date that category is asked to
   reply by. The "(default)" row covers anyone with no category set. */
const DEADLINE_HEADER = ['Category', 'Reply by', 'Notes'];

/* Seeded once, on a brand-new Deadlines tab — edit the dates in the sheet, not
   here. Also what the email preview harness renders, so the two can't drift. */
const DEADLINE_SEED = [
  ['Family',        [2027, 0, 31], 'Closest family — we need these numbers first, for the villa.'],
  ['Wedding party', [2027, 0, 31], 'Anyone standing up with us.'],
  ['Friends',       [2027, 2, 31], ''],
  ['Work',          [2027, 3, 30], ''],
  ['(default)',     [2027, 3, 30], 'Used for any guest whose Category is blank or unlisted.']
];

const PRIORITIES = ['A', 'B', 'C'];

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

/* =============================== MENU ==================================== */
function onOpen(){
  SpreadsheetApp.getUi().createMenu('💌 Wedding HQ')
    .addItem('Set up / repair the workbook',   'setupWorkbook')
    .addSeparator()
    .addItem('Generate missing invite links',  'generateLinks')
    .addItem('Create drafts — selected rows',  'createDraftsForSelected')
    .addItem('Create drafts — filtered rows',  'createDraftsForFiltered')
    .addItem('Create drafts — all pending',    'createDraftsForPending')
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
  toast_('Workbook ready. Set your categories and dates on Deadlines, fill in Guests (columns A–I), then run "Generate missing invite links".');
}

/* --- Deadlines: one row per category, with the date it must reply by ------ */
function buildDeadlines_(ss){
  const sh = ss.getSheetByName(SHEETS.DEADLINES) || ss.insertSheet(SHEETS.DEADLINES, 1);
  sh.getRange(1, 1, 1, DEADLINE_HEADER.length).setValues([DEADLINE_HEADER]);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, DEADLINE_HEADER.length)
    .setBackground(T.oro).setFontColor('#FFFFFF').setFontWeight('bold').setVerticalAlignment('middle');
  sh.setRowHeight(1, 34);
  [220, 140, 420].forEach((w, i) => sh.setColumnWidth(i + 1, w));
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

  // header: yours in sage, the script's columns in a muted tone so it's obvious
  sh.getRange(1, 1, 1, GUEST_FILL_COLS)
    .setBackground(T.salvia).setFontColor('#FFFFFF').setFontWeight('bold');
  sh.getRange(1, GUEST_FILL_COLS + 1, 1, GUEST_HEADER.length - GUEST_FILL_COLS)
    .setBackground(T.panna2).setFontColor(T.muted).setFontWeight('bold').setFontStyle('italic');
  sh.getRange(1, 1, 1, GUEST_HEADER.length).setVerticalAlignment('middle');
  sh.setRowHeight(1, 34);

  const widths = [150, 210, 230, 130, 80, 90, 80, 190, 260,
                  80, 300, 120, 120, 120, 120, 70, 70, 200, 80, 140];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));

  // dropdowns so the values always match what the script reads back
  const list = (vals, strict) => SpreadsheetApp.newDataValidation()
    .requireValueInList(vals, true).setAllowInvalid(!strict).build();
  // Category reads its options straight off the Deadlines tab, so the two tabs
  // can never drift apart. Invalid is allowed — typing a new category warns
  // rather than blocks, and it simply falls back to the (default) deadline.
  const dl = ss.getSheetByName(SHEETS.DEADLINES);
  if(dl){
    sh.getRange('D2:D').setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInRange(dl.getRange('A2:A100'), true).setAllowInvalid(true).build());
  }
  sh.getRange('E2:E').setDataValidation(list(PRIORITIES, false));
  sh.getRange('F2:F').setDataValidation(list(['it', 'fr', 'en'], true));
  sh.getRange('G2:G').setDataValidation(list(['yes', 'no'], true));

  // the script-written block, tinted so nobody types into it
  sh.getRange(2, GUEST_FILL_COLS + 1, Math.max(sh.getMaxRows() - 1, 1),
              GUEST_HEADER.length - GUEST_FILL_COLS).setBackground('#FCFAF4');
  sh.getRange('L2:L').setNumberFormat('d mmm yyyy');

  // green when someone's coming, terracotta when they're not
  const rsvpRange = sh.getRange('P2:P');
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Yes')
      .setBackground('#E4EBDE').setFontColor(T.salviaDeep).setRanges([rsvpRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('No')
      .setBackground('#F6E6DE').setFontColor(T.terracotta).setRanges([rsvpRange]).build()
  ]);

  // a filter across the header, so category / priority slicing is one click
  if(!sh.getFilter()){
    sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), GUEST_HEADER.length).createFilter();
  }

  // one worked example, only ever on a brand-new sheet
  if(sh.getLastRow() < 2){
    sh.getRange(2, 1, 1, GUEST_FILL_COLS).setValues([[
      'Famiglia Rossi', 'Marco e Giulia Rossi', 'marco.rossi@example.com', 'Family', 'A',
      'it', 'no', 'Cari Marco e Giulia,', "Non vediamo l'ora di rivedervi a Firenze!"
    ]]);
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
  [150, 80, 190, 190, 230, 90, 140, 240, 90, 180, 200, 80, 200, 320, 80]
    .forEach((w, i) => sh.setColumnWidth(i + 1, w));
  return sh;
}

function buildDashboard_(ss){
  const sh = ss.getSheetByName(SHEETS.DASH) || ss.insertSheet(SHEETS.DASH, 3);
  sh.clear();
  sh.clearConditionalFormatRules();
  const G = SHEETS.GUESTS, D = SHEETS.DEADLINES;

  /* Guests columns this reads:  D Category · E Priority · G Plus one
     M Invite status · N Invite sent · O Reminder sent
     P RSVP · Q Coming · R Diet · S Shuttle                              */
  const rows = [
    ['Wedding HQ', ''],
    ['Ilaria & Maxime · Villa Corsini a Mezzomonte · 23 July 2027', ''],
    ['', ''],
    ['INVITES', ''],
    ['Households invited',  '=COUNTA(' + G + '!B2:B)'],
    ['Seats invited',       '=COUNTA(' + G + '!B2:B)+COUNTIF(' + G + '!G2:G,"yes")'],
    ['Drafts created',      '=COUNTIF(' + G + '!M2:M,"*draft*")'],
    ['Invites sent',        '=COUNTA(' + G + '!N2:N)'],
    ['Reminders sent',      '=COUNTA(' + G + '!O2:O)'],
    ['', ''],
    ['REPLIES', ''],
    ['Replied',             '=COUNTIF(' + G + '!P2:P,"<>")'],
    ['Still to reply',      '=B5-B12'],
    ['Coming (households)', '=COUNTIF(' + G + '!P2:P,"Yes")'],
    ['Not coming',          '=COUNTIF(' + G + '!P2:P,"No")'],
    ['', ''],
    ['THE DAY ITSELF', ''],
    ['Guests coming',       '=SUM(' + G + '!Q2:Q)'],
    ['Shuttle seats needed','=SUMIF(' + G + '!S2:S,"Yes",' + G + '!Q2:Q)']
  ];
  sh.getRange(1, 1, rows.length, 2).setValues(rows);

  sh.getRange('A1').setFontSize(22).setFontColor(T.ink).setFontWeight('bold');
  sh.getRange('A2').setFontSize(11).setFontColor(T.muted).setFontStyle('italic');
  ['A4', 'A11', 'A17', 'A21', 'D4', 'D26', 'H26'].forEach(a => sh.getRange(a)
    .setFontSize(10).setFontWeight('bold').setFontColor(T.salviaDeep));
  sh.getRange('B5:B9').setFontSize(14).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange('B12:B15').setFontSize(14).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange('B18:B19').setFontSize(18).setFontWeight('bold')
    .setFontColor(T.salviaDeep).setHorizontalAlignment('left');

  /* --- who's on which list ---------------------------------------------- */
  sh.getRange('A21').setValue('BY PRIORITY');
  sh.getRange('A22:C22').setValues([['Priority', 'Invited', 'Replied']])
    .setFontWeight('bold').setFontColor(T.muted).setFontSize(10);
  const prioLabels = { A:'A · must be there', B:"B · if there's room", C:'C · maybe' };
  PRIORITIES.forEach((p, i) => {
    const r = 23 + i;
    sh.getRange(r, 1).setValue(prioLabels[p] || p);
    sh.getRange(r, 2).setFormula('=COUNTIF(' + G + '!E2:E,"' + p + '")');
    sh.getRange(r, 3).setFormula('=COUNTIFS(' + G + '!E2:E,"' + p + '",' + G + '!P2:P,"<>")');
  });

  /* --- the per-category table, deadlines included ------------------------ */
  sh.getRange('D4').setValue('BY CATEGORY');
  sh.getRange('D5:I5')
    .setValues([['Category', 'Invited', 'Replied', 'Coming', 'Guests', 'Reply by']])
    .setFontWeight('bold').setFontColor(T.muted).setFontSize(10);
  sh.getRange('D6').setFormula(
    '=IFERROR(FILTER(' + D + '!A2:A,' + D + '!A2:A<>""),"— add categories on the Deadlines tab —")');
  sh.getRange('E6').setFormula('=ARRAYFORMULA(IF(D6:D="","",COUNTIF(' + G + '!D2:D,D6:D)))');
  sh.getRange('F6').setFormula('=ARRAYFORMULA(IF(D6:D="","",COUNTIFS(' + G + '!D2:D,D6:D,' + G + '!P2:P,"<>")))');
  sh.getRange('G6').setFormula('=ARRAYFORMULA(IF(D6:D="","",COUNTIFS(' + G + '!D2:D,D6:D,' + G + '!P2:P,"Yes")))');
  sh.getRange('H6').setFormula('=ARRAYFORMULA(IF(D6:D="","",SUMIF(' + G + '!D2:D,D6:D,' + G + '!Q2:Q)))');
  sh.getRange('I6').setFormula(
    '=ARRAYFORMULA(IF(D6:D="","",IFERROR(VLOOKUP(D6:D,' + D + '!A:B,2,FALSE),"")))');
  sh.getRange('I6:I').setNumberFormat('d mmm yyyy');

  /* --- the two lists that actually drive the chasing --------------------- */
  sh.getRange('D26').setValue('WHO HASN’T REPLIED — most urgent first');
  sh.getRange('D27:F27').setValues([['Names', 'Category', 'Priority']])
    .setFontWeight('bold').setFontColor(T.muted).setFontSize(10);
  sh.getRange('D28').setFormula(
    '=IFERROR(SORT(FILTER({' + G + '!B2:B,' + G + '!D2:D,' + G + '!E2:E},' +
    '(' + G + '!P2:P="")*(' + G + '!B2:B<>"")),3,TRUE),"— everyone has replied —")');

  sh.getRange('H26').setValue('DIETARY NEEDS');
  sh.getRange('H27:I27').setValues([['Names', 'Note']])
    .setFontWeight('bold').setFontColor(T.muted).setFontSize(10);
  sh.getRange('H28').setFormula(
    '=IFERROR(FILTER({' + G + '!B2:B,' + G + '!R2:R},' + G + '!R2:R<>""),"— none noted yet —")');

  [230, 110, 40, 200, 80, 80, 80, 80, 240].forEach((w, i) => sh.setColumnWidth(i + 1, w));
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
    if(!String(cell_(ctx, i, 'names') || cell_(ctx, i, 'email') || '').trim()) continue;
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
  const rows = visibleDataRows_(ctx).filter(i =>
    cell_(ctx, i, 'email') &&
    String(cell_(ctx, i, 'invite status') || '').toLowerCase().indexOf('draft') < 0);
  if(!rows.length){ toast_('Nothing pending among the visible rows. Adjust the filter, or they already have drafts.'); return; }
  runInvites_(ctx, rows);
}

function createDraftsForPending(){
  const ctx = readGuests_();
  const rows = [];
  for(let i = 0; i < ctx.data.length; i++){
    const st = String(cell_(ctx, i, 'invite status') || '').toLowerCase();
    if(cell_(ctx, i, 'email') && st.indexOf('draft') < 0) rows.push(i);
  }
  if(!rows.length){ toast_('No pending rows — every guest with an email already has a draft.'); return; }
  runInvites_(ctx, rows);
}

function runInvites_(ctx, rowIdxs){
  const deadlines = deadlineMap_();
  let made = 0, skipped = 0;
  rowIdxs.forEach(i => {
    const to = String(cell_(ctx, i, 'email') || '').trim();
    if(!to){ skipped++; return; }
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
  toast_(made + ' draft(s) created in Gmail' + (skipped ? ' · ' + skipped + ' skipped (no email)' : '') +
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
    if(!to) continue;
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
    names:    String(cell_(ctx, i, 'names') || '').trim(),
    plusOne:  truthy_(cell_(ctx, i, 'plus one')),
    note:     String(cell_(ctx, i, 'personal note') || '').trim()
  };
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
    if(row) matched = String(guests.getRange(row, 2).getValue() || 'row ' + row);

    const attending = String(p.attending || '').toLowerCase() === 'yes';
    const coming = !attending ? 0 : (String(p.party || '').toLowerCase() === 'plus' ? 2 : 1);
    const now = new Date();

    const log = ss.getSheetByName(SHEETS.RSVP) || buildRsvp_(ss);
    log.appendRow([
      now, token, matched || (token ? '— unknown token —' : '— no link token —'),
      p.name || '', email, attending ? 'Yes' : 'No', p.phone || '', p.address || '',
      p.party || '', p.plusname || '', p.diet || '', p.shuttle || '', p.staying || '',
      p.message || '', p.lang || ''
    ]);

    if(row){
      const set = (colName, v) => {
        const c = GUEST_HEADER.indexOf(colName);
        if(c >= 0) guests.getRange(row, c + 1).setValue(v);
      };
      set('RSVP', attending ? 'Yes' : 'No');
      set('Coming', coming);
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
  const plus = (g.plusOne ? plusBlock_(c.plus) : '');
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
  GUEST_HEADER.forEach(h => { const k = canon_(h.toLowerCase()); if(k && !(k in idx)) idx[k] = GUEST_HEADER.indexOf(h); });
  return { sh, header, idx, data: values.slice(1) };
}

function canon_(h){
  const map = {
    'group':'group','gruppo':'group','famiglia':'group','famille':'group','household':'group',
    'category':'category','categoria':'category','catégorie':'category','side':'category','list':'category',
    'priority':'priority','priorità':'priority','priorite':'priority','priorité':'priority','tier':'priority',
    'reply by':'reply by','deadline':'reply by','rsvp by':'reply by','scadenza':'reply by',
    'email':'email','e-mail':'email','mail':'email',
    'language':'language','lang':'language','langue':'language','lingua':'language',
    'greeting':'greeting','salutation':'greeting','saluto':'greeting','salut':'greeting',
    'names':'names','name':'names','nome':'names','nom':'names','guests':'names','invités':'names','invitati':'names',
    'plus one':'plus one','plus-one':'plus one','plusone':'plus one','+1':'plus one','accompagnatore':'plus one','accompagnant':'plus one',
    'personal note':'personal note','note':'personal note','messaggio':'personal note',
    'token':'token','code':'token','codice':'token',
    'invite link':'invite link','link':'invite link','lien':'invite link',
    'invite status':'invite status','status':'invite status','stato':'invite status','statut':'invite status',
    'invite sent':'invite sent','sent':'invite sent',
    'reminder sent':'reminder sent','reminder':'reminder sent',
    'rsvp':'rsvp','risposta':'rsvp','réponse':'rsvp',
    'coming':'coming','headcount':'coming','presenti':'coming',
    'diet':'diet','allergie':'diet','dietary':'diet',
    'shuttle':'shuttle','navetta':'shuttle',
    'rsvp at':'rsvp at','replied at':'rsvp at','last updated':'rsvp at','updated':'rsvp at'
  };
  return map[h] || '';
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
