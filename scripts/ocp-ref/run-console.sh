#!/usr/bin/env bash
# Runs the real OCP web console (local clone of openshift/console, built once with build-backend.sh + the frontend
# build) at http://127.0.0.1:9000 against the current `oc` login, auth disabled. REFERENCE ONLY for UI parity
# (UX.md §0): agents only browse and screenshot it. Never click create/edit/delete actions: it runs with your token.
# Branding defaults to `ocp`: non-OKD branding turns on `pf-v6-theme-felt`, the look we mirror (human, 2026-11-22).
# Bound to 127.0.0.1 on purpose: auth is disabled, so it must never be reachable from the network.
set -euo pipefail
OCP_SRC="${OCP_SRC:-/home/bad/works/openshift-console}"
[ -x "$OCP_SRC/bin/bridge" ] && [ -d "$OCP_SRC/frontend/public/dist" ] || { echo "not built: see docs/dev/OCP-REFERENCE.md"; exit 1; }
oc whoami >/dev/null 2>&1 || { echo "oc is logged out: run oc login first"; exit 1; }
TOKEN_FILE="${XDG_RUNTIME_DIR:-/tmp}/ocp-ref-token"
( umask 077; oc whoami --show-token > "$TOKEN_FILE" )
cm() { oc -n openshift-config-managed get configmap monitoring-shared-config -o jsonpath="{.data.$1}" 2>/dev/null || true; }
cd "$OCP_SRC"
export BRIDGE_USER_AUTH=disabled BRIDGE_K8S_MODE=off-cluster \
  BRIDGE_K8S_MODE_OFF_CLUSTER_ENDPOINT="$(oc whoami --show-server)" \
  BRIDGE_K8S_MODE_OFF_CLUSTER_SKIP_VERIFY_TLS=true \
  BRIDGE_K8S_MODE_OFF_CLUSTER_THANOS="$(cm thanosPublicURL)" \
  BRIDGE_K8S_MODE_OFF_CLUSTER_ALERTMANAGER="$(cm alertmanagerPublicURL)" \
  BRIDGE_K8S_AUTH_BEARER_TOKEN="$(cat "$TOKEN_FILE")" \
  BRIDGE_K8S_MODE_OFF_CLUSTER_SERVICE_ACCOUNT_BEARER_TOKEN_FILE="$TOKEN_FILE" \
  BRIDGE_USER_SETTINGS_LOCATION=localstorage \
  BRIDGE_LISTEN=http://127.0.0.1:9000 \
  BRIDGE_BRANDING="${OCP_BRANDING:-ocp}"
exec ./bin/bridge
