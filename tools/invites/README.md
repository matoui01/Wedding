# Wedding HQ

One Google Sheet runs the guest list. Each row can be sent as a finished
invitation with one click, and the replies come back onto that same row.

```
Guests row ──▶ 💌 Send this invitation now ──▶ guest's inbox ──▶ their link
     ▲                                                              │
     └──────────── answer written back onto their row ◀──────────────┘
```

Nothing goes out without you seeing the exact words first, and nothing goes
out at all if anything about the row is doubtful.

---

## Finish the setup

**1 · Install the script.** Open the sheet ▸ **Extensions ▸ Apps Script**.
Replace the file with `apps-script/Code.gs`, and paste `appsscript.json` under
Project Settings (tick *show manifest* first). Save, then reload the sheet: a
**💌 Wedding HQ** menu appears. The first menu action asks you to authorise
Sheets, Gmail and read-only Drive — once.

**2 · Set the password.** Project Settings ▸ **Script properties** ▸ add
`SITE_PASSWORD` = the site password. It is not written down in this
repository, which is public.

**3 · Prepare the guests.** Menu ▸ **Prepare guests — invite links &
greetings**. Every row gets its private link and a `Greeting` — "Cari Sara e
Riccardo," "Chère Clara," — built from `Invitee`, `Plus-one name` and
`Language`. One person addressed in French or Italian needs a gender the sheet
does not have, so those are guessed from the first name: glance down the
column and retype any that are wrong. Whatever is in `Greeting` is what the
guest reads.

**4 · Get the cards.** Ask for the cards to be drawn (see *The invitation
card*). You receive a folder named **Wedding cards**; drag it into My Drive as
it is. That is the only upload there is.

**5 · Publish the RSVP endpoint.** Deploy ▸ New deployment ▸ **Web app**,
Execute as **Me**, access **Anyone**. Copy the `/exec` URL into
`RSVP_ENDPOINT` at the top of `site/js/main.js` and push. Until this is done
the site still posts to the old June endpoint, which knows nothing about
tokens — so the form is not prefilled and replies do not land on the rows.

**6 · Fill in the email addresses.** The one thing no script can do. A row
without an email is never sent, and the Dashboard counts how many are missing.

Then select any row and run **Send a test to me**: that guest's invitation,
exactly as they would get it, in your own inbox with a `[TEST]` subject.

---

## The tabs

**Guests** — one row per invitation. You own **A–P**; the script writes
**Q–AD** and tints them so it is obvious which is which.

| | |
|---|---|
| `Household` / `Invitee` | `Household` is your label for the row; `Invitee` is who the greeting addresses. A trailing initial ("Thomas J") is dropped from the greeting |
| `Plus-one` + `Plus-one name` | `yes` with a name: the card greets both and says "we'd be delighted to welcome X". `yes` without a name: an open plus-one — unless `Invitee` already names the couple, in which case nothing more is said. `no`: any name in the column is ignored |
| `Kids?` / `Kids est.` | your own note of which households have children. Children are **not invited**, so neither column touches `Seats` — they are there to tell you who is likeliest to decline, and who to expect a question from. The site asks nothing about children |
| `Category` / `Subcategory` / `Side` | the broad band, the circle inside it, and whose guest they are |
| `Priority` | 1 · 2 · 3 |
| `Send?` | **Send** · **Hold** · **Cut** — how the list gets down to the target |
| `Wave` | which batch they go out in |
| `Language` | `it` · `fr` · `en` — the card, the email and the site's first language |
| `Greeting` | filled by *Prepare guests* where empty; edit freely. It is drawn on the card, so a change here means that card is redrawn before it can go out |
| `Personal note` | optional, a sentence or two in your own voice, drawn on the card under the invitation text |

**Deadlines** — one row per category and the date it is asked to reply by.
Each guest's own date goes into their own email, in their own language. The
`(default)` row covers anyone uncategorised.

**RSVP** — every reply, appended, never edited. The audit trail when someone
answers twice.

**Dashboard** — the headline is **Room left to offer**: your target, minus who
has said yes, minus the seats still out with people who have not answered.
Plus breakdowns by category, subcategory, side and priority, and three working
lists — who to promote off Hold, who has not replied, and every dietary note.

---

## Sending

| Menu item | What it does |
|---|---|
| **Send this invitation now** | the row you have selected, straight to their inbox. A dialog shows the greeting, plus-one line, note, language and deadline before anything is sent |
| Send a test to me | the selected row's invitation to your own address, `[TEST]` in the subject |
| Create drafts — selected / filtered / a whole wave… | the same emails as Gmail drafts instead, for a batch you would rather read through first |
| Create reminder drafts | only guests already past *their own* deadline and still silent |
| Reset invite status | clears the status columns on the selected rows |

Every one of these refuses, and says why in the corner of the sheet, when a
row has no email, is on `Hold` or `Cut`, or has no card in Drive that matches
the row as it reads now. Nothing hollow is ever created — a draft with no
invitation in it is one click from going out.

Consumer Gmail sends at most about 100 messages a day from a script; a wave
of 80 is fine, 80 plus a lot of tests may not be.

### Working down to the target

1. Set `Send?` to `Hold` for anyone beyond the target, worst priority first.
   Nobody is deleted — held rows keep their history.
2. Send wave 1. Wait.
3. As declines arrive, **Room left to offer** goes up, and **Next to promote**
   already lists who is on hold, best priority first.
4. Flip those rows to `Send`, give them the next wave number, send again.

---

## The invitation card

Gmail, Outlook and Yahoo all strip web fonts before rendering, so the design
could never survive as live text — Pinyon Script and EB Garamond would fall
back to whatever the device had. The invitation is therefore **an image of the
invitation**: one per guest, the whole letter with their greeting, plus-one
line and note in it, drawn in a headless browser from the real font files.
This is how stationery services solve the same problem. Everything a guest
has to *act* on stays live text below the card: the password to read, the
link to press, the date to remember.

The cards are not generated when you press Send — Apps Script has nothing
that can draw text in a given typeface — and they are not in this repository,
because each one carries a name and a personal note and the repository is
public. They live in a Drive folder named **Wedding cards** that only your
account (and so the script) can read.

Each file is named `card-<token>-<key>.jpg`. The key is a fingerprint of the
words drawn on the card: language, greeting, plus-one line, note. The send
looks for the file whose key matches the row *as it reads now* — so if you
correct a greeting or add a note after the cards were made, that row simply
has no card until it is redrawn, and the menu tells you so instead of mailing
an old one. Every other row is unaffected.

### Drawing them

The words on the card and the key in its name come from the block marked
`>>> shared` in `apps-script/Code.gs`, which the renderer evaluates as-is: one
definition for what the email says, what the card shows and what the send
looks for.

```bash
# an export of the Guests tab (File ▸ Download ▸ CSV), never committed
node tools/invites/assets/render-cards.js tools/invites/sheet/guests-live.csv
#  → tools/invites/assets/cards-out/Wedding cards/card-<token>-<key>.jpg
```

Cards already present under their exact name are kept, so after correcting a
few rows only those are redrawn; cards no longer matching any row are
removed. Drag the folder into Drive (a second folder of the same name is
fine — every one is searched). The card design itself is plain CSS in
`assets/render-card.js`; the email around it is `apps-script/Code.gs`, and
`preview/build-preview.py` regenerates a proof sheet straight from that file.

## Re-importing the source spreadsheet

```bash
python3 tools/invites/sheet/migrate-xlsx.py Wedding_invitee.xlsx
```

Splits the old single `Category` column into Category + Subcategory + Side,
separates plus-one names from placeholders, guesses a language per circle, and
drops the pivot tables and scratch columns.

> **No guest data lives in this repository.** It is public. Both guest CSVs are
> ignored, the cards are ignored, and the password is a script property. Keep
> it that way.
