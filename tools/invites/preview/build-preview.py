#!/usr/bin/env python3
"""Generate the invite-email proof sheet from the live Apps Script.

The email template is written once, in apps-script/Code.gs. This lifts the
template functions straight out of that file and inlines them into a browser
harness, so the proof always renders exactly what Gmail will send — there is no
second copy of the design to keep in step.

    python3 tools/invites/preview/build-preview.py

Re-run it after any edit to the email HTML in Code.gs.
"""
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
CODE = HERE.parent / "apps-script" / "Code.gs"
OUT = HERE / "invite-preview.html"

# Everything the two builders need, in dependency order.
CONSTS = ["CFG", "T", "COPY", "MONTHS", "DEADLINE_SEED", "TOKEN_ALPHABET"]
FUNCS = ["buildEmail_", "buildReminder_", "factRow_", "noteBlock_", "plusBlock_",
         "esc_", "greetingFromNames_", "inviteLink_", "normLang_"]


def extract_block(src, header_re, opener, closer):
    """Pull one top-level declaration out by matching brackets, so nested
    braces in the email HTML don't truncate it."""
    m = re.search(header_re, src)
    if not m:
        sys.exit(f"could not find {header_re!r} in {CODE}")
    i = src.index(opener, m.start())
    depth, j = 0, i
    in_str, quote, esc = False, "", False
    while j < len(src):
        ch = src[j]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == quote:
                in_str = False
        elif ch in "\"'`":
            in_str, quote = True, ch
        elif ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return src[m.start():j + 1]
        j += 1
    sys.exit(f"unbalanced {opener}{closer} while reading {header_re!r}")


def main():
    src = CODE.read_text(encoding="utf-8")
    parts = []
    for name in CONSTS:
        opener = "[" if name == "DEADLINE_SEED" else "{"
        if name == "TOKEN_ALPHABET":
            m = re.search(r"const TOKEN_ALPHABET = '[^']*';", src)
            parts.append(m.group(0))
            continue
        parts.append(extract_block(src, rf"const {name} = ", opener,
                                   "]" if opener == "[" else "}") + ";")
    for name in FUNCS:
        parts.append(extract_block(src, rf"function {re.escape(name)}\(", "{", "}"))

    engine = "\n\n".join(parts)
    page = (HERE / "preview-template.html").read_text(encoding="utf-8")
    OUT.write_text(page.replace("/*__ENGINE__*/", engine), encoding="utf-8")
    print(f"wrote {OUT.relative_to(HERE.parent.parent.parent)} "
          f"({len(engine.splitlines())} lines lifted from Code.gs)")


if __name__ == "__main__":
    main()
