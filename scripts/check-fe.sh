#!/usr/bin/env bash
# Frontend gate (CLAUDE.md rule 4) with token-frugal output: lint, typecheck, tests, build. Full logs in <git-dir>/checks/,
# only failures are printed. Usage: scripts/check-fe.sh [vitest filter args, e.g. src/features/admin]
set -uo pipefail
# Target the checkout you are in (lets worktrees on older bases call the main tree's copy of this script).
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/.." && pwd))"; cd "$ROOT/web"
# Logs live in the checkout's git dir: per-worktree, never tracked, no .gitignore needed.
LOGS="$(cd "$ROOT" && git rev-parse --path-format=absolute --git-path checks 2>/dev/null || echo "$ROOT/.checks")"; # One sub-directory per run so concurrent agents' runs never overwrite each other's logs; keep the newest 20.
LOGS="$LOGS/$(date +%Y%m%d-%H%M%S)-$$"; mkdir -p "$LOGS"
ls -1dt "$(dirname "$LOGS")"/*/ 2>/dev/null | tail -n +21 | xargs -r rm -rf
fail=0
step() { # name, max lines, command...
  local name=$1 max=$2; shift 2
  if "$@" > "$LOGS/fe-$name.log" 2>&1; then echo "${name^^}: ok"
  else echo "${name^^}: FAILED (full log: $LOGS/fe-$name.log)"; fail=1
    grep -vE '^\s*$' "$LOGS/fe-$name.log" | sed "s#$ROOT/##g" | grep -E 'error|Error|✗|×|FAIL|AssertionError|Expected|Received|warning|^\S+\.(ts|tsx):' | head -"$max"
  fi
}
step lint 30 npm run -s lint
step typecheck 30 npm run -s typecheck
step test 40 npx vitest run --reporter=dot "$@"
grep -E 'Test Files|Tests ' "$LOGS/fe-test.log" | tail -2
[[ $# -gt 0 ]] || step build 20 npm run -s build
exit $fail
