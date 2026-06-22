/* ============================================================================
   Wedding invites — draft generator  (Ilaria & Maxime)
   ----------------------------------------------------------------------------
   Bind this to your INVITE-LIST Google Sheet (Extensions ▸ Apps Script), while
   logged into the wedding account (maxime.ilaria@gmail.com). It reads each row
   and creates a personalised, on-brand Gmail DRAFT in that account. You then
   open Gmail, glance over each draft, and hit Send yourself.

   Menu (appears after you reload the sheet):  💌 Invites
     • Create drafts — selected rows
     • Create drafts — all pending
     • Send a test to me
     • Reset status — selected rows

   Columns it looks for in row 1 (order doesn't matter; aliases accepted):
     Email*          guest email (one, or several separated by , or ;)
     Language        it / fr / en          (default: it)
     Greeting        e.g. "Cari Marco e Giulia,"  (if blank, built from Names)
     Names           used only to build a greeting when Greeting is blank
     Plus one        yes / true / 1  → adds the plus-one line
     Personal note   optional one-off message shown in a sage panel
     Status          ← written by the script ("Draft created" / "Sent test")
     Last updated    ← written by the script
   (* required)
   ========================================================================== */

/* ----------------------------- CONFIG ------------------------------------ */
const CFG = {
  SITE_URL    : 'https://matoui01.github.io/Wedding/',
  PASSWORD    : 'XXXXXX',                 // ← the site password from your invite gate
  SENDER_NAME : 'Ilaria & Maxime',
  REPLY_TO    : 'maxime.ilaria@gmail.com',

  // Hosted images. estate-cut.png is already live. Commit the two email-*.png
  // files (provided alongside this script) to site/assets/img/ to light up the
  // crest + sprig; the email still looks right if they're missing.
  IMG_BASE : 'https://matoui01.github.io/Wedding/assets/img/',
  IMG_CREST: 'email-crest.png',
  IMG_SPRIG: 'email-sprig.png',
  IMG_HERO : 'estate-cut.png',

  RSVP_BY  : { it:'30 aprile 2027', fr:'30 avril 2027', en:'30 April 2027' }, // ← set real deadline
  SUBJECT  : {
    it:'Ilaria & Maxime · Ci sposiamo a Firenze — siete invitati',
    fr:'Ilaria & Maxime · Nous nous marions à Florence — vous êtes invités',
    en:"Ilaria & Maxime · We're getting married in Florence — you're invited"
  }
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
    fcLead:'Domande?'
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
    fcLead:'Questions ?'
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
    fcLead:'Questions?'
  }
};

/* =============================== MENU ==================================== */
function onOpen(){
  SpreadsheetApp.getUi().createMenu('💌 Invites')
    .addItem('Create drafts — selected rows', 'createDraftsForSelected')
    .addItem('Create drafts — all pending',   'createDraftsForPending')
    .addSeparator()
    .addItem('Send a test to me',             'sendTestToMe')
    .addItem('Reset status — selected rows',  'resetSelectedStatus')
    .addToUi();
}

/* ============================ ACTIONS =================================== */
function createDraftsForSelected(){
  const ctx = readSheet_();
  const rows = selectedDataRows_(ctx);
  if(!rows.length){ toast_('Select one or more guest rows first.'); return; }
  run_(ctx, rows, /*skipDone*/ false);
}

function createDraftsForPending(){
  const ctx = readSheet_();
  const rows = [];
  for(let i=0;i<ctx.data.length;i++){
    const st = String(cell_(ctx, i, 'status')||'').toLowerCase();
    if(cell_(ctx, i, 'email') && st.indexOf('draft')<0) rows.push(i);
  }
  if(!rows.length){ toast_('No pending rows (every row with an email already has a draft).'); return; }
  run_(ctx, rows, /*skipDone*/ true);
}

function run_(ctx, rowIdxs, skipDone){
  let made=0, skipped=0;
  rowIdxs.forEach(i=>{
    const to = String(cell_(ctx,i,'email')||'').trim();
    if(!to){ skipped++; return; }
    const lang = normLang_(cell_(ctx,i,'language'));
    const g = {
      to, lang,
      greeting: String(cell_(ctx,i,'greeting')||'').trim(),
      names:    String(cell_(ctx,i,'names')||'').trim(),
      plusOne:  truthy_(cell_(ctx,i,'plus one')),
      note:     String(cell_(ctx,i,'personal note')||'').trim()
    };
    const m = buildEmail_(g);
    GmailApp.createDraft(to, m.subject, m.text, {
      htmlBody: m.html, name: CFG.SENDER_NAME, replyTo: CFG.REPLY_TO
    });
    setStatus_(ctx, i, 'Draft created');
    made++;
  });
  toast_(made+' draft(s) created in Gmail'+(skipped?(' · '+skipped+' skipped (no email)'):'')+'. Open Gmail ▸ Drafts to review and send.');
}

function sendTestToMe(){
  const me = Session.getActiveUser().getEmail() || CFG.REPLY_TO;
  const ctx = readSheet_();
  // base the test on the first data row if present, else a dummy
  let g;
  if(ctx.data.length){
    const i=0;
    g = { to:me, lang:normLang_(cell_(ctx,i,'language')),
          greeting:String(cell_(ctx,i,'greeting')||'').trim(),
          names:String(cell_(ctx,i,'names')||'').trim(),
          plusOne:truthy_(cell_(ctx,i,'plus one')),
          note:String(cell_(ctx,i,'personal note')||'').trim() };
  } else {
    g = { to:me, lang:'it', greeting:'Cari Marco e Giulia,', names:'', plusOne:true,
          note:'Non vediamo l’ora di festeggiare con voi.' };
  }
  const m = buildEmail_(g);
  GmailApp.sendEmail(me, '[TEST] '+m.subject, m.text, {
    htmlBody:m.html, name:CFG.SENDER_NAME, replyTo:CFG.REPLY_TO
  });
  toast_('Test sent to '+me+'.');
}

function resetSelectedStatus(){
  const ctx = readSheet_();
  selectedDataRows_(ctx).forEach(i=> setStatus_(ctx, i, ''));
  toast_('Status cleared for selected rows.');
}

/* ========================= EMAIL BUILDER ================================ */
function buildEmail_(g){
  const c = COPY[g.lang] || COPY.it;
  const greet = g.greeting || (g.names ? greetingFromNames_(g.names, g.lang) : c.fallbackGreet);
  const note = (g.note ? noteBlock_(esc_(g.note)) : '');
  const plus = (g.plusOne ? plusBlock_(c.plus) : '');
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
      <img src="${I}${CFG.IMG_CREST}" width="118" height="129" alt="Ilaria & Maxime" style="display:block;border:0;width:118px;height:auto;">
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
        <a href="${CFG.SITE_URL}" style="display:inline-block;font-family:${T.fUi};font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#FBF8EF;padding:15px 36px;">${c.cta}</a>
      </td></tr></table>
    </td></tr>

    <tr><td align="center" style="padding:14px 40px 0;font-family:${T.fUi};font-size:12px;letter-spacing:1px;color:${T.muted};">${c.by(CFG.RSVP_BY[g.lang])}</td></tr>

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
${g.note ? '\n'+g.note+'\n' : ''}
${c.kDay}: ${c.vDay}
${c.kWhere}: ${c.vWhere}
${c.kDress}: ${c.vDress}
${g.plusOne ? '\n'+c.plus+'\n' : ''}
${c.siteLead}
${c.pwk}: ${CFG.PASSWORD}
${CFG.SITE_URL}
${c.by(CFG.RSVP_BY[g.lang])}

${c.close}
Ilaria & Maxime
${CFG.REPLY_TO}`;

  return { subject: CFG.SUBJECT[g.lang] || CFG.SUBJECT.it, html, text };
}

/* small html fragments */
function factRow_(k,v,first){
  const top = first ? '' : 'border-top:1px solid '+T.line+';';
  return '<tr>'+
    '<td style="'+top+'padding:12px 14px 12px 0;font-family:'+T.fUi+';font-size:10px;letter-spacing:3px;text-transform:uppercase;color:'+T.salviaDeep+';white-space:nowrap;vertical-align:middle;">'+k+'</td>'+
    '<td align="right" style="'+top+'padding:12px 0;font-family:'+T.fBody+';font-size:16px;color:'+T.ink+';vertical-align:middle;">'+v+'</td>'+
  '</tr>';
}
function noteBlock_(noteHtml){
  return '<tr><td class="px" style="padding:24px 52px 0;">'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1EA;border-left:3px solid '+T.salvia+';border-radius:2px;">'+
    '<tr><td style="padding:16px 20px;font-family:'+T.fBody+';font-style:italic;font-size:16px;line-height:1.55;color:'+T.ink+';">'+noteHtml+'</td></tr></table></td></tr>';
}
function plusBlock_(txt){
  return '<tr><td align="center" class="px" style="padding:24px 52px 0;font-family:'+T.fDisplay+';font-style:italic;font-size:18px;color:'+T.salviaDeep+';">'+txt+'</td></tr>';
}

/* ====================== sheet plumbing ================================= */
function readSheet_(){
  const sh = SpreadsheetApp.getActiveSheet();
  const rng = sh.getDataRange();
  const values = rng.getValues();
  const header = (values[0]||[]).map(h=>String(h).trim().toLowerCase());
  const idx = {};
  header.forEach((h,c)=>{ const k=canon_(h); if(k && !(k in idx)) idx[k]=c; });
  return { sh, header, idx, data: values.slice(1) };
}
function canon_(h){
  const map = {
    'email':'email','e-mail':'email','mail':'email',
    'language':'language','lang':'language','langue':'language','lingua':'language',
    'greeting':'greeting','salutation':'greeting','saluto':'greeting','salut':'greeting',
    'names':'names','name':'names','nome':'names','nom':'names','guests':'names','invités':'names','invitati':'names',
    'plus one':'plus one','plus-one':'plus one','plusone':'plus one','+1':'plus one','accompagnatore':'plus one','accompagnant':'plus one',
    'personal note':'personal note','note':'personal note','message':'personal note','messaggio':'personal note',
    'status':'status','stato':'status','statut':'status',
    'last updated':'last updated','updated':'last updated'
  };
  return map[h] || '';
}
function cell_(ctx, rowIdx, key){
  const c = ctx.idx[key];
  if(c===undefined) return '';
  const r = ctx.data[rowIdx];
  return r ? r[c] : '';
}
function selectedDataRows_(ctx){
  const sh = ctx.sh;
  const ranges = (sh.getActiveRangeList() ? sh.getActiveRangeList().getRanges() : [sh.getActiveRange()]);
  const set = {};
  ranges.forEach(r=>{
    const start=r.getRow(), n=r.getNumRows();
    for(let row=start; row<start+n; row++){ if(row>=2) set[row-2]=true; } // -2: skip header, to 0-based data
  });
  return Object.keys(set).map(Number).filter(i=> i>=0 && i<ctx.data.length).sort((a,b)=>a-b);
}
function setStatus_(ctx, rowIdx, text){
  const sh = ctx.sh;
  const sCol = ensureCol_(ctx, 'status', 'Status');
  const uCol = ensureCol_(ctx, 'last updated', 'Last updated');
  sh.getRange(rowIdx+2, sCol+1).setValue(text);
  sh.getRange(rowIdx+2, uCol+1).setValue(text ? new Date() : '');
}
function ensureCol_(ctx, key, label){
  if(ctx.idx[key]!==undefined) return ctx.idx[key];
  const sh = ctx.sh;
  const col = ctx.header.length;            // append at end
  sh.getRange(1, col+1).setValue(label);
  ctx.header.push(label.toLowerCase());
  ctx.idx[key] = col;
  return col;
}

/* ============================ helpers ================================= */
function normLang_(v){ v=String(v||'').trim().toLowerCase().slice(0,2); return (v==='fr'||v==='en'||v==='it')?v:'it'; }
function truthy_(v){ v=String(v||'').trim().toLowerCase(); return v==='yes'||v==='y'||v==='true'||v==='1'||v==='si'||v==='sì'||v==='oui'||v==='x'; }
function greetingFromNames_(names, lang){
  const lead = { it:'Cari ', fr:'Chers ', en:'Dear ' }[lang] || 'Dear ';
  return lead + names + ',';
}
function esc_(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function toast_(msg){ SpreadsheetApp.getActive().toast(msg, '💌 Invites', 8); }
