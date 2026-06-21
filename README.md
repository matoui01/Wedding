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
```

## Local preview

```bash
cd site && python3 -m http.server 8000   # → http://localhost:8000
```

## Deploy (GitHub Pages)

A workflow publishes `site/` to Pages on every push to `main` (and the dev branch).
**One-time setup:** repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Live URL will be `https://matoui01.github.io/wedding/`.

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
8. **RSVP forms** — create 3 Tally forms (IT/FR/EN), paste their embed URLs into
   `TALLY` in `js/main.js`. Until then the RSVP section shows a styled placeholder.
9. Optional: custom domain.

> The paintings here are the chart's watercolours saved as JPEG (white paper that reads as
> ivory). If transparent `-cut.png` versions are produced later, drop them into `assets/img/`
> and update the `src`/dimensions in `index.html`.
