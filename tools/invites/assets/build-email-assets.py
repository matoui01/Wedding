#!/usr/bin/env python3
"""Render the email-only image assets.

Gmail strips <link> web fonts, so Pinyon Script never loads and the couple's
names fall back to Georgia at 76px — which is the single thing that stops the
email looking like the design. The names are therefore rendered here, once, as
a transparent PNG at 2x, and shipped as an image.

It also makes an email-weight copy of the hero: the site's estate-cut.png is
1.5 MB, which is far too heavy to put in front of a phone on mobile data.

    python3 tools/invites/assets/build-email-assets.py

Writes into site/assets/img/. Re-run only if the wordmark or hero changes.
"""
import io
import pathlib
import sys
import urllib.request

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("pip install Pillow")

ROOT = pathlib.Path(__file__).resolve().parents[3]
IMG = ROOT / "site" / "assets" / "img"

PINYON = "https://fonts.gstatic.com/s/pinyonscript/v24/6xKpdSJbL9-e9LuoeQiDRQR8aOI.ttf"

INK = (61, 53, 42)          # --ink        #3D352A
TERRACOTTA = (196, 122, 84)  # --terracotta #C47A54
PANNA = (250, 246, 236)      # --panna      #FAF6EC

SCALE = 2                    # retina; the email displays these at half width


def font_bytes(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return r.read()


def wordmark(dst, display_width=460):
    """"Ilaria & Maxime" in Pinyon Script, the ampersand in terracotta — the
    one piece of typography the whole design hangs on."""
    raw = font_bytes(PINYON)
    probe = ImageFont.truetype(io.BytesIO(raw), 100)
    parts = [("Ilaria ", INK), ("&", TERRACOTTA), (" Maxime", INK)]
    natural = sum(probe.getlength(t) for t, _ in parts)

    size = round(100 * (display_width * SCALE) / natural)
    font = ImageFont.truetype(io.BytesIO(raw), size)

    # Pinyon's swashes overshoot the nominal box, so measure the real ink and
    # pad from that rather than trusting the em square.
    full = "".join(t for t, _ in parts)
    box = font.getbbox(full)
    pad = round(size * 0.10)
    w = round(sum(font.getlength(t) for t, _ in parts)) + pad * 2
    h = (box[3] - box[1]) + pad * 2

    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x = pad
    for text, colour in parts:
        d.text((x, pad - box[1]), text, font=font, fill=colour + (255,))
        x += font.getlength(text)

    im = im.crop(im.getbbox())          # trim to the ink itself
    im.save(dst, "PNG", optimize=True)
    return im.size


def hero(src, dst, width=1200, target_kb=200):
    """The site's hero is a transparent cut-out; email wants a light, opaque
    JPEG, so it is composited onto the same ivory the email sits on."""
    im = Image.open(src).convert("RGBA")
    flat = Image.new("RGB", im.size, PANNA)
    flat.paste(im, mask=im.split()[3])
    ratio = width / flat.width
    flat = flat.resize((width, round(flat.height * ratio)), Image.LANCZOS)

    for q in range(86, 40, -6):         # step down only as far as it must
        buf = io.BytesIO()
        flat.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
        if buf.tell() <= target_kb * 1024:
            break
    dst.write_bytes(buf.getvalue())
    return flat.size, buf.tell()


def main():
    w = wordmark(IMG / "email-wordmark.png")
    print(f"email-wordmark.png  {w[0]}x{w[1]}px  "
          f"{(IMG / 'email-wordmark.png').stat().st_size // 1024} KB")

    size, nbytes = hero(IMG / "estate-cut.png", IMG / "email-estate.jpg")
    was = (IMG / "estate-cut.png").stat().st_size
    print(f"email-estate.jpg    {size[0]}x{size[1]}px  {nbytes // 1024} KB "
          f"(was {was // 1024} KB, {was / nbytes:.0f}x lighter)")


if __name__ == "__main__":
    main()
