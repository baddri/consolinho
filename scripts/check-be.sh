#!/usr/bin/env bash
# Backend gate (CLAUDE.md rule 4) with token-frugal output: full logs go to <git-dir>/checks/, only the summary
# and the first errors/failed tests are printed. Usage: scripts/check-be.sh [--no-test] [extra dotnet test args]
# Checks the git checkout of the current directory (main tree or a worktree).
set -uo pipefail
# Target the checkout you are in (lets worktrees on older bases call the main tree's copy of this script).
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/.." && pwd))"; cd "$ROOT"
# Logs live in the checkout's git dir: per-worktree, never tracked, no .gitignore needed.
LOGS="$(cd "$ROOT" && git rev-parse --path-format=absolute --git-path checks 2>/dev/null || echo "$ROOT/.checks")"; # One sub-directory per run so concurrent agents' runs never overwrite each other's logs; keep the newest 20.
LOGS="$LOGS/$(date +%Y%m%d-%H%M%S)-$$"; mkdir -p "$LOGS"
ls -1dt "$(dirname "$LOGS")"/*/ 2>/dev/null | tail -n +21 | xargs -r rm -rf
export DOCKER_HOST="${DOCKER_HOST:-unix:///run/user/$(id -u)/podman/podman.sock}"
export TESTCONTAINERS_RYUK_DISABLED=true DOTNET_NOLOGO=1 DOTNET_CLI_TELEMETRY_OPTOUT=1
RUN_TESTS=1; [[ "${1:-}" == "--no-test" ]] && { RUN_TESTS=0; shift; }

if dotnet build FleetConsole.slnx -warnaserror -nologo -v q > "$LOGS/be-build.log" 2>&1; then
  echo "BUILD: ok"
else
  echo "BUILD: FAILED (full log: $LOGS/be-build.log)"
  grep -E ': (error|warning) ' "$LOGS/be-build.log" | sed -E "s#$ROOT/##; s# \[[^]]*\.csproj\]##" | sort -u | head -40
  exit 1
fi
[[ $RUN_TESTS == 1 ]] || exit 0

if dotnet test FleetConsole.slnx --no-build -nologo -v q --logger "console;verbosity=minimal" "$@" > "$LOGS/be-test.log" 2>&1; then
  echo "TEST: ok"; grep -E '^(Passed|Failed)!' "$LOGS/be-test.log" | sed -E 's/ - [^ ]+\.dll.*//'
else
  echo "TEST: FAILED (full log: $LOGS/be-test.log)"
  grep -E '^(Passed|Failed)!' "$LOGS/be-test.log" | sed -E 's/ - [^ ]+\.dll.*//'
  # Failed test names + first lines of their messages; open the log with a ranged read for stack traces.
  grep -E -A3 '^\s+Failed [A-Za-z]' "$LOGS/be-test.log" | grep -vE '^\s*(--)?$|Stack Trace' | head -40
  grep -qiE 'docker|testcontainers|podman' "$LOGS/be-test.log" && grep -m3 -iE 'docker|podman' "$LOGS/be-test.log"
  exit 1
fi
