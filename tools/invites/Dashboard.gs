/* ============================================================================
   Guest-list dashboard  (Ilaria & Maxime)
   ----------------------------------------------------------------------------
   Builds a single management view on top of the two lists you already have:

     Invites   — who you're inviting (one row per household/invitation)
     RSVP      — replies, appended automatically by the website form
     Dashboard — ← this script creates it: live join of the two

   HOW TO USE (once):
     1. Open the spreadsheet that holds your RSVP tab.
     2. Extensions ▸ Apps Script, add a file, paste this in, Save.
     3. Pick  buildGuestDashboard  in the function dropdown and press Run.
        (Approve the permission prompt the first time.)
     4. Go back to the spreadsheet — 'Invites' and 'Dashboard' now exist.

   You only ever run it ONCE. The dashboard is built from live formulas, so it
   updates by itself as replies land and as you add rows to Invites.
   Re-run it only if you want to rebuild the layout from scratch.

   The RSVP columns are found BY HEADER NAME, not by position, so it keeps
   working even if the column order changes.
   ========================================================================== */

var DASH = {
  invitesTab  : 'Invites',
  rsvpTab     : 'RSVP',
  dashTab     : 'Dashboard',
  rows        : 400,   // how many invitation rows the dashboard covers
  headerRow   : 13     // the table's header row on the Dashboard tab
};

/* Column headers we expect on the Invites tab. Order is free — the invite
   draft-generator matches these by name too, so the two stay compatible. */
var INVITE_HEADERS = ['Group','Names','Email','Language','Plus one',
                      'Greeting','Personal note','Status','Last updated'];

/* Accepted spellings for each RSVP column we need. */
var RSVP_ALIASES = {
  timestamp : ['timestamp','date'],
  name      : ['name','full name','nome','nom'],
  email     : ['email','e-mail'],
  attending : ['attending','coming'],
  party     : ['party','alone/plus'],
  plusone   : ['plus-one','plus one','plusone','plus-one name'],
  dietary   : ['dietary','diet','allergies','dietary needs'],
  shuttle   : ['shuttle','transport']
};

function buildGuestDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var rsvp = ss.getSheetByName(DASH.rsvpTab) || findRsvpSheet_(ss);
  if (!rsvp) {
    throw new Error('No RSVP tab found. Open the spreadsheet that receives ' +
                    'your website form replies, then run this again.');
  }

  var cols = mapRsvpColumns_(rsvp);
  if (!cols.email || !cols.attending) {
    throw new Error('The RSVP tab has no "Email" and/or "Attending" column. ' +
                    'Update the form script to the 13-column version, clear ' +
                    'the old rows so the new header is written, then re-run.');
  }

  var invites = ensureInvitesTab_(ss);
  var dash = ss.getSheetByName(DASH.dashTab) || ss.insertSheet(DASH.dashTab);
  dash.clear();

  writeSummary_(dash);
  writeTable_(dash, cols, rsvp.getName(), invites.getName());
  styleDashboard_(dash);

  ss.setActiveSheet(dash);
  SpreadsheetApp.getUi().alert(
    'Dashboard ready.\n\n' +
    'Add your guests to the "Invites" tab (one row per invitation). ' +
    'The Dashboard fills in by itself as replies arrive.');
}

/* ---------------------------------------------------------------- helpers */

function findRsvpSheet_(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var head = sheets[i].getRange(1, 1, 1, sheets[i].getLastColumn() || 1)
                        .getValues()[0].join('|').toLowerCase();
    if (head.indexOf('attending') > -1) return sheets[i];
  }
  return null;
}

/* Map our logical fields → the sheet's actual column letters, by header name. */
function mapRsvpColumns_(sheet) {
  var lastCol = sheet.getLastColumn() || 1;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var found = {};
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).trim().toLowerCase();
    if (!h) continue;
    for (var key in RSVP_ALIASES) {
      if (found[key]) continue;
      if (RSVP_ALIASES[key].indexOf(h) > -1) found[key] = colLetter_(c + 1);
    }
  }
  return found;
}

function colLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}

function ensureInvitesTab_(ss) {
  var sh = ss.getSheetByName(DASH.invitesTab);
  if (!sh) {
    sh = ss.insertSheet(DASH.invitesTab);
    sh.appendRow(INVITE_HEADERS);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(INVITE_HEADERS);
  }
  sh.getRange(1, 1, 1, INVITE_HEADERS.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

/* Latest reply for a given email. XLOOKUP with search_mode -1 scans bottom-up,
   so if somebody submits twice we take their most recent answer. */
function lookup_(rsvpTab, emailCol, targetCol, dashEmailCell) {
  if (!targetCol) return '"—"';
  return 'IFERROR(XLOOKUP(LOWER(TRIM(' + dashEmailCell + ')),' +
         'ARRAYFORMULA(LOWER(TRIM(\'' + rsvpTab + '\'!$' + emailCol + '$2:$' + emailCol + '))),' +
         '\'' + rsvpTab + '\'!$' + targetCol + '$2:$' + targetCol + ',"—",0,-1),"—")';
}

function writeSummary_(dash) {
  var r = DASH.headerRow;      // first data row is r + 1
  var first = r + 1;

  dash.getRange('A1').setValue('Guest list — Ilaria & Maxime');

  var rows = [
    ['Invitations (households)', '=COUNTA(\'' + DASH.invitesTab + '\'!C2:C)'],
    ['Invites sent',             '=COUNTIF(\'' + DASH.invitesTab + '\'!H2:H,"*raft*")'],
    ['Replies received',         '=COUNTIF($E$' + first + ':$E,"Yes")'],
    ['Attending',                '=COUNTIF($F$' + first + ':$F,"yes")'],
    ['Declined',                 '=COUNTIF($F$' + first + ':$F,"no")'],
    ['Awaiting reply',           '=MAX(0,$B$3-$B$5)'],
    ['TOTAL HEADCOUNT',          '=COUNTIF($F$' + first + ':$F,"yes")+COUNTIFS($F$' + first + ':$F,"yes",$G$' + first + ':$G,"plus")'],
    ['Need the shuttle',         '=COUNTIFS($F$' + first + ':$F,"yes",$J$' + first + ':$J,"yes")'],
    ['With dietary needs',       '=COUNTIFS($F$' + first + ':$F,"yes",$I$' + first + ':$I,"?*")']
  ];
  dash.getRange(3, 1, rows.length, 2).setValues(rows);
}

function writeTable_(dash, cols, rsvpTab, invitesTab) {
  var r = DASH.headerRow;
  dash.getRange(r, 1, 1, 11).setValues([[
    'Household', 'Names', 'Email', 'Invite status', 'Replied',
    'Attending', 'Alone / plus', 'Plus-one', 'Dietary', 'Shuttle', 'Replied on'
  ]]);

  var formulas = [];
  for (var i = 0; i < DASH.rows; i++) {
    var dRow = r + 1 + i;                 // row on Dashboard
    var iRow = 2 + i;                     // matching row on Invites
    var inv  = '\'' + invitesTab + '\'!';
    var guard = 'IF(' + inv + 'C' + iRow + '="","",';
    var emailCell = '$C' + dRow;

    formulas.push([
      '=' + guard + inv + 'A' + iRow + ')',
      '=' + guard + inv + 'B' + iRow + ')',
      '=' + guard + inv + 'C' + iRow + ')',
      '=' + guard + inv + 'H' + iRow + ')',
      '=IF(' + emailCell + '="","",IF($F' + dRow + '="—","—","Yes"))',
      '=IF(' + emailCell + '="","",' + lookup_(rsvpTab, cols.email, cols.attending, emailCell) + ')',
      '=IF(' + emailCell + '="","",' + lookup_(rsvpTab, cols.email, cols.party,     emailCell) + ')',
      '=IF(' + emailCell + '="","",' + lookup_(rsvpTab, cols.email, cols.plusone,   emailCell) + ')',
      '=IF(' + emailCell + '="","",' + lookup_(rsvpTab, cols.email, cols.dietary,   emailCell) + ')',
      '=IF(' + emailCell + '="","",' + lookup_(rsvpTab, cols.email, cols.shuttle,   emailCell) + ')',
      '=IF(' + emailCell + '="","",' + lookup_(rsvpTab, cols.email, cols.timestamp, emailCell) + ')'
    ]);
  }
  dash.getRange(r + 1, 1, formulas.length, 11).setFormulas(formulas);
}

function styleDashboard_(dash) {
  var r = DASH.headerRow;
  dash.getRange('A1').setFontSize(14).setFontWeight('bold');
  dash.getRange(3, 1, 9, 1).setFontWeight('bold');
  dash.getRange(9, 1, 1, 2).setBackground('#EAF0E4');   // TOTAL HEADCOUNT row
  dash.getRange(r, 1, 1, 11).setFontWeight('bold').setBackground('#F2EBD9');
  dash.setFrozenRows(r);
  dash.getRange(r + 1, 11, DASH.rows, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  var widths = [150, 190, 220, 120, 90, 100, 110, 150, 200, 90, 130];
  for (var c = 0; c < widths.length; c++) dash.setColumnWidth(c + 1, widths[c]);
  dash.getRange(2, 1).setValue('');
}
