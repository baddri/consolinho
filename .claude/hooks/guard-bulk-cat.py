#!/usr/bin/env python3
"""PreToolUse(Bash) guard: refuse shell commands that dump large amounts of file content into the context.

Why: transcript analysis (2026-11-19) showed ~75% of subagent tool-output tokens came from `cat`-ing whole source
files and docs, which then ride along in every later turn of that agent. A second pass (2026-11-20) found the
remaining bulk reads slipped past a cat-only check: `for f in *.ts; do cat $f; done`, long `sed -n 'a,bp'` ranges and
several reads chained in one command. So every read in the command is measured exactly and summed:
  cat FILE..            -> whole file
  sed -n 'a,bp' FILE..  -> (b-a+1) lines of it (several -e/; ranges summed)
  head/tail -n N FILE.. -> N lines (default 10)
  loop bodies           -> the read applied to every file the `for x in <globs>` list expands to
Reads that feed a pipeline (`cat x | grep ...`) are filtered and pass; heredoc writes are ignored.
"""
import glob, json, os, re, shlex, sys

LIMIT = 20_000  # bytes (~5k tokens) of file content per command; the Read tool stays the escape hatch for one big file

try:
    data = json.load(sys.stdin)
    cmd = data.get("tool_input", {}).get("command", "")
    cwd = data.get("cwd") or os.getcwd()
except Exception:
    sys.exit(0)
if "<<" in cmd:  # heredoc bodies make naive parsing unreliable; writes are not reads anyway
    sys.exit(0)

KEYWORDS = {"do", "then", "else", "{", "(", "time"}


def expand(pattern, base):
    """Files a shell word refers to (globs expanded, relative to the tracked cwd)."""
    return [f for f in glob.glob(os.path.join(base, os.path.expanduser(pattern))) if os.path.isfile(f)]


def printed_bytes(path, ranges):
    """Exact bytes a read prints: `ranges` is None (whole file) or 1-based inclusive (first, last) line ranges;
    a negative first line means "the last N lines" (tail)."""
    if ranges is None:
        return os.path.getsize(path)
    try:
        with open(path, "rb") as fh:
            lines = fh.read().splitlines(keepends=True)
    except OSError:
        return 0
    total = 0
    for a, b in ranges:
        chunk = lines[a:] if a < 0 else lines[a - 1:b]
        total += sum(map(len, chunk))
    return total


def sed_ranges(script):
    """Line ranges printed by a `sed -n` script made of `a,bp` / `ap` parts; None if it isn't one we understand."""
    ranges = []
    for part in re.split(r"[;\n]", script):
        part = part.strip()
        if not part:
            continue
        m = re.fullmatch(r"(\d+)(?:,(\d+|\$))?p", part)
        if not m:
            return None
        a = int(m[1])
        ranges.append((a, 10**9 if m[2] == "$" else int(m[2] or a)))
    return ranges


def read_cost(words, base, loop_files):
    """Bytes one unfiltered read statement prints; files named by a loop variable use `loop_files`."""
    tool, args = words[0], words[1:]
    targets, n_lines, sed_script = [], None, None
    i = 0
    while i < len(args):
        w = args[i]
        if tool == "sed" and w in ("-n", "--quiet", "-E", "-r"):
            pass
        elif tool == "sed" and w == "-e" and i + 1 < len(args):
            sed_script = (sed_script + ";" if sed_script else "") + args[i + 1]; i += 1
        elif tool in ("head", "tail") and w == "-n" and i + 1 < len(args):
            n_lines = args[i + 1].lstrip("+-"); i += 1
        elif tool in ("head", "tail") and re.fullmatch(r"-n?\d+", w):
            n_lines = w.lstrip("-n")
        elif w.startswith("-"):
            pass
        elif tool == "sed" and sed_script is None:
            sed_script = w
        else:
            targets.append(w)
        i += 1
    if tool == "sed":
        if "-n" not in args and "--quiet" not in args:
            return 0  # sed without -n is an edit/transform, not a ranged read
        ranges = sed_ranges(sed_script or "")
        if ranges is None:
            return 0
    elif tool in ("head", "tail"):
        n = int(n_lines) if n_lines and n_lines.isdigit() else 10
        ranges = [(1, n)] if tool == "head" else [(-n, 0)]
    else:
        ranges = None
    total = 0
    for t in targets:
        files = loop_files if "$" in t else expand(t, base)
        for f in files:
            total += printed_bytes(f, ranges)
    return total


total, base, loop_files = 0, cwd, []
for stmt in re.split(r"&&|\|\||;|\n", cmd):
    stages = stmt.split("|")
    try:
        words = shlex.split(stages[0])
    except ValueError:
        continue
    while words and words[0] in KEYWORDS:
        words = words[1:]
    if not words:
        continue
    if words[0] == "cd" and len(words) > 1:  # track `cd x && cat ...`
        base = os.path.join(base, os.path.expanduser(words[1]))
        continue
    if words[0] == "for" and "in" in words:  # `for f in a/*.ts b.md` — remember what $f expands to
        loop_files = [f for w in words[words.index("in") + 1:] for f in expand(w, base)]
        continue
    if words[0] not in ("cat", "sed", "head", "tail") or len(stages) > 1 or any(w.startswith((">", "<")) for w in words):
        continue
    total += read_cost(words, base, loop_files)

if total > LIMIT:
    reason = (
        f"Blocked: this command would print ~{total // 1024} KB (~{total // 4000}k tokens) of file content into your "
        "context, where it is re-sent on every later turn. Read only what you need: LSP (documentSymbol, hover, "
        "goToDefinition, findReferences) or `grep -n` to locate, then Read with offset/limit or a short "
        "`sed -n 'a,bp'`. For docs, `grep -n '^#' file` and read only the relevant sections. If you really need "
        "a whole file, Read that one file."
    )
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                             "permissionDecision": "deny",
                                             "permissionDecisionReason": reason}}))
sys.exit(0)
