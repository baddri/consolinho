#!/usr/bin/env bash
# Image gate (QG-3, IMG-1..4, ADR-0026) with token-frugal output: builds deploy/Containerfile with podman and runs the
# image the way OpenShift restricted-v2 will (random UID in group 0, read-only root filesystem, only /tmp writable):
# image content, migrate mode, the web host (SPA, probes, headers) and the fail-fast exit codes (T-0099: startup
# configuration errors, migration failure). Never pushes; never uses docker. Prints one line per step plus failures;
# full logs go to <git-dir>/checks/<run>/.
# Tools: podman, openssl, curl. Needs network on first use (base images, npm, NuGet, postgres image).
# Usage: scripts/check-image.sh [--no-build]   (--no-build reuses an existing localhost/consolinho:check)
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/.." && pwd))"; cd "$ROOT"
# Logs live in the checkout's git dir: per-worktree, never tracked. One sub-directory per run; keep the newest 20.
LOGS="$(git rev-parse --path-format=absolute --git-path checks 2>/dev/null || echo "$ROOT/.checks")"
LOGS="$LOGS/$(date +%Y%m%d-%H%M%S)-$$"; mkdir -p "$LOGS"
# shellcheck disable=SC2012  # run dirs are our own timestamp-pid names
ls -1dt "$(dirname "$LOGS")"/*/ 2>/dev/null | tail -n +21 | xargs -r rm -rf

BUILD=1; [[ "${1:-}" == "--no-build" ]] && BUILD=0
for tool in podman openssl curl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "IMAGE CHECK: FAILED ($tool not found)"; exit 1; }
done

IMAGE=localhost/consolinho:check
POSTGRES_IMAGE=docker.io/library/postgres:18.3   # same image as tests/.../PostgresFixture.cs
RUN_ID="consolinho-check-$$"
NET="$RUN_ID"; DB="$RUN_ID-db"; WEB="$RUN_ID-web"
# OpenShift assigns an arbitrary UID from the namespace range, always with group 0.
RUN_UID=$(( (RANDOM * 32768 + RANDOM) % 900000 + 100000 ))
# Rootless podman only has ~65k sub-UIDs, so a UID this high needs an explicit map: container UID $RUN_UID → one
# sub-UID, container root → the invoking user (owner of the mounted secret files), all GIDs as usual. The image's own
# files (owned by 1001) then show up as an unmapped owner, so access works only through group 0 — as on OpenShift.
RUN_OPTS=(--uidmap 0:0:1 --uidmap "$RUN_UID:1:1" --gidmap 0:0:65536 --user "$RUN_UID:0" --read-only --tmpfs /tmp)

# Obviously fake secrets, random per run so step 8 can search the logs for them.
DB_PASSWORD="fake-db-pw-$(openssl rand -hex 8)"
PFX_PASSWORD="fake-pfx-pw-$(openssl rand -hex 8)"
CLIENT_SECRET="fake-client-secret-$(openssl rand -hex 8)"

umask 077
SECRETS="$(mktemp -d)"
cleanup() {
  podman rm -f -t 0 "$WEB" "$WEB-nodp" "$WEB-nodp-noorigin" "$RUN_ID-migrate-bad" "$DB" >/dev/null 2>&1 || true
  podman network rm -f "$NET" >/dev/null 2>&1 || true
  rm -rf "$SECRETS"
}
trap cleanup EXIT

FAILED=0
fail() { echo "FAIL: $*"; FAILED=1; }
# Aborts the run: later steps depend on this one.
die() { echo "IMAGE CHECK: FAILED — $* (logs: $LOGS)"; exit 1; }
step_result() { if [[ $FAILED == "$1" ]]; then echo "STEP $2: ok"; else echo "STEP $2: FAILED"; fi; }

# --- 1. build ---------------------------------------------------------------------------------------------------
if [[ $BUILD == 1 ]]; then
  if ! podman build -f deploy/Containerfile --build-arg REVISION="$(git rev-parse HEAD 2>/dev/null || echo unknown)" \
       -t "$IMAGE" . > "$LOGS/build.log" 2>&1; then
    grep -E 'error|Error' "$LOGS/build.log" | tail -15
    die "1 build (full log: $LOGS/build.log)"
  fi
fi
podman image exists "$IMAGE" || die "1 build: $IMAGE does not exist"
SIZE="$(podman image inspect "$IMAGE" --format '{{.Size}}')"
echo "STEP 1 build: ok ($IMAGE, $(( SIZE / 1024 / 1024 )) MiB$([[ $BUILD == 0 ]] && echo ', reused'))"

# --- 2. image content (IMG-2/IMG-3) -----------------------------------------------------------------------------
# shellcheck disable=SC2016  # the script runs inside the container
CONTENT_SCRIPT='
  bad=0
  found=$(find / -xdev \( -name "FleetConsole.DevOAuth*" -o -name "FleetConsole.AppHost*" -o -name "*.Tests.dll" \
          -o -name "*.csproj" \) 2>/dev/null)
  [ -z "$found" ] || { echo "dev/build artefacts in image: $found"; bad=1; }
  local_secrets=$(find /opt/app-root -xdev \( -name ".env*" -o -name "*.kubeconfig" -o -name kubeconfig \
          -o -name "appsettings.*.local.json" \) 2>/dev/null)
  [ -z "$local_secrets" ] || { echo "local secret files in image: $local_secrets"; bad=1; }
  for b in node npm; do command -v "$b" >/dev/null 2>&1 && { echo "$b present: $(command -v "$b")"; bad=1; }; done
  sdks=$(dotnet --list-sdks 2>&1)
  [ -z "$sdks" ] || { echo "dotnet SDK present: $sdks"; bad=1; }
  [ -f /opt/app-root/app/wwwroot/index.html ] || { echo "wwwroot/index.html missing"; bad=1; }
  [ -r /opt/app-root/app/FleetConsole.Api.dll ] || { echo "FleetConsole.Api.dll not readable by the random UID"; bad=1; }
  exit $bad'
before=$FAILED
if ! podman run --rm "${RUN_OPTS[@]}" --entrypoint sh "$IMAGE" -c "$CONTENT_SCRIPT" > "$LOGS/content.log" 2>&1; then
  fail "image content:"; head -10 "$LOGS/content.log"
fi
# Context filter probe: a throwaway context with the repo's .containerignore and planted fake secret files in
# sub-directories (bare patterns would only match at the root); the probe build fails if any of them gets through.
PROBE="$SECRETS/context-probe"
mkdir -p "$PROBE/src/FleetConsole.Api" "$PROBE/web"
cp .containerignore "$PROBE/"
touch "$PROBE/keep.txt" "$PROBE/src/FleetConsole.Api/appsettings.Fake.local.json" "$PROBE/web/.env.local" \
  "$PROBE/src/x.kubeconfig" "$PROBE/src/kubeconfig"
PROBE_BASE="$(awk '/^FROM .* AS runtime/ { print $2 }' deploy/Containerfile)"
printf '%s\n' "FROM $PROBE_BASE" "COPY . /ctx" \
  "RUN test -e /ctx/keep.txt && test -z \"\$(find /ctx -type f ! -name keep.txt ! -name .containerignore)\"" \
  > "$SECRETS/Containerfile.probe"
if probe_id="$(podman build -q --pull=never -f "$SECRETS/Containerfile.probe" "$PROBE" 2> "$LOGS/context-probe.log")"; then
  podman rmi -f "$probe_id" > /dev/null 2>&1 || true
else
  fail "context probe: .containerignore lets planted secret files into the build context (log: $LOGS/context-probe.log)"
fi
step_result "$before" "2 image content (uid $RUN_UID:0, read-only) + context filter probe"

# --- 3. database ------------------------------------------------------------------------------------------------
podman network create "$NET" > "$LOGS/db.log" 2>&1 || die "3 network create"
podman run -d --name "$DB" --network "$NET" -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB=consoledb \
  "$POSTGRES_IMAGE" >> "$LOGS/db.log" 2>&1 || die "3 postgres start"
# TCP, not the socket: the image's init phase runs a temporary socket-only server before the real one.
for _ in $(seq 60); do
  podman exec "$DB" pg_isready -q -h 127.0.0.1 -U postgres -d consoledb 2>/dev/null && break
  sleep 1
done
podman exec "$DB" pg_isready -q -h 127.0.0.1 -U postgres -d consoledb || die "3 postgres not ready within 60 s"
echo "STEP 3 database: ok ($POSTGRES_IMAGE)"
CONNECTION_STRING="Host=$DB;Database=consoledb;Username=postgres;Password=$DB_PASSWORD"

# --- 4. secrets: DP certificate (PFX + password file), fake CA bundle -------------------------------------------
{
  printf '%s' "$PFX_PASSWORD" > "$SECRETS/password"
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=consolinho-check-dp \
    -keyout "$SECRETS/dp.key" -out "$SECRETS/dp.crt"
  openssl pkcs12 -export -inkey "$SECRETS/dp.key" -in "$SECRETS/dp.crt" -out "$SECRETS/certificate.pfx" \
    -passout "file:$SECRETS/password"
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=consolinho-check-fake-ca \
    -keyout "$SECRETS/ca.key" -out "$SECRETS/ca-bundle.crt"
} > "$LOGS/secrets.log" 2>&1 || die "4 openssl"
# The directory stays 0700; the mounted files must be readable by the container's random UID (Secret defaultMode
# 0440 + group 0 in the cluster).
chmod 0444 "$SECRETS/password" "$SECRETS/certificate.pfx" "$SECRETS/ca-bundle.crt"
SECRET_MOUNTS=(
  -v "$SECRETS/certificate.pfx:/etc/consolinho/dp/certificate.pfx:ro,z"
  -v "$SECRETS/password:/etc/consolinho/dp/password:ro,z"
  -v "$SECRETS/ca-bundle.crt:/etc/consolinho/ca/ca-bundle.crt:ro,z"
)
# Env files keep the fake secrets off the process list; one per configuration variant.
printf '%s\n' "ASPNETCORE_ENVIRONMENT=Production" "ConnectionStrings__consoledb=$CONNECTION_STRING" > "$SECRETS/migrate.env"
printf '%s\n' "ASPNETCORE_ENVIRONMENT=Production" \
  "ConnectionStrings__consoledb=Host=db.invalid;Database=consoledb;Username=postgres;Password=$DB_PASSWORD" \
  > "$SECRETS/migrate-bad.env"
WEB_ENV_COMMON=(
  "ASPNETCORE_ENVIRONMENT=Production"
  "ConnectionStrings__consoledb=$CONNECTION_STRING"
  "Auth__OpenShift__HostApiServerUrl=https://kubernetes.invalid"
  "Auth__OpenShift__AuthorizationEndpoint=https://oauth.invalid/oauth/authorize"
  "Auth__OpenShift__TokenEndpoint=https://oauth.invalid/oauth/token"
  "Auth__OpenShift__ClientId=consolinho"
  "Auth__OpenShift__ClientSecret=$CLIENT_SECRET"
  "Auth__OpenShift__CaBundlePath=/etc/consolinho/ca/ca-bundle.crt"
  "DataProtection__KeyEncryptionCertificatePasswordPath=/etc/consolinho/dp/password"
)
ORIGIN="Console__PublicOrigin=https://consolinho.example.test"
DP_PATH="DataProtection__KeyEncryptionCertificatePath=/etc/consolinho/dp/certificate.pfx"
printf '%s\n' "${WEB_ENV_COMMON[@]}" "$ORIGIN" "$DP_PATH" > "$SECRETS/web.env"
printf '%s\n' "${WEB_ENV_COMMON[@]}" "$ORIGIN" > "$SECRETS/web-nodp.env"
printf '%s\n' "${WEB_ENV_COMMON[@]}" > "$SECRETS/web-nodp-noorigin.env"
echo "STEP 4 secrets: ok (self-signed DP PFX, fake CA, mounted read-only)"

# --- 5. migrate mode (ADR-0027 §1–2): only the connection string; idempotent -----------------------------------
before=$FAILED
for run in 1 2; do
  rc=0
  podman run --rm "${RUN_OPTS[@]}" --network "$NET" --env-file "$SECRETS/migrate.env" "$IMAGE" migrate \
    > "$LOGS/migrate-$run.log" 2>&1 || rc=$?
  [[ $rc == 0 ]] || { fail "migrate run $run exited $rc (log: $LOGS/migrate-$run.log)"; tail -5 "$LOGS/migrate-$run.log"; }
done
step_result "$before" "5 migrate twice: exit 0, 0"

# --- 6. web host ------------------------------------------------------------------------------------------------
before=$FAILED
podman run -d --name "$WEB" "${RUN_OPTS[@]}" --network "$NET" --env-file "$SECRETS/web.env" "${SECRET_MOUNTS[@]}" \
  -p 127.0.0.1::8080 "$IMAGE" > /dev/null 2> "$LOGS/web-start.log" || die "6 web host start (see $LOGS/web-start.log)"
BASE="http://$(podman port "$WEB" 8080 | head -1)"
alive=0
for _ in $(seq 60); do
  if curl -fsS -o /dev/null "$BASE/alive" 2>/dev/null; then alive=1; break; fi
  [[ "$(podman inspect -f '{{.State.Running}}' "$WEB" 2>/dev/null)" == true ]] || break
  sleep 1
done
if [[ $alive == 0 ]]; then
  podman logs "$WEB" > "$LOGS/web.log" 2>&1 || true
  tail -15 "$LOGS/web.log"; die "6 web host not alive within 60 s (log: $LOGS/web.log)"
fi

# fetch <path> → sets STATUS, CTYPE; body in $LOGS/body, headers in $LOGS/headers.
fetch() {
  local out
  out="$(curl -sS -D "$LOGS/headers" -o "$LOGS/body" -w '%{http_code} %{content_type}' "$BASE$1")" || out="000 -"
  STATUS="${out%% *}"; CTYPE="${out#* }"
}
header() { grep -i "^$1:" "$LOGS/headers" | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

for path in / /c/x/k8s/ns/a/pods/b; do
  fetch "$path"
  if [[ $STATUS != 200 ]] || ! grep -q '<div id="root">' "$LOGS/body"; then
    fail "GET $path: $STATUS, expected 200 with <div id=\"root\">"
  fi
  [[ -n "$(header Content-Security-Policy)" ]] || fail "GET $path: no Content-Security-Policy header"
done
for path in / /index.html; do
  fetch "$path"
  [[ "$(header Cache-Control)" == no-cache ]] || fail "GET $path: Cache-Control '$(header Cache-Control)', expected no-cache"
done
fetch /api/nope
[[ $STATUS == 404 && $CTYPE == application/problem+json* ]] || fail "GET /api/nope: $STATUS $CTYPE, expected 404 application/problem+json"
for path in /alive /health; do
  fetch "$path"
  [[ $STATUS == 200 && "$(cat "$LOGS/body")" == Healthy ]] || fail "GET $path: $STATUS '$(head -c 80 "$LOGS/body")', expected 200 Healthy"
done
podman stop -t 10 "$WEB" > /dev/null 2>&1 || true
podman logs "$WEB" > "$LOGS/web.log" 2>&1 || true
step_result "$before" "6 web host: SPA + deep link, /api 404 problem+json, probes, no-cache, CSP"

# --- 7. startup configuration errors (ADR-0028 §6): exit 1 + one clean line per key ------------------------------
# run_expect_exit1 <name> <env file> <log> [<image args>…] — runs in the foreground (≤ timeout) and checks exit 1.
run_expect_exit1() {
  local name=$1 env=$2 log=$3 limit=$4 rc=0; shift 4
  timeout "$limit" podman run --name "$name" --rm "${RUN_OPTS[@]}" --network "$NET" --env-file "$env" \
    "${SECRET_MOUNTS[@]}" "$IMAGE" "$@" > "$log" 2>&1 || rc=$?
  [[ $rc == 1 ]] || { fail "$name exited $rc, expected 1 (log: $log)"; tail -5 "$log"; }
}
# expect_lines <log> <count> <fixed text>
expect_lines() {
  local n; n="$(grep -cF "$3" "$1" || true)"
  [[ $n == "$2" ]] || fail "$(basename "$1"): $n line(s) with '$3', expected $2"
}
# A crash prints "Unhandled exception." plus stack frames (plain text, or "\n   at …" inside the JSON console logs of
# Production). expect_no_stack <log> [<fixed text>]: checks the whole log, or only the lines containing <fixed text>.
STACK_FRAME='(^|\\n)[[:space:]]+at [A-Za-z_]'
expect_no_stack() {
  if grep -q 'Unhandled exception' "$1"; then fail "$(basename "$1"): unhandled exception (crash)"; fi
  if grep -F "${2:-}" "$1" | grep -qE "$STACK_FRAME"; then
    fail "$(basename "$1"): stack trace in ${2:+the \"$2\" line of }the log"
  fi
}
before=$FAILED
run_expect_exit1 "$WEB-nodp" "$SECRETS/web-nodp.env" "$LOGS/web-nodp.log" 30
expect_lines "$LOGS/web-nodp.log" 1 "Startup configuration error: DataProtection:KeyEncryptionCertificatePath"
expect_no_stack "$LOGS/web-nodp.log"
# Two invalid options types at once arrive as an AggregateException: still one clean line per key.
run_expect_exit1 "$WEB-nodp-noorigin" "$SECRETS/web-nodp-noorigin.env" "$LOGS/web-nodp-noorigin.log" 30
expect_lines "$LOGS/web-nodp-noorigin.log" 1 "Startup configuration error: DataProtection:KeyEncryptionCertificatePath"
expect_lines "$LOGS/web-nodp-noorigin.log" 1 "Startup configuration error: Console:PublicOrigin"
expect_no_stack "$LOGS/web-nodp-noorigin.log"
step_result "$before" "7 startup config errors: exit 1, one line per key (1 and 2 failures)"

# --- 7b. migrate against an unreachable database (ADR-0027 §1): exit 1 + one line -------------------------------
before=$FAILED
rc=0
timeout 120 podman run --name "$RUN_ID-migrate-bad" --rm "${RUN_OPTS[@]}" --env-file "$SECRETS/migrate-bad.env" \
  "$IMAGE" migrate > "$LOGS/migrate-bad.log" 2>&1 || rc=$?
[[ $rc == 1 ]] || { fail "migrate (unreachable db) exited $rc, expected 1"; tail -5 "$LOGS/migrate-bad.log"; }
expect_lines "$LOGS/migrate-bad.log" 1 "Database migration failed:"
# EF Core's own retry lines (Information) carry the exception; the mode's single Critical line must not.
expect_no_stack "$LOGS/migrate-bad.log" "Database migration failed:"
step_result "$before" "7b migrate, unreachable db: exit 1, one line"

# --- 8. no secret in any log of steps 5–7 -----------------------------------------------------------------------
before=$FAILED
for secret in "$CLIENT_SECRET" "$DB_PASSWORD" "$PFX_PASSWORD"; do
  leaked="$(grep -lF "$secret" "$LOGS"/migrate-*.log "$LOGS"/web*.log 2>/dev/null || true)"
  [[ -z $leaked ]] || fail "a fake secret (${secret%-*}-…) appears in: $(basename -a "$leaked" | tr '\n' ' ')"
done
step_result "$before" "8 no secrets in logs"

if [[ $FAILED == 0 ]]; then echo "IMAGE CHECK: ok (logs: $LOGS)"; else echo "IMAGE CHECK: FAILED (logs: $LOGS)"; exit 1; fi
