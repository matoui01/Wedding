# Wedding HQ

One Google Sheet runs the guest list. It drafts the invitations, and the
replies come back onto each guest's own row.

```
Guests sheet ──▶ Gmail drafts ──▶ you press Send ──▶ guest clicks their link
     ▲                                                        │
     └──────────── answer written back onto their row ◀────────┘
```

Nothing is ever sent without you reading it first.

---

## Finish the setup

Two steps. Everything else is built and deployed.

**1 · Install the script.** Open the sheet ▸ **Extensions ▸ Apps Script**.
Replace the file with `apps-script/Code.gs`, and paste `appsscript.json` under
Project Settings (show manifest first). Save.

**2 · Set the password.** Project Settings ▸ **Script properties** ▸ add
`SITE_PASSWORD` = the site password. It is not written down in this
repository, which is public.

**3 · Publish the RSVP endpoint.** Deploy ▸ New deployment ▸ **Web app**,
Execute as **Me**, access **Anyone**. Copy the `/exec` URL into
`RSVP_ENDPOINT` at the top of `site/js/main.js`, then commit and push.

**4 · Fill in the email addresses.** The one thing no script can do. A row
without an email turns red and is never drafted, and the Dashboard counts how
many are still missing.

Then reload the sheet — a **💌 Wedding HQ** menu appears — and run
**Send a test to me**.

---

## The tabs

**Guests** — one row per invitation. You own **A–P**; the script writes
**Q–AD** and tints them so it is obvious which is which.

| | |
|---|---|
| `Household` / `Invitee` | who the email is addressed to |
| `Plus-one` + `Plus-one name` | leave the name blank and the invitation says "and guest" rather than naming a placeholder |
| `Kids?` / `Kids est.` | your own guess, for planning — parents confirm the real number when they reply |
| `Category` / `Subcategory` / `Side` | the broad band, the circle inside it, and whose guest they are |
| `Priority` | 1 · 2 · 3 |
| `Send?` | **Send** · **Hold** · **Cut** — how the list gets down to the target |
| `Wave` | which batch they go out in |
| `Greeting` | optional. Whatever you type here wins over the one the card was rendered with |

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

Everything creates **drafts**. You read them in Gmail and press Send yourself.

| Menu item | What it does |
|---|---|
| Generate missing invite links | gives each guest a private token and builds their link |
| Create drafts — selected rows | just the rows you highlighted |
| Create drafts — filtered rows | everything the current filter shows — this is the per-category send |
| Create drafts — a whole wave… | asks for a wave number and sends that batch |
| Create reminder drafts | only guests already past *their own* deadline |

`Hold` and `Cut` rows are skipped by all of them. So is any row whose card is
missing from Drive — the menu says how many, rather than sending a hollow
invitation.

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
invitation**, drawn in a headless browser with the real fonts, which is how
every stationery service solves the same problem. Everything a guest has to
*act* on stays live text below it: the password to read, the link to press,
the date to remember.

There is **one card per language**, not one per guest. Everything that differs
between guests — their greeting, their note, whether they have a plus-one —
is live text in the email around the card, which is short enough that the
fallback fonts carry it. So the cards are three small files in `site/assets/`,
committed like any other asset: nothing to render per guest, nothing to
upload, nothing personal stored anywhere.

```bash
node tools/invites/assets/render-card.js '{"lang":"fr"}' site/assets/img/card-fr.jpg
```

The card design is plain CSS in `assets/render-card.js`. The email around it
is `apps-script/Code.gs`; `preview/build-preview.py` regenerates a proof sheet
straight from that file, so the preview can never drift from what is sent.

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
