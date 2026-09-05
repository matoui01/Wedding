#!/usr/bin/env node
/* Render one invitation card per guest, from the seeded guest list.
 *
 *   node tools/invites/assets/render-cards.js tools/invites/sheet/guests-seed.csv
 *
 * Reads Token, Language, Greeting, Invitee, Plus-one, Plus-one name and
 * Personal note, and writes site/assets/img/cards/card-<token>.jpg. Guests
 * without a token are skipped — run "Generate missing invite links" in the
 * sheet first, then export the Guests tab as CSV.
 *
 * Re-run after changing a greeting, a note, or the card design itself; the
 * design lives in render-card.js.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/* Not under site/: these are never served from the website. They are uploaded
   to the couple's Drive folder, where the Apps Script reads them directly. */
const OUT = path.resolve(__dirname, 'cards-out');
/* A greeting has to agree with who is being greeted. Addressing a couple in
   the singular, or one person in the plural, is the sort of thing a guest
   notices immediately on a wedding invitation. */
const JOIN   = { it: ' e ',    fr: ' et ',   en: ' and ' };
const PLURAL = { it: 'Cari ',  fr: 'Chers ', en: 'Dear ' };
const SINGLE = { fr: 'Cher ',  en: 'Dear ' };

/* Names already written as a pair — "Rajia et Afif", "Tarek et sa femme" —
   are plural even though they sit in one field. */
const PAIRED = /\s(?:et|e|and|&|con)\s/i;

function greetingFor(invitee, plusName, lang){
  const names = plusName ? invitee + JOIN[lang] + plusName : invitee;
  const many = !!plusName || PAIRED.test(invitee);
  if(many) return PLURAL[lang] + names + ',';
  if(lang === 'en') return 'Dear ' + names + ',';
  // French and Italian both gender the singular article, and nothing in the
  // sheet records a guest's gender. The ending is a decent but fallible clue,
  // so every guess is listed at the end of the run for a human to check —
  // filling that guest's Greeting cell always wins over this.
  GUESSED.push(names);
  if(lang === 'fr') return (/[ae]$/i.test(invitee) ? 'Chère ' : 'Cher ') + names + ',';
  return (/a$/i.test(invitee) ? 'Cara ' : 'Caro ') + names + ',';
}

const GUESSED = [];

function parseCsv(text){
  const rows = [];
  let row = [], field = '', quoted = false;
  for(let i = 0; i < text.length; i++){
    const ch = text[i];
    if(quoted){
      if(ch === '"' && text[i+1] === '"'){ field += '"'; i++; }
      else if(ch === '"') quoted = false;
      else field += ch;
    } else if(ch === '"') quoted = true;
    else if(ch === ','){ row.push(field); field = ''; }
    else if(ch === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
    else if(ch !== '\r') field += ch;
  }
  if(field || row.length){ row.push(field); rows.push(row); }
  const head = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length > 1).map(r =>
    Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}

const csv = process.argv[2] || path.resolve(__dirname, '../sheet/guests-seed.csv');
const guests = parseCsv(fs.readFileSync(csv, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

let made = 0, skipped = 0;
for(const row of guests){
  const token = (row['Token'] || '').trim();
  if(!token){ skipped++; continue; }
  const lang = (row['Language'] || 'it').trim();
  const names = (row['Invitee'] || '').trim();
  const g = {
    lang,
    greeting: (row['Greeting'] || '').trim() ||
              greetingFor(names, (row['Plus-one name'] || '').trim(), lang),
    plusOne: /^(yes|y|true|1|si|sì|oui|x)$/i.test((row['Plus-one'] || '').trim()),
    plusName: (row['Plus-one name'] || '').trim(),
    note: (row['Personal note'] || '').trim(),
  };
  const dst = path.join(OUT, `card-${token}.jpg`);
  execFileSync('node', [path.join(__dirname, 'render-card.js'), JSON.stringify(g), dst],
               { stdio: 'inherit' });
  made++;
}
console.log(`\n${made} card(s) rendered into tools/invites/assets/cards-out/` +
            (skipped ? ` · ${skipped} skipped (no token yet)` : '') +
            `\nUpload them into the Drive folder named in CFG.CARDS_FOLDER.`);
if(GUESSED.length){
  console.log(`\n${GUESSED.length} greeting(s) guessed a gender from the name — check these,`);
  console.log('and correct any that are wrong in the guest\'s Greeting cell:');
  console.log('  ' + GUESSED.join('\n  '));
}
