#!/usr/bin/env node
/* Render one invitation card per guest.
 *
 *   node tools/invites/assets/render-cards.js guests.csv
 *
 * Reads Token, Language, Greeting, Invitee, Plus-one, Plus-one name and
 * Personal note, and writes tools/invites/assets/cards-out/card-<token>.jpg — one per
 * household, each the whole invitation with that guest's greeting in it.
 * Guests with no token are skipped; run "Generate missing invite links" in the
 * sheet first, then export the Guests tab as CSV.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, 'cards-out');
const JOIN   = { it: ' e ',    fr: ' et ',   en: ' and ' };
const PLURAL = { it: 'Cari ',  fr: 'Chers ', en: 'Dear ' };
const SINGLE = { fr: 'Cher ',  en: 'Dear ' };
const PAIRED = /\s(?:et|e|and|&|con)\s/i;
const GUESSED = [];

/* A greeting has to agree with who is being greeted — addressing a couple in
   the singular is the sort of thing a guest notices immediately. */
function greetingFor(invitee, plusName, lang){
  const names = plusName ? invitee + JOIN[lang] + plusName : invitee;
  if(plusName || PAIRED.test(invitee)) return PLURAL[lang] + names + ',';
  if(lang === 'en') return 'Dear ' + names + ',';
  // French and Italian gender the singular article and nothing records a
  // guest's gender, so every guess is listed at the end for a human to check.
  GUESSED.push(names);
  if(lang === 'fr') return (/[ae]$/i.test(invitee) ? 'Chère ' : 'Cher ') + names + ',';
  return (/a$/i.test(invitee) ? 'Cara ' : 'Caro ') + names + ',';
}

function parseCsv(text){
  const rows = []; let row = [], field = '', quoted = false;
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
  return rows.filter(r => r.length > 1)
             .map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}

const guests = parseCsv(fs.readFileSync(process.argv[2], 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

let made = 0, skipped = 0;
for(const row of guests){
  const token = row['Token'] || '';
  if(!token){ skipped++; continue; }
  const lang = row['Language'] || 'it';
  const invitee = row['Invitee'] || '';
  const plusName = row['Plus-one name'] || '';
  const g = {
    lang,
    greeting: row['Greeting'] || greetingFor(invitee, plusName, lang),
    plusOne: /^(yes|y|true|1|si|sì|oui|x)$/i.test(row['Plus-one'] || ''),
    plusName,
    note: row['Personal note'] || '',
  };
  execFileSync('node', [path.join(__dirname, 'render-card.js'),
                        JSON.stringify(g), path.join(OUT, `card-${token}.jpg`)],
               { stdio: 'inherit' });
  made++;
}
console.log(`\n${made} card(s) rendered` + (skipped ? ` · ${skipped} skipped (no token)` : ''));
if(GUESSED.length){
  console.log(`\n${GUESSED.length} greeting(s) guessed a gender from the name — check these:`);
  console.log('  ' + GUESSED.join('\n  '));
}
