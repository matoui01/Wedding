# Build Brief — Wedding Email Invites
### Ilaria & Maxime · Villa Corsini a Mezzomonte · 23 July 2027

This bundle adds a **personalised, trilingual email-invite system** on top of the
existing wedding site. It is designed to match the locked sage-and-ivory chart
(`tokens.css` / `marks.svg`) and the site voice (`i18n.js`).

**What it does:** a Google Sheet of guests → a menu button → a personalised,
on-brand email per guest (IT / FR / EN) → a **draft in the wedding Gmail
account** (`maxime.ilaria@gmail.com`) → the couple review each draft and Send it
themselves. Nothing is sent automatically.

---

## 0. Thirty-second summary

- The **engine** is a container-bound **Google Apps Script** (`apps-script/Code.gs`)
  that lives on the invite Sheet — *not* in this website repo. It uses
  `GmailApp.createDraft(...)`.
- The website's HTML / CSS / JS need **no changes**. The only repo change is
  committing **two images** so the email can show the gold crest + sprig.
- This mirrors the mechanism already in `js/main.js` for RSVP
  (`RSVP_ENDPOINT` → Apps Script web app → the couple's Sheet). Same idea,
  pointed outward.

---

## 1. Files in this bundle

```
wedding-email-invites/
├── README-CLAUDE-CODE.md          ← this brief
├── apps-script/
│   ├── Code.gs                    ← the draft generator (paste into the Sheet's Apps Script)
│   └── appsscript.json            ← manifest: scopes + Europe/Rome timezone (for clasp)
├── site-assets/
│   ├── email-crest.png            ← gold I&M monogram (440×480)  → commit to site/assets/img/
│   └── email-sprig.png            ← sage sprig divider (120×120) → commit to site/assets/img/
├── sheet/
│   └── invite-list-starter.csv    ← headers + 3 example rows; import into Google Sheets
└── preview/
    └── invite-preview.html        ← design reference / QA mock-up (open in a browser)
```

---

## 2. Repo tasks (the only changes to this repository)

1. **Copy the two PNGs into the site assets:**
   ```
   cp site-assets/email-crest.png  site/assets/img/email-crest.png
   cp site-assets/email-sprig.png  site/assets/img/email-sprig.png
   ```
   After deploy they resolve at
   `https://matoui01.github.io/Wedding/assets/img/email-crest.png` and
   `…/email-sprig.png` — the URLs `Code.gs` already references.
   (The email hero reuses the existing `estate-cut.png`, so even without these
   two the email still renders; they just light up the crest + divider.)

2. **(Recommended) Version the engine in-repo** for history, e.g. keep the
   `apps-script/` folder and this brief under `tools/invites/`. It is deployed
   separately (see §3), but it's good to track its source here.

3. **Do not** edit `index.html`, `css/*`, or `js/*` for this feature. The invite
   email is self-contained and independent of the page.

> Note for the agent: there is nothing to wire into the site runtime. Resist the
> urge to add an "email" section to the page — the deliverable is the asset
> commit plus the standalone Apps Script.

---

## 3. Deploy the engine (Apps Script)

The script is **container-bound** to the invite Sheet and only needs
authorisation — it is **not** a web app, so there's no `/exec` URL to publish.
Do this while logged into **maxime.ilaria@gmail.com** (drafts are created in
whichever account runs the script).

**Option A — paste (simplest):**
1. Create/open the invite Sheet (see §4). Extensions ▸ **Apps Script**.
2. Replace the default file with `apps-script/Code.gs`. In Project Settings,
   set the time zone to **Europe/Rome** (or paste `appsscript.json` if the
   manifest is shown).
3. Fill the `CFG` block (see §5). Save.
4. Reload the Sheet → a **💌 Invites** menu appears. Run **Send a test to me**
   once and approve the Gmail + Sheets permission prompt.

**Option B — clasp (CLI, if you prefer):**
```
npm i -g @google/clasp
clasp login
# bind to the invite Sheet's script (create one via Extensions ▸ Apps Script first):
clasp clone <SCRIPT_ID>
# drop Code.gs + appsscript.json into the cloned folder, then:
clasp push
```

---

## 4. The invite Sheet

Import `sheet/invite-list-starter.csv`, **or** add a tab to the existing RSVP
spreadsheet — either works (open decision in §7). Headers are matched by name
(case-insensitive, common aliases accepted), so column order is free.

| Column          | Required | Meaning |
|-----------------|:--------:|---------|
| `Email`         | ✔ | guest email; multiple allowed, separated by `,` or `;` |
| `Language`      |   | `it` / `fr` / `en` (default `it`) |
| `Greeting`      |   | salutation line, e.g. `Cari Marco e Giulia,` — if blank it's built from `Names` |
| `Names`         |   | only used to auto-build a greeting when `Greeting` is empty |
| `Plus one`      |   | `yes`/`true`/`1`/`si`/`oui` → adds the plus-one line |
| `Personal note` |   | optional one-off message shown in a sage panel |
| `Status`        | — | **written by the script** (`Draft created` / `Sent test`) |
| `Last updated`  | — | **written by the script** (timestamp) |

`Status` / `Last updated` are created automatically if missing. "Create drafts —
all pending" skips any row whose Status already contains `draft`, so re-running
is safe.

---

## 5. CONFIG to fill (`CFG` at the top of `Code.gs`)

| Key | Set to | Status |
|-----|--------|--------|
| `SITE_URL` | `https://matoui01.github.io/Wedding/` | ✅ prefilled |
| `PASSWORD` | the real **site password** from the invite gate | ⚠️ **TODO** — source only stores a SHA-256 hash, so it can't be auto-filled |
| `SENDER_NAME` | `Ilaria & Maxime` | ✅ (confirm) |
| `REPLY_TO` | `maxime.ilaria@gmail.com` | ✅ prefilled |
| `RSVP_BY` | real deadline per language | ⚠️ **TODO** — placeholder `30 April 2027` |
| `IMG_BASE` / `IMG_*` | GitHub Pages asset URLs | ✅ prefilled |
| `SUBJECT` | per-language subject lines | ✅ (edit to taste) |

---

## 6. Usage (the 💌 Invites menu)

- **Create drafts — selected rows** — highlight guest rows, run; one Gmail draft
  each. Use this for controlled batches.
- **Create drafts — all pending** — every row with an email and no draft yet.
- **Send a test to me** — sends a real copy (based on row 1, or a dummy) to the
  signed-in account, for end-to-end checking.
- **Reset status — selected rows** — clears Status so they re-queue as pending.

Review under **Gmail ▸ Drafts** and Send. (To switch from drafts to direct
send later, change `GmailApp.createDraft(...)` in `run_()` to
`GmailApp.sendEmail(...)` — same arguments.)

---

## 7. Open decisions (need the couple's input)

1. **Site password** → set `CFG.PASSWORD` (cannot be recovered from the hash).
2. **RSVP deadline date** → set `CFG.RSVP_BY` (it/fr/en).
3. **Sender name** → confirm `Ilaria & Maxime`.
4. **Invite list location** → new tab inside the existing RSVP spreadsheet, or a
   separate spreadsheet? (Bound script attaches to whichever Sheet hosts it.)
5. **Drafts vs. auto-send** → currently **drafts for review** (recommended).

---

## 8. QA checklist

- [ ] `email-crest.png` + `email-sprig.png` committed to `site/assets/img/` and
      resolve over HTTPS after deploy.
- [ ] `CFG.PASSWORD` and `CFG.RSVP_BY` filled; `SENDER_NAME` confirmed.
- [ ] "Send a test to me" renders correctly in **Gmail web + Gmail iOS/Android**
      and **Apple Mail** (the three big ones for these guests).
- [ ] Images-off / "blocked images" still reads cleanly (alt text present; the
      password and all key info are live **text**, never baked into an image).
- [ ] IT / FR / EN each produce the right copy, accents intact (é è à ï ·).
- [ ] Plus-one line appears only when `Plus one` is truthy.
- [ ] Personal-note panel appears only when `Personal note` is non-empty.
- [ ] Links go to the gated site; the password in the email unlocks it.

---

## 9. Design-fidelity notes

- **Source of truth for what's *sent* is `Code.gs`** (table-based HTML, inline
  styles, hosted PNGs — built to survive Gmail/Outlook). `preview/invite-preview.html`
  is a richer browser mock (inline SVG + live Google Fonts) for judging layout
  and copy; expect the sent email to be a touch plainer.
- **Pinyon Script** (the names) rarely loads in email clients, so most apps fall
  back to **Cormorant Garamond / Georgia** — still on-brand. To lock the script
  look exactly, render `Ilaria & Maxime` as a small PNG (like the crest) and swap
  the `<td>` wordmark for an `<img>`. *(Optional enhancement — ask the couple.)*
- Palette + type mirror `tokens.css`; the crest and sprig are the same marks as
  `marks.svg` (`#crest`, `#sprig`), rasterised for email.
