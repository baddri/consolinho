#!/usr/bin/env python3
"""PreToolUse(Bash) guard: refuse unfiltered `cat` dumps of large files.

Why: transcript analysis (2026-11-19) showed ~75% of subagent tool-output tokens came from `cat`-ing whole source
files and docs, which then ride along in every later turn of that agent. Small files and filtered pipelines
(`cat x | grep ...`) pass; heredoc writes (`cat > f <<EOF`) are ignored.
"""
import glob, json, os, re, shlex, sys

LIMIT = 40_000  # bytes (~10k tokens) per unfiltered cat statement

try:
    data = json.load(sys.stdin)
    cmd = data.get("tool_input", {}).get("command", "")
    cwd = data.get("cwd") or os.getcwd()
except Exception:
    sys.exit(0)
if "<<" in cmd:  # heredoc bodies make naive parsing unreliable; writes are not reads anyway
    sys.exit(0)

total, files = 0, []
dir_ = cwd
for stmt in re.split(r"&&|\|\||;|\n", cmd):
    stages = stmt.split("|")
    try:
        words = shlex.split(stages[0])
    except ValueError:
        continue
    if words[:1] == ["cd"] and len(words) > 1:  # track `cd x && cat ...`
        dir_ = os.path.join(dir_, os.path.expanduser(words[1]))
        continue
    if words[:1] != ["cat"] or len(stages) > 1 or any(w.startswith((">", "<")) for w in words):
        continue
    for w in words[1:]:
        if w.startswith("-"):
            continue
        for f in glob.glob(os.path.join(dir_, os.path.expanduser(w))) or []:
            if os.path.isfile(f):
                total += os.path.getsize(f); files.append(os.path.relpath(f, cwd))

if total > LIMIT:
    reason = (
        f"Blocked: this cat would dump {total // 1024} KB (~{total // 4000}k tokens) from {len(files)} file(s) into "
        "your context, where it is re-sent on every later turn. Read only what you need: LSP (documentSymbol, "
        "hover, goToDefinition, findReferences) or `grep -n` to locate, then Read with offset/limit (or "
        "`sed -n 'a,bp'`). For docs, `grep -n '^#' file` and read only the relevant sections. If you really need "
        "a whole file, Read that one file."
    )
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                             "permissionDecision": "deny",
                                             "permissionDecisionReason": reason}}))
sys.exit(0)
