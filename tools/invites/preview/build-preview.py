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

# Everything the two builders need, in dependency order. The "shared" block
# (greeting, plus-one line, card name) is lifted whole, between its markers.
CONSTS = ["CFG", "T", "FACE_CSS", "COPY", "MONTHS", "DEADLINE_SEED", "TOKEN_ALPHABET"]
FUNCS = ["buildEmail_", "buildReminder_", "factRow_", "sitePassword_", "esc_", "inviteLink_"]
SHARED = ("/* >>> shared", "/* <<< shared */")


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
        nxt = src[j + 1] if j + 1 < len(src) else ""
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == quote:
                in_str = False
        # comments are skipped whole: an apostrophe in prose ("Gmail's proxy")
        # would otherwise read as the start of a string and swallow the rest
        elif ch == "/" and nxt == "/":
            j = src.find("\n", j)
            if j < 0:
                break
        elif ch == "/" and nxt == "*":
            end = src.find("*/", j + 2)
            j = (end + 1) if end >= 0 else len(src)
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
        if name == "FACE_CSS":
            # a concatenated string rather than a bracketed literal, so it is
            # read to its terminating semicolon instead of by brace matching
            m = re.search(r"const FACE_CSS =.*?;\n", src, re.S)
            if not m:
                sys.exit("could not find FACE_CSS")
            parts.append(m.group(0).rstrip())
            continue
        parts.append(extract_block(src, rf"const {name} = ", opener,
                                   "]" if opener == "[" else "}") + ";")
    a, b = src.find(SHARED[0]), src.find(SHARED[1])
    if a < 0 or b < 0:
        sys.exit(f"could not find the shared block markers in {CODE}")
    shared = src[a:b + len(SHARED[1])]
    parts.append(shared)
    for name in FUNCS:
        parts.append(extract_block(src, rf"function {re.escape(name)}\(", "{", "}"))

    engine = "\n\n".join(parts)

    # Every private helper the lifted code calls must have come with it —
    # otherwise the proof sheet dies at load with a bare ReferenceError.
    defined = set(FUNCS) | set(re.findall(r"^function ([A-Za-z0-9_]+_)\(", shared, re.M)) \
              | {"Math", "String", "Number", "Object", "Date"}
    called = set(re.findall(r"\b([A-Za-z_][A-Za-z0-9_]*_)\s*\(", engine))
    missing = sorted(called - defined)
    if missing:
        sys.exit(f"build-preview: {CODE.name} helpers not lifted: {missing}\n"
                 f"  add them to FUNCS in {pathlib.Path(__file__).name}")
    page = (HERE / "preview-template.html").read_text(encoding="utf-8")
    OUT.write_text(page.replace("/*__ENGINE__*/", engine), encoding="utf-8")
    print(f"wrote {OUT.relative_to(HERE.parent.parent.parent)} "
          f"({len(engine.splitlines())} lines lifted from Code.gs)")


if __name__ == "__main__":
    main()
