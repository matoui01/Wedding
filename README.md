# Maxime & Ilaria — Wedding Website

Trilingual (IT · FR · EN) single-page wedding site for **Maxime Atoui & Ilaria Cianti**,
**Villa Corsini a Mezzomonte, 23 July 2027**. Static HTML/CSS/vanilla-JS, no backend.

Visual language is the locked *mezzomonte acquerello* design chart — sage + ivory palette,
watercolour paintings bleeding on ivory, Pinyon Script names, Cormorant titles, EB Garamond body.

## Structure

```
site/
  index.html            one scrolling page, anchor nav, language switcher
  css/tokens.css        design tokens (palette + type) — source of truth
  css/main.css          layout & components (consumes tokens only)
  js/i18n.js            IT/FR/EN dictionary + browser-language detection
  js/main.js            nav, scroll state, mobile menu, reveal, Tally loader
  assets/marks.svg      crest · corner · seal · sprig (from the chart)
  assets/img/*.jpg      the seven watercolour paintings (extracted from the chart)
  assets/favicon.svg
.github/workflows/deploy.yml   GitHub Pages deploy on push
tools/invites/          the guest list, invite emails and RSVP intake
  README.md             how the Wedding HQ sheet is set up and run
  apps-script/Code.gs   the engine: builds the workbook, drafts invites,
                        receives RSVPs and writes them back onto guest rows
  sheet/                migration from the couple's own spreadsheet
  preview/              proof sheet for the invite email, generated from Code.gs
```

The site is static; everything that needs a server (sending invites, storing
RSVPs) runs as a Google Apps Script bound to the couple's own Sheet. The page
posts to it, and each guest's invite link carries a token so their reply lands
on their own row.

## Local preview

```bash
cd site && python3 -m http.server 8000   # → http://localhost:8000
```

## Deploy (GitHub Pages)

A workflow publishes `site/` to Pages on every push to `main` (and the dev branch).
**One-time setup:** repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Live URL: `https://ilariaemaxime.com/` (custom domain, set via `site/CNAME`).
The `https://matoui01.github.io/Wedding/` address redirects to it.

> The domain is registered for one year and expires **5 Sept 2027**. Before it
> lapses, remove the custom domain in **Settings → Pages** and delete
> `site/CNAME` — otherwise both addresses break. The site then serves from
> `https://matoui01.github.io/Wedding/` indefinitely.

## Languages

Italian is the default. On first visit the browser language is detected
(`it` → Italian, `fr` → French, anything else → English) and the choice is saved.
The `IT · FR · EN` switcher updates every string, `alt` text and `<html lang>` instantly.
All copy lives in `js/i18n.js`.

## Still to do (placeholders marked `[ … ]` in the copy)

1. **Our Story** text (IT/FR/EN) + the "from [city]" city.
2. **Programme times** — confirm the timeline (currently placeholders).
3. **Exact venue address** — street + postcode for Impruneta (FI).
4. **Shuttle/transfer** — is transport provided? (updates `travel.car.b`).
5. **Hotels** — 3–5 options (Florence centre + near Impruneta).
6. **RSVP deadline** date (`rsvp.by`).
7. **Contact email** (footer + RSVP fallback).
8. **Guest list** — fill the `Email` column on the Guests tab (see
   `tools/invites/README.md`); nothing can be sent until it has addresses.
9. Optional: custom domain.

> The paintings are served as transparent `-cut.png` files (`assets/img/<name>-cut.png`):
> the ivory paper background is flood-filled to transparency so each watercolour blends
> seamlessly on both the `--panna` and warm `--panna-2` section bands. The original opaque
> `.jpg` sources are kept alongside them (and `estate.jpg` still backs the `og:image` social
> card, which must stay opaque). To re-cut after editing a source, run the flood-fill again
> and overwrite the matching `-cut.png`.
