# Wedding HQ — the guest list, the invites, the replies

One Google Sheet runs the whole thing. You fill in guests; the sheet emails
them; their answers come back onto their own row. Nothing is sent without you
reading it first.

```
Guests sheet ──▶ Gmail drafts ──▶ you press Send ──▶ guest clicks their link
     ▲                                                        │
     └──────────── answer written back onto their row ◀────────┘
```

---

## Setting it up (once, ~15 minutes)

Do all of this signed in as the wedding account — drafts appear wherever the
script runs.

1. **Create a blank Google Sheet.** Name it *Wedding HQ*.
2. **Extensions ▸ Apps Script.** Delete the sample file, paste in
   `apps-script/Code.gs`, and save. (In Project Settings, show
   `appsscript.json` and paste that too — it sets the Rome timezone and the
   permissions.)
3. Back on the sheet, reload the tab. A **💌 Wedding HQ** menu appears.
   Run **Set up / repair the workbook**. Approve the permission prompt.
   The script builds all four tabs, with dropdowns, colours and formulas.
4. **Set the site password** as a script property — see below.
5. **Import the guest list**: File ▸ Import ▸ Upload `sheet/guests-seed.csv`
   ▸ *Replace data at selected cell*, with `A1` of **Guests** selected.
6. **Deploy for RSVPs**: Deploy ▸ New deployment ▸ Web app ·
   Execute as **Me** · Who has access **Anyone**. Copy the `/exec` URL into
   `RSVP_ENDPOINT` in `site/js/main.js`, commit, push.
7. Run **Send a test to me** and check the email in Gmail on a phone.

### The site password

It is **not** in `Code.gs`, and must not be: this repository is public, and the
site itself only stores a SHA-256 hash so the password cannot be read out of
it. Writing it into the script in clear would undo that.

Set it once in Apps Script — **Project Settings ▸ Script properties ▸ Add
script property**:

| Property | Value |
|---|---|
| `SITE_PASSWORD` | `REMOVED` |

Everything else in `CFG` is already correct. `RSVP_BY` is only a fallback; the
real dates live on the **Deadlines** tab.

> `SITE_URL` and `IMG_BASE` point at **`https://ilariaemaxime.com/`**, not the
> `matoui01.github.io` address — that one 301-redirects to plain `http://`, and
> Gmail's image proxy will not follow https → http, so every image in the email
> comes through blank. If the domain ever changes, change it in both keys.

---

## The tabs

**Guests** — one row per invitation. You own columns **A–P**; the script writes
**Q–AD** and tints them so it is obvious which is which.

| | |
|---|---|
| `Household` / `Invitee` | who the email is addressed to |
| `Plus-one` + `Plus-one name` | leave the name blank and the invite says "and guest" rather than naming a placeholder |
| `Kids?` / `Kids est.` | your own guess, for planning — parents confirm the real number on the RSVP |
| `Category` / `Subcategory` / `Side` | the broad band, the circle inside it, and whose guest they are |
| `Priority` | 1 · 2 · 3 |
| `Send?` | **Send** · **Hold** · **Cut** — how the list gets down to the target |
| `Wave` | which batch they go out in |
| `Email` | the only thing the script cannot do for you. A row without one is never drafted, and shows red |

**Deadlines** — one row per category, and the date it is asked to reply by.
Each guest's own date goes into their own email, in their own language.
The `(default)` row covers anyone uncategorised.

**RSVP** — every reply, appended, never edited. The audit trail when someone
answers twice.

**Dashboard** — the headline is **Room left to offer**: your target, minus who
has said yes, minus the seats still out with people who have not answered.
Plus breakdowns by category, subcategory, side and priority, and three working
lists: who to promote off Hold, who has not replied, and every dietary note.

---

## Sending

Everything creates **drafts**. You read them in Gmail and press Send yourself.

| Menu item | What it does |
|---|---|
| Generate missing invite links | gives each guest a private token and builds their link |
| Create drafts — selected rows | just the rows you highlighted |
| Create drafts — filtered rows | everything the current filter is showing — this is the per-category send |
| Create drafts — a whole wave… | asks for a wave number and sends that batch |
| Create reminder drafts | only guests already past *their own* deadline |

`Hold` and `Cut` rows are skipped by all of them.

### Working down to the target

1. Set `Send?` to `Hold` for anyone beyond the target, worst priority first.
   Nobody is deleted — held rows keep their history.
2. Send wave 1. Wait.
3. As declines arrive, **Room left to offer** goes up. **Next to promote** on
   the dashboard already lists who is on hold, best priority first.
4. Flip those rows to `Send`, give them the next wave number, send again.

---

## Reviewing the email design

```bash
python3 tools/invites/preview/build-preview.py     # regenerates the proof sheet
open tools/invites/preview/invite-preview.html
```

The proof sheet lifts the template straight out of `Code.gs`, so it always
shows what Gmail will actually send. Switch language, invitation vs reminder,
plus-one, personal note and category deadline, and check the plain-text version
that reaches anyone with images turned off. **Edit the email in `Code.gs`**,
then re-run the generator — never edit the generated HTML.

## Re-importing the source spreadsheet

```bash
python3 tools/invites/sheet/migrate-xlsx.py Wedding_invitee.xlsx
```

Splits the old single `Category` column into Category + Subcategory + Side,
separates plus-one names from placeholders, guesses a language per circle, and
drops the pivot tables and scratch columns.
