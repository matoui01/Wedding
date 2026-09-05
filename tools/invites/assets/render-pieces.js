#!/usr/bin/env node
/* The parts of the invitation that never change per guest, drawn from the
 * same CSS as the proof card and shipped as images in the public site:
 *
 *   site/assets/img/email-head-<lang>.png   crest · villa line · names · tagline · date
 *   site/assets/img/email-facts-<lang>.png  the day / where / dress code table
 *
 * Drawn at 3×, above the resolution the invitation is exported at. No guest data goes into either — the letter
 * with the greeting is drawn at send time by the script in the sheet, which
 * places these two pieces around it.
 *
 *   node tools/invites/assets/render-pieces.js
 */
const path = require('path');
const { ensureFonts, PAGE_CSS, headHtml, factsHtml, markHtml, closeHtml, fixedHtml, IMG, chromium } = require('./render-card.js');

(async () => {
  await ensureFonts();
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // 4× so the pieces still out-resolve the page the invitation is exported at:
// an 1800 pt template exports 2400 px across, and an image drawn smaller
// than that would be stretched to fill it
const p = await b.newPage({ viewport: { width: 600, height: 800 }, deviceScaleFactor: 4 });
  for(const lang of ['it', 'fr', 'en']){
    await p.setContent(`<!doctype html><meta charset="utf-8"><style>${PAGE_CSS()}</style>
      <div class="piece-head" id="head">${headHtml(lang)}</div>
      <div class="piece-facts" id="facts">${factsHtml(lang)}</div>
      <div class="piece-mark" id="mark">${markHtml()}</div>
      <div id="close">${fixedHtml.close(lang)}</div>
      <div id="pwk">${fixedHtml.pwk(lang)}</div>
      <div id="by">${fixedHtml.by(lang)}</div>
      <div id="cta">${fixedHtml.cta(lang)}</div>`, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(200);
    for(const id of ['head', 'facts', 'close', 'pwk', 'by', 'cta'].concat(lang === 'it' ? ['mark'] : [])){
      const el = await p.$('#' + id);
      const box = await el.boundingBox();
      const out = path.join(IMG, id === 'mark' ? 'email-wordmark.png' : `email-${id}-${lang}.png`);
      await el.screenshot({ path: out, type: 'png', omitBackground: false });
      console.log(`${path.basename(out)}  ${Math.round(box.width)}×${Math.round(box.height)} css px`);
    }
  }
  await b.close();
})();
