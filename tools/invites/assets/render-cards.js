#!/usr/bin/env node
/* Draw one invitation card per guest, from an export of the Guests tab.
 *
 *   node tools/invites/assets/render-cards.js guests.csv
 *
 * Reads Token, Language, Invitee, Plus-one, Plus-one name, Greeting and
 * Personal note, and writes
 *
 *   tools/invites/assets/cards-out/Wedding cards/card-<token>-<key>.jpg
 *
 * — the whole invitation, with that guest's greeting, plus-one line and note
 * drawn in the real typefaces. The folder is named so it can be dragged into
 * Drive as it is; the script in the sheet looks for exactly that name.
 *
 * The words, and the <key> in the file name, come from the "shared" block of
 * apps-script/Code.gs, evaluated here as-is: the same code that decides what
 * the email says and which file the send looks for. A card already present
 * under its exact name is skipped, so re-running after correcting a few rows
 * only redraws those rows.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const OUT  = path.resolve(__dirname, 'cards-out', 'Wedding cards');
const CODE = path.resolve(__dirname, '../apps-script/Code.gs');

/* The shared block: pure JavaScript between two markers, run in a bare
   context so anything it accidentally reached for would fail loudly here
   rather than silently differ from the sheet. */
function sharedWords(){
  const src = fs.readFileSync(CODE, 'utf8');
  const a = src.indexOf('/* >>> shared'), b = src.indexOf('/* <<< shared */');
  if(a < 0 || b < 0) throw new Error('shared block markers not found in ' + CODE);
  const block = src.slice(a, b);
  return vm.runInNewContext(block +
    '\n({ greetingOf_, greetingGuessed_, plusLine_, cardKey_, cardName_, normLang_, normText_, truthy_ })',
    {}, { filename: 'Code.gs (shared block)' });
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

const W = sharedWords();
const guests = parseCsv(fs.readFileSync(process.argv[2], 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

let made = 0, kept = 0, skipped = 0;
const guessed = [], wanted = new Set();
for(const row of guests){
  const token = row['Token'] || '';
  if(!token){ skipped++; continue; }
  const g = {
    lang:     W.normLang_(row['Language']),
    names:    row['Invitee'] || '',
    plusOne:  W.truthy_(row['Plus-one']),
    plusName: row['Plus-one name'] || '',
    greeting: row['Greeting'] || '',
    note:     row['Personal note'] || '',
  };
  const card = { lang: g.lang, greeting: W.greetingOf_(g), plus: W.plusLine_(g), note: W.normText_(g.note) };
  if(!g.greeting && W.greetingGuessed_(g.names, g.plusName, g.lang)) guessed.push(card.greeting);
  const out = path.join(OUT, W.cardName_(token, W.cardKey_(g)));
  wanted.add(path.basename(out));
  if(fs.existsSync(out) && fs.statSync(out).size > 10000){ kept++; continue; }
  execFileSync('node', [path.join(__dirname, 'render-card.js'), JSON.stringify(card), out],
               { stdio: 'inherit' });
  made++;
}
/* A card whose row has since changed would still match nothing in the sheet,
   but it has no business being dragged into Drive either. */
let pruned = 0;
for(const f of fs.readdirSync(OUT)){
  if(/^card-.*\.jpg$/.test(f) && !wanted.has(f)){ fs.unlinkSync(path.join(OUT, f)); pruned++; }
}
console.log(`\n${made} card(s) drawn · ${kept} already up to date` + (pruned ? ` · ${pruned} outdated removed` : '') +
            (skipped ? ` · ${skipped} row(s) skipped (no token — run “Prepare guests” in the sheet first)` : ''));
if(guessed.length){
  console.log(`\n${guessed.length} greeting(s) address one person in French or Italian, so the gender was guessed from the first name — check these:`);
  console.log('  ' + guessed.join('\n  '));
}
