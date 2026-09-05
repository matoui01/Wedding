/* Render the invitation itself as an image.
 *
 * Email clients that strip web fonts cannot be argued with, so the card stops
 * being HTML and becomes a picture of the card — which is how Paperless Post,
 * Greenvelope and every other stationery service solve exactly this. Freed
 * from email HTML we can use the real fonts and real CSS, so what ships is
 * the design chart itself rather than an approximation of it.
 *
 * Everything functional — password, RSVP button, deadline, contact — stays
 * live text underneath, where the typeface does not matter and the link must
 * work.
 *
 *   node tools/invites/assets/render-card.js '{"lang":"it","greeting":"Cari …,","plus":"…","note":"…"}' out.jpg
 *
 * The words arrive ready-made: render-cards.js takes them from the shared
 * block of apps-script/Code.gs, so nothing about wording is decided here.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FONTS = path.resolve(__dirname, '.fonts');

/* The real faces, fetched once into .fonts/ (gitignored — no need to carry
   1.5 MB of TTFs in the repo when they have a canonical home). */
const FONT_URLS = {
  'PinyonScript.ttf':     'https://fonts.gstatic.com/s/pinyonscript/v24/6xKpdSJbL9-e9LuoeQiDRQR8aOI.ttf',
  'Cormorant.ttf':        'https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_v86GnM.ttf',
  'CormorantItalic.ttf':  'https://fonts.gstatic.com/s/cormorantgaramond/v21/co3smX5slCNuHLi8bLeY9MK7whWMhyjYrGFEsdtdc62E6zd58jDOjw.ttf',
  'EBGaramond.ttf':       'https://fonts.gstatic.com/s/ebgaramond/v33/SlGDmQSNjdsmc35JDF1K5E55YMjF_7DPuGi-6_RUAw.ttf',
  'EBGaramondItalic.ttf': 'https://fonts.gstatic.com/s/ebgaramond/v33/SlGFmQSNjdsmc35JDF1K5GRwUjcdlttVFm-rI7e8QI96.ttf',
  'Jost.ttf':             'https://fonts.gstatic.com/s/jost/v20/92zPtBhPNqw79Ij1E865zBUv7myjJQVG.ttf',
};

async function ensureFonts(){
  fs.mkdirSync(FONTS, { recursive: true });
  for(const [name, url] of Object.entries(FONT_URLS)){
    const dst = path.join(FONTS, name);
    if(fs.existsSync(dst) && fs.statSync(dst).size > 1000) continue;
    const res = await fetch(url);
    if(!res.ok) throw new Error(`could not fetch ${name}: HTTP ${res.status}`);
    fs.writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
    console.log(`  fetched ${name}`);
  }
}
const IMG = path.resolve(__dirname, '../../../site/assets/img');

const COPY = {
  it: { over:'VILLA CORSINI A MEZZOMONTE · FIRENZE', tag:'Ci sposiamo', date:'Venerdì 23 luglio 2027',
        body:'Insieme alle nostre famiglie, abbiamo la gioia di invitarvi a celebrare il nostro matrimonio. Ci sposiamo tra le colline di Firenze, a Villa Corsini a Mezzomonte: una giornata di festa fra giardini, arte e buon vino, con le persone che amiamo.',
        kDay:'Il giorno', vDay:'Venerdì 23 luglio 2027', kWhere:'Dove',
        vWhere:'Villa Corsini a Mezzomonte · Impruneta, Firenze', kDress:'Dress code', vDress:'Cocktail elegante',
        siteLead:'Programma, viaggio, regali e conferma di presenza sono tutti sul nostro sito.', close:'A presto,',
        pwk:'Password del sito', cta:'Apri il sito e rispondi', byLabel:'Rispondete entro il' },
  fr: { over:'VILLA CORSINI A MEZZOMONTE · FLORENCE', tag:'Nous nous marions', date:'Vendredi 23 juillet 2027',
        body:'Avec nos familles, nous avons la joie de vous inviter à célébrer notre mariage. Nous nous marions sur les collines de Florence, à la Villa Corsini a Mezzomonte : une journée de fête entre jardins, art et bon vin, avec ceux que nous aimons.',
        kDay:'Le jour', vDay:'Vendredi 23 juillet 2027', kWhere:'Lieu',
        vWhere:'Villa Corsini a Mezzomonte · Impruneta, Florence', kDress:'Tenue', vDress:'Cocktail élégant',
        siteLead:'Le programme, le voyage, les cadeaux et votre réponse sont sur notre site.', close:'À très bientôt,',
        pwk:'Mot de passe du site', cta:'Ouvrir le site et répondre', byLabel:'Merci de répondre avant le' },
  en: { over:'VILLA CORSINI A MEZZOMONTE · FLORENCE', tag:"We're getting married", date:'Friday · 23 July 2027',
        body:"Together with our families, we are delighted to invite you to celebrate our wedding. We're getting married in the hills of Florence, at Villa Corsini a Mezzomonte — a day of celebration among gardens, art and good wine, with the people we love.",
        kDay:'The day', vDay:'Friday 23 July 2027', kWhere:'Where',
        vWhere:'Villa Corsini a Mezzomonte · Impruneta, Florence', kDress:'Dress code', vDress:'Elegant cocktail',
        siteLead:'The programme, travel, gifts and your reply are all on our site.', close:'See you very soon,',
        pwk:'Site password', cta:'Open the site and RSVP', byLabel:'Kindly reply by' },
};

const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const dataUri = (f, mime) => `data:${mime};base64,` + fs.readFileSync(f).toString('base64');

const PAGE_CSS = () => {
  const face = (fam, file, style) =>
    `@font-face{font-family:'${fam}';font-style:${style||'normal'};src:url('${dataUri(path.join(FONTS,file),'font/ttf')}');}`;
  return `
${face('Pinyon','PinyonScript.ttf')}
${face('Cormorant','Cormorant.ttf')}
${face('Cormorant','CormorantItalic.ttf','italic')}
${face('EBG','EBGaramond.ttf')}
${face('EBG','EBGaramondItalic.ttf','italic')}
${face('Jost','Jost.ttf')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:600px;background:#FAF6EC;-webkit-font-smoothing:antialiased}
.head{text-align:center;padding:34px 40px 0}
.crest{width:104px;display:block;margin:0 auto}
.over{font-family:Jost;font-size:11px;letter-spacing:5px;color:#6E7B5B;text-transform:uppercase;margin-top:22px}
.names{font-family:Pinyon;font-size:76px;line-height:1.3;color:#3D352A;margin-top:2px}
.names em{font-family:Cormorant;font-style:italic;font-size:.55em;color:#C47A54;vertical-align:.14em}
.tag{font-family:Cormorant;font-style:italic;font-size:23px;color:#897C68;margin-top:2px}
.date{font-family:Jost;font-size:13px;letter-spacing:4px;color:#3D352A;text-transform:uppercase;margin-top:14px}
.hero{width:100%;display:block;margin-top:28px}
.letter{margin:30px 34px 36px;background:#FDFBF5;border:1px solid #DCC9A4;padding:36px 40px 32px}
.greet{font-family:Cormorant;font-size:24px;color:#3D352A}
.body{font-family:EBG;font-size:17px;line-height:1.66;color:#3D352A;margin-top:13px}
.note{font-family:EBG;font-style:italic;font-size:16px;line-height:1.62;color:#3D352A;margin-top:22px;background:#EEF2E9;border-left:2px solid #93A586;padding:14px 18px}
.plus{font-family:Cormorant;font-style:italic;font-size:18px;color:#6E7B5B;text-align:center;margin-top:26px}
.site{font-family:EBG;font-size:16px;line-height:1.62;color:#3D352A;text-align:center;margin-top:26px}
table.facts{width:100%;border-collapse:collapse;margin-top:26px}
table.facts td{padding:13px 0;vertical-align:middle}
table.facts tr+tr td{border-top:1px solid #E4DCC9}
.k{font-family:Jost;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#6E7B5B;white-space:nowrap}
.v{font-family:EBG;font-size:16px;color:#3D352A;text-align:right}
.sprig{width:20px;display:block;margin:22px auto 0;opacity:.85}
/* the pieces, cut for the email: the header carries the gap before the villa,
   the facts table sits flush in its own image, and the sign-off is drawn
   whole so the ampersand's swash is never clipped */
.piece-head{background:#FAF6EC;padding-bottom:28px}
.piece-facts{width:452px;background:#FDFBF5}
.piece-facts table.facts{margin-top:0}
/* Every piece below is a line of type on nothing: transparent, cropped to the
   ink, always 600 px wide so the script knows its proportions without
   measuring. They exist because Slides has neither Jost nor letter-spacing,
   and the design is mostly both. None carries a guest's name — and the
   password, which no public file may hold, is drawn the same way into the
   couple's own Drive instead. */
.piece-fixed{width:600px;display:flex;align-items:center;justify-content:center;text-align:center;padding:6px 0}
.piece-ui{font-family:Jost;font-size:11px;letter-spacing:3.4px;text-transform:uppercase;color:#6E7B5B;white-space:nowrap}
.piece-ui.on-green{color:#FBF8EF;font-size:12.5px;letter-spacing:3.6px}
.piece-ui.pw{font-family:Jost;font-size:21px;letter-spacing:5px;color:#3D352A}
.piece-close .c2{font-family:Cormorant;font-style:italic;font-size:22px;color:#897C68;white-space:nowrap}
.piece-mark{background:#FAF6EC;padding:16px 26px;display:inline-block}
.piece-mark .m{font-family:Pinyon;font-size:46px;line-height:1.45;color:#3D352A;white-space:nowrap}
.piece-mark .m em{font-family:Cormorant;font-style:italic;font-size:.55em;color:#C47A54;vertical-align:.14em}
.piece-close .c{font-family:Cormorant;font-style:italic;font-size:20px;line-height:1.6;color:#897C68;white-space:nowrap}
`;
};

const headHtml = (lang) => {
  const c = COPY[lang] || COPY.it;
  return `<div class="head">
  <img class="crest" src="${dataUri(path.join(IMG,'email-crest.png'),'image/png')}">
  <div class="over">${c.over}</div>
  <div class="names">Ilaria <em>&amp;</em> Maxime</div>
  <div class="tag">${c.tag}</div>
  <div class="date">${c.date}</div>
</div>`;
};
const markHtml = () => `<div class="m">Ilaria <em>&amp;</em> Maxime</div>`;
const closeHtml = (lang) => `<div class="c">${(COPY[lang] || COPY.it).close}</div>`;
/* the four fixed-width pieces: sign-off, password label, reply-by label, button */
const fixedHtml = {
  close: (lang) => `<div class="piece-fixed piece-close"><div class="c2">${(COPY[lang] || COPY.it).close}</div></div>`,
  pwk:   (lang) => `<div class="piece-fixed"><div class="piece-ui">${(COPY[lang] || COPY.it).pwk}</div></div>`,
  by:    (lang) => `<div class="piece-fixed"><div class="piece-ui">${(COPY[lang] || COPY.it).byLabel}</div></div>`,
  cta:   (lang) => `<div class="piece-fixed"><div class="piece-ui on-green">${(COPY[lang] || COPY.it).cta}</div></div>`,
  pw:    (text) => `<div class="piece-fixed"><div class="piece-ui pw">${esc(text)}</div></div>`,
};
const factsHtml = (lang) => {
  const c = COPY[lang] || COPY.it;
  return `<table class="facts">
    <tr><td class="k">${c.kDay}</td><td class="v">${c.vDay}</td></tr>
    <tr><td class="k">${c.kWhere}</td><td class="v">${c.vWhere}</td></tr>
    <tr><td class="k">${c.kDress}</td><td class="v">${c.vDress}</td></tr>
  </table>`;
};

/* the whole card, as a proof of the design — what the email should add up to */
function html(g){
  const c = COPY[g.lang] || COPY.it;
  const plus = g.plus ? esc(g.plus) : '';
  return `<!doctype html><meta charset="utf-8"><style>${PAGE_CSS()}</style>
${headHtml(g.lang)}
<img class="hero" src="${dataUri(path.join(IMG,'email-estate.jpg'),'image/jpeg')}">
<div class="letter">
  <div class="greet">${esc(g.greeting)}</div>
  <div class="body">${c.body}</div>
  ${g.note ? `<div class="note">${esc(g.note)}</div>` : ''}
  ${factsHtml(g.lang)}
  ${plus ? `<div class="plus">${plus}</div>` : ''}
  <div class="site">${c.siteLead}</div>
  <img class="sprig" src="${dataUri(path.join(IMG,'email-sprig.png'),'image/png')}">
</div>`;
}

module.exports = { ensureFonts, PAGE_CSS, headHtml, factsHtml, markHtml, closeHtml, fixedHtml, html, dataUri, IMG, FONTS, COPY, chromium };

if(require.main === module) (async () => {
  await ensureFonts();
  const g = JSON.parse(process.argv[2]);
  const out = process.argv[3];
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  // 2x so the card stays crisp on a retina phone
  const scale = Number(process.env.CARD_SCALE || 2);
  const p = await b.newPage({ viewport:{ width:600, height:1000 }, deviceScaleFactor:scale });
  await p.setContent(html(g), { waitUntil:'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  // JPEG, not PNG: the card is a watercolour on ivory with no transparency,
  // and a 1.7 MB PNG in front of a phone on mobile data is not a kindness.
  // Quality steps down only as far as it must to stay under the cap.
  let buf;
  for(const q of [88, 82, 76, 70, 64]){
    buf = await p.screenshot({ type:'jpeg', quality:q, fullPage:true });
    if(buf.length <= Number(process.env.CARD_MAX_KB || 320) * 1024) break;
  }
  fs.writeFileSync(out, buf);
  await b.close();
  console.log(`${path.basename(out)}  ${Math.round(buf.length / 1024)} KB`);
})();
