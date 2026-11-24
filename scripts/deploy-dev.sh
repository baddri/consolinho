#!/usr/bin/env bash
# One-command, idempotent dev deploy of consolinho (FleetConsole) to the cluster the current `oc` login points at
# (CP3 DEV-1..9, SMK-1, CFG-3/4; design in ADR-0030 § scripts/deploy-dev.sh and ADR-0026 §4).
#
# What it does (namespace fixed: consolinho):
#   preflight (logged in, may create OAuthClients, confirmation naming the API URL) -> derive the apps domain and
#   Route host -> project consolinho -> generated Secrets consolinho-oauth / -postgres / -db / -dp-cert (created only
#   if missing, reused on re-runs) -> ConfigMap consolinho-ca-bundle (namespace kube-root-ca.crt + ingress CA; copy
#   in ${XDG_CACHE_HOME:-~/.cache}/consolinho/ca-bundle.crt for the smoke test) -> BuildConfig/ImageStream + binary
#   build of the working tree (git ls-files -co --exclude-standard) -> generated overlay
#   deploy/kustomize/overlays/.dev-generated (gitignored) applied with the built digest -> OAuthClient consolinho (the
#   only cluster-scoped object) -> rollout wait -> summary with the SMK-1 smoke-test steps.
#   Every mutation is `oc apply` or create-if-missing, so re-runs only change the build, image and rollout (DEV-5).
#   Generated secret values live only in a mktemp -d (umask 077, removed on exit) and in the cluster; they are passed
#   with --from-file or stdin, never in argv, and never printed.
#
# Who may run it: humans; the orchestrator (or QA when delegated) with --yes against the current `oc` context only
# (DEV-1 exception, 2026-11-21). Engineer agents and CI never run it (CLAUDE.md rule 6). --teardown is human-only.
#
# Dependencies: oc, openssl, coreutils, git, tar.
#
# Usage: scripts/deploy-dev.sh [--yes] [--admin <user>]
#        scripts/deploy-dev.sh --teardown
#   --yes            skip the deploy confirmation prompt (not the teardown one)
#   --admin <user>   bootstrap admin username (default: the current `oc whoami` user)
#   --teardown       delete the OAuthClient and project consolinho (asks you to type the namespace)
#   -h, --help       show this help
set -euo pipefail
umask 077

NS=consolinho
APP=consolinho
# Repository of the in-cluster build output as referenced by the committed dev overlay; the generated overlay pins
# this image name to the built digest (kustomize matches `images:` on the already-transformed name).
DEV_IMAGE=image-registry.openshift-image-registry.svc:5000/consolinho/consolinho

usage() { sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'; }

# Checklist output: one line per completed step on stdout; errors on stderr with a non-zero exit.
ok() { printf '✓ %s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

ASSUME_YES=0
TEARDOWN=0
ADMIN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes) ASSUME_YES=1 ;;
    --teardown) TEARDOWN=1 ;;
    --admin)
      [[ $# -ge 2 && -n $2 ]] || die "--admin needs a username"
      ADMIN="$2"; shift ;;
    --admin=*) ADMIN="${1#--admin=}"; [[ -n $ADMIN ]] || die "--admin needs a username" ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
  shift
done

for tool in oc openssl git tar base64; do
  command -v "$tool" >/dev/null 2>&1 || die "missing dependency: $tool"
done

ROOT="$(cd "$(dirname "$0")/.." && git rev-parse --show-toplevel)" || die "not inside the FleetConsole git checkout"
cd "$ROOT"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- preflight (DEV-1) -----------------------------------------------------------------------------------------
USER_NAME="$(oc whoami 2>/dev/null)" || die "not logged in: run 'oc login' against the target cluster first"
API_URL="$(oc whoami --show-server)" || die "cannot read the API server URL from the current oc context"

# Asks a yes/no question on stdin; anything but y/yes (incl. EOF) aborts.
confirm() {
  local answer=""
  read -r -p "$1 [y/N] " answer || true
  [[ $answer =~ ^[Yy]([Ee][Ss])?$ ]] || die "aborted, nothing changed"
}

# True if the namespaced object exists (reads only; any error counts as missing and the create reports it).
exists() { oc get "$1" "$2" -n "$NS" -o name >/dev/null 2>&1; }

# Reads one data key of a Secret, decoded, into stdout. Callers capture it in a variable; never echo it.
secret_value() {
  oc get secret "$1" -n "$NS" -o "jsonpath={.data.${2//./\\.}}" | base64 -d
}

if [[ $TEARDOWN == 1 ]]; then
  [[ "$(oc auth can-i delete oauthclients.oauth.openshift.io 2>/dev/null || true)" == yes ]] ||
    die "user $USER_NAME may not delete OAuthClients on $API_URL"
  echo "Cluster API: $API_URL"
  echo "User:        $USER_NAME"
  echo "Namespace:   $NS (deleted with everything in it, incl. the database) + OAuthClient $APP"
  # --yes deliberately does not skip this: teardown is destructive and human-only (DEV-8).
  [[ -t 0 ]] || die "--teardown needs an interactive terminal (human-only, DEV-8)"
  answer=""
  read -r -p "Type the namespace name to tear down $NS on $API_URL: " answer || true
  [[ $answer == "$NS" ]] || die "aborted, nothing changed"
  oc delete oauthclient "$APP" --ignore-not-found >/dev/null
  ok "OAuthClient $APP deleted"
  oc delete project "$NS" --ignore-not-found --wait >/dev/null
  ok "Project $NS deleted (local CA bundle cache left in place)"
  exit 0
fi

[[ "$(oc auth can-i create oauthclients.oauth.openshift.io 2>/dev/null || true)" == yes ]] ||
  die "user $USER_NAME may not create OAuthClients on $API_URL (cluster-admin needed)"
ADMIN="${ADMIN:-$USER_NAME}"
# Keeps the value a plain YAML scalar in the generated overlay; OpenShift usernames in practice fit this set.
[[ $ADMIN =~ ^[A-Za-z0-9._@:-]+$ ]] || die "unsupported admin username: $ADMIN"

echo "Cluster API: $API_URL"
echo "User:        $USER_NAME"
echo "Namespace:   $NS"
echo "Admin:       $ADMIN"
[[ $ADMIN == kube:admin ]] &&
  warn "bootstrap admin is kube:admin: prefer an identity-provider user (kube:admin disappears once the cluster is configured)"
[[ $ASSUME_YES == 1 ]] || confirm "Deploy $APP to $API_URL?"

# --- derive (DEV-2) --------------------------------------------------------------------------------------------
APPS_DOMAIN="$(oc get ingresses.config/cluster -o 'jsonpath={.spec.domain}')"
[[ -n $APPS_DOMAIN ]] || die "cannot read the apps domain from ingresses.config/cluster"
HOST="$APP.$APPS_DOMAIN"
PUBLIC_ORIGIN="https://$HOST"
ok "Route host $HOST (apps domain $APPS_DOMAIN)"

# --- namespace (DEV-3) -----------------------------------------------------------------------------------------
if oc get project "$NS" -o name >/dev/null 2>&1; then
  ok "Namespace $NS ready (exists)"
else
  oc new-project "$NS" --skip-config-write >/dev/null
  ok "Namespace $NS ready (created)"
fi

# --- generated secrets, create only if missing (DEV-5) --------------------------------------------------------
# Values go to files in $TMP without a trailing newline and reach the cluster via --from-file only.
if exists secret consolinho-oauth; then
  ok "Secret consolinho-oauth reused"
else
  openssl rand -hex 32 | tr -d '\n' > "$TMP/client-secret"
  oc create secret generic consolinho-oauth -n "$NS" --from-file=client-secret="$TMP/client-secret" >/dev/null
  ok "Secret consolinho-oauth created"
fi

# consolinho-postgres (Postgres image env) and consolinho-db (app connection string) share one password; if only one
# of them exists, the other is rebuilt from it so they never diverge.
db_password=""
if exists secret consolinho-postgres; then
  db_password="$(secret_value consolinho-postgres database-password)"
elif exists secret consolinho-db; then
  db_password="$(secret_value consolinho-db connection-string | sed -n 's/.*Password=\([^;]*\).*/\1/p')"
fi
[[ -n $db_password ]] || db_password="$(openssl rand -hex 24)"
if exists secret consolinho-postgres; then
  ok "Secret consolinho-postgres reused"
else
  printf '%s' "$APP" > "$TMP/database-user"
  printf '%s' "$APP" > "$TMP/database-name"
  printf '%s' "$db_password" > "$TMP/database-password"
  oc create secret generic consolinho-postgres -n "$NS" --from-file=database-user="$TMP/database-user" \
    --from-file=database-password="$TMP/database-password" --from-file=database-name="$TMP/database-name" >/dev/null
  ok "Secret consolinho-postgres created"
fi
if exists secret consolinho-db; then
  ok "Secret consolinho-db reused"
else
  printf 'Host=postgres;Port=5432;Database=%s;Username=%s;Password=%s' "$APP" "$APP" "$db_password" \
    > "$TMP/connection-string"
  oc create secret generic consolinho-db -n "$NS" --from-file=connection-string="$TMP/connection-string" >/dev/null
  ok "Secret consolinho-db created"
fi
unset db_password

# Data Protection key-encryption certificate (ADR-0028): self-signed, 10 years; losing it makes stored SA tokens
# unreadable, which is why it is never regenerated once it exists.
if exists secret consolinho-dp-cert; then
  ok "Secret consolinho-dp-cert reused"
else
  openssl rand -hex 32 | tr -d '\n' > "$TMP/password"
  openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -subj /CN=consolinho-data-protection \
    -keyout "$TMP/dp-key.pem" -out "$TMP/dp-cert.pem" >/dev/null 2>&1 || die "openssl req failed"
  openssl pkcs12 -export -inkey "$TMP/dp-key.pem" -in "$TMP/dp-cert.pem" -passout "file:$TMP/password" \
    -out "$TMP/certificate.pfx" >/dev/null 2>&1 || die "openssl pkcs12 -export failed"
  oc create secret generic consolinho-dp-cert -n "$NS" --from-file=certificate.pfx="$TMP/certificate.pfx" \
    --from-file=password="$TMP/password" >/dev/null
  ok "Secret consolinho-dp-cert created"
fi

# --- CA bundle (CFG-4, Q6) -------------------------------------------------------------------------------------
# kube-root-ca.crt is published into a new namespace by a controller shortly after creation.
root_ca=""
for _ in $(seq 1 30); do
  root_ca="$(oc get configmap kube-root-ca.crt -n "$NS" -o 'jsonpath={.data.ca\.crt}' 2>/dev/null || true)"
  [[ -n $root_ca ]] && break
  sleep 1
done
[[ -n $root_ca ]] || die "ConfigMap kube-root-ca.crt did not appear in $NS within 30 s"
ingress_ca="$(oc get configmap default-ingress-cert -n openshift-config-managed -o 'jsonpath={.data.ca-bundle\.crt}')"
[[ -n $ingress_ca ]] || die "cannot read openshift-config-managed/default-ingress-cert ca-bundle.crt"
printf '%s\n%s\n' "$root_ca" "$ingress_ca" > "$TMP/ca-bundle.crt"
oc create configmap consolinho-ca-bundle -n "$NS" --from-file=ca-bundle.crt="$TMP/ca-bundle.crt" \
  --dry-run=client -o yaml | oc apply -f - >/dev/null
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/consolinho"
mkdir -p "$CACHE_DIR"
CA_FILE="$CACHE_DIR/ca-bundle.crt"
cp "$TMP/ca-bundle.crt" "$CA_FILE"
ok "ConfigMap consolinho-ca-bundle applied (local copy $CA_FILE)"

# --- build (DEV-3, ADR-0026 §4) --------------------------------------------------------------------------------
oc apply -k deploy/kustomize/build >/dev/null
ok "BuildConfig/ImageStream $APP applied"
# Working tree incl. uncommitted changes, minus ignored files; tracked-but-deleted paths are skipped.
git ls-files -z -co --exclude-standard |
  while IFS= read -r -d '' f; do if [[ -e $f ]]; then printf '%s\0' "$f"; fi; done > "$TMP/files"
tar -czf "$TMP/source.tar.gz" --null -T "$TMP/files"
BUILD_LOG="$CACHE_DIR/build.log"
info "building in the cluster (log: $BUILD_LOG)"
if ! oc start-build "$APP" -n "$NS" --from-archive="$TMP/source.tar.gz" --follow --wait > "$BUILD_LOG" 2>&1; then
  tail -n 20 "$BUILD_LOG" >&2
  die "build failed (full log: $BUILD_LOG; oc get builds -n $NS)"
fi
IMAGE_REF="$(oc get istag "$APP:latest" -n "$NS" -o 'jsonpath={.image.dockerImageReference}')"
[[ $IMAGE_REF == *@sha256:* ]] || die "unexpected image reference from istag $APP:latest: $IMAGE_REF"
ok "Image built $IMAGE_REF"

# --- generated overlay (ADR-0030) ------------------------------------------------------------------------------
VERSION="$(git rev-parse --short HEAD)"
[[ -z "$(git status --porcelain)" ]] || VERSION="$VERSION-dirty"
GEN_DIR=deploy/kustomize/overlays/.dev-generated
mkdir -p "$GEN_DIR"
# The replacements stanza is copied word for word from overlays/dev: it must sit in the outermost kustomization to
# see the merged Console__PublicOrigin (see the comment there).
cat > "$GEN_DIR/kustomization.yaml" <<EOF
# GENERATED by scripts/deploy-dev.sh on every run; do not edit (gitignored).
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../dev

labels:
  - pairs:
      app.kubernetes.io/version: "$VERSION"
    includeSelectors: false

images:
  - name: $DEV_IMAGE
    newName: ${IMAGE_REF%@*}
    digest: ${IMAGE_REF#*@}

configMapGenerator:
  - name: consolinho-config
    behavior: merge
    literals:
      - Console__PublicOrigin=$PUBLIC_ORIGIN
      - Auth__BootstrapAdminUsers__0=$ADMIN

replacements:
  - source:
      kind: ConfigMap
      name: consolinho-config
      fieldPath: data.Console__PublicOrigin
      options:
        delimiter: "/"
        index: 2
    targets:
      - select:
          kind: Route
          name: consolinho
        fieldPaths:
          - spec.host
        options:
          create: true
EOF
oc apply -k "$GEN_DIR" >/dev/null
ok "Overlay applied ($GEN_DIR, version $VERSION)"

# --- OAuthClient (DEV-4) ---------------------------------------------------------------------------------------
# Server-side apply: client-side apply would copy the secret into the last-applied-configuration annotation.
client_secret="$(secret_value consolinho-oauth client-secret)"
[[ -n $client_secret ]] || die "Secret consolinho-oauth has no client-secret"
oc apply --server-side --force-conflicts --field-manager=consolinho-deploy-dev -f - >/dev/null <<EOF
apiVersion: oauth.openshift.io/v1
kind: OAuthClient
metadata:
  name: $APP
  labels:
    app.kubernetes.io/name: consolinho
    app.kubernetes.io/part-of: consolinho
secret: "$client_secret"
grantMethod: auto
redirectURIs:
  - $PUBLIC_ORIGIN/api/auth/callback
scopeRestrictions:
  - literals:
      - user:info
EOF
unset client_secret
ok "OAuthClient $APP applied (redirect $PUBLIC_ORIGIN/api/auth/callback)"

# --- rollout (DEV-6) -------------------------------------------------------------------------------------------
if ! oc rollout status "deployment/$APP" -n "$NS" --timeout=300s >/dev/null; then
  echo "Hints:" >&2
  echo "  oc logs deploy/$APP -n $NS -c migrate" >&2
  echo "  oc describe pod -n $NS -l app.kubernetes.io/component=server" >&2
  die "deployment/$APP did not become ready within 300 s"
fi
ok "Deployment $APP rolled out"

# --- summary (DEV-7, SMK-1) ------------------------------------------------------------------------------------
ROUTE_HOST="$(oc get route "$APP" -n "$NS" -o 'jsonpath={.spec.host}' 2>/dev/null || true)"
# The HPA (ADR-0030 Amendment 2026-11-24) owns the replica count; current/desired may lag the rollout briefly.
HPA_REPLICAS="$(oc get hpa "$APP" -n "$NS" \
  -o 'jsonpath={.status.currentReplicas}/{.status.desiredReplicas} current/desired (min {.spec.minReplicas}, max {.spec.maxReplicas})' \
  2>/dev/null || true)"
cat <<EOF

Console:         https://${ROUTE_HOST:-$HOST}
Replicas (HPA):  ${HPA_REPLICAS:-unknown}
Bootstrap admin: $ADMIN

Smoke test (SMK-1) — register this cluster as a managed cluster:
  1. Create a token for the smoke ServiceAccount (paste it in step 3; it is not shown here):
       oc create token consolinho-smoke -n $NS --duration=168h
     If the API server rejects or caps the duration, run it without --duration (see docs/ops/RUNBOOK.md).
  2. Log in as $ADMIN, open Fleet administration › Clusters › Register:
       API URL:     $API_URL
       CA bundle:   $CA_FILE
       Environment: dev
  3. Add a credential with the token from step 1 and click Test.
  4. Grant $ADMIN ReadOnly on the cluster, switch to it and open Pods in project $NS.
EOF
