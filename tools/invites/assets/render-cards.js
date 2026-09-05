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

const OUT = path.resolve(__dirname, '../../../site/assets/img/cards');
const LEAD = { it: 'Cari ', fr: 'Chers ', en: 'Dear ' };

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
    greeting: (row['Greeting'] || '').trim() || (LEAD[lang] || 'Dear ') + names + ',',
    plusOne: /^(yes|y|true|1|si|sì|oui|x)$/i.test((row['Plus-one'] || '').trim()),
    plusName: (row['Plus-one name'] || '').trim(),
    note: (row['Personal note'] || '').trim(),
  };
  const dst = path.join(OUT, `card-${token}.jpg`);
  execFileSync('node', [path.join(__dirname, 'render-card.js'), JSON.stringify(g), dst],
               { stdio: 'inherit' });
  made++;
}
console.log(`\n${made} card(s) rendered into site/assets/img/cards/` +
            (skipped ? ` · ${skipped} skipped (no token yet)` : ''));
