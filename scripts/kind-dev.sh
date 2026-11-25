#!/usr/bin/env bash
# Local vanilla Kubernetes cluster (kind on rootless podman) for developing and smoke-testing FleetConsole's
# Kubernetes support (CP5.5 KIND-1..4, T-0377). A separate script rather than an AppHost resource: the node costs
# ~1.5 GB RAM, so it only runs when you ask for it — `down` frees the memory again.
#
# What it does: `up` creates the single-node cluster fleetconsole-dev from deploy/kind/cluster.yaml (node image pinned
# by digest), waits for the node, applies the seed in deploy/kind/seed/ (namespaces team-a/team-b/fleet-system,
# workloads, the ServiceAccounts fleet-viewer and team-a-editor) and waits for the rollouts. Re-running `up` changes
# nothing. `tokens` prints what you need to register the cluster in FleetConsole, to stdout only; it writes no file.
#
# Safety: there is no host kubectl involved. Every kubectl call runs inside the kind control-plane container with
# the node's own admin kubeconfig, so this script cannot touch a real cluster (CLAUDE.md rule 6) and never reads
# ~/.kube/config or the current `oc` context. kind itself would merge a context into ~/.kube/config and make it the
# current one on create; it is pointed at a throwaway kubeconfig instead, so your `oc` login is never switched.
#
# Dependencies: kind (v0.33.0), rootless podman.
#
# Usage: scripts/kind-dev.sh up|down|status|tokens
#   up       create (if missing) and seed the cluster, then print the `tokens` hint
#   down     delete the cluster (no-op if absent)
#   status   cluster present, node Ready, API URL, pods in team-a; exits non-zero when the cluster is absent
#   tokens   API URL, CA PEM and fresh tokens for fleet-viewer and team-a-editor
#            (lifetime: KIND_TOKEN_DURATION, default 24h)
#   The API server listens on https://127.0.0.1:${KIND_API_PORT:-16443}; the port is fixed at create time.
#   -h, --help  show this help
set -euo pipefail

CLUSTER=fleetconsole-dev
NODE="${CLUSTER}-control-plane"
SA_NAMESPACE=fleet-system
SAS=(fleet-viewer team-a-editor)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER_CONFIG="$REPO_ROOT/deploy/kind/cluster.yaml"
SEED_DIR="$REPO_ROOT/deploy/kind/seed"
# Host port of the API server; the default must match `apiServerPort` in deploy/kind/cluster.yaml.
DEFAULT_API_PORT=16443
API_PORT="${KIND_API_PORT:-$DEFAULT_API_PORT}"

# kind talks to podman instead of docker.
export KIND_EXPERIMENTAL_PROVIDER=podman

usage() { sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'; }

ok() { printf '✓ %s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

# Throwaway kubeconfig for kind's create/delete (see header): never touch ~/.kube/config or the current context.
# Created only for real commands, not for --help or usage errors.
KIND_KUBECONFIG=""
use_throwaway_kubeconfig() {
  KIND_KUBECONFIG="$(mktemp)"
  trap 'rm -f "$KIND_KUBECONFIG"' EXIT
  export KUBECONFIG="$KIND_KUBECONFIG"
}

require() {
  command -v kind >/dev/null 2>&1 || die "kind not found on PATH (install v0.33.0, see README 'Local Kubernetes cluster (kind)')"
  command -v podman >/dev/null 2>&1 || die "podman not found on PATH"
}

# kubectl inside the control-plane node, using the node's admin kubeconfig (never the host's).
kc() { podman exec -i "$NODE" kubectl --kubeconfig /etc/kubernetes/admin.conf "$@"; }

# True when kind lists the cluster. A failing `kind get clusters` (e.g. podman socket/storage errors) is fatal with
# kind's own message, so it is never mistaken for "not present".
cluster_exists() {
  local out
  out="$(kind get clusters 2>&1)" || die "kind get clusters failed: $out"
  grep -qx "$CLUSTER" <<<"$out"
}

# kind still lists a cluster whose node container is stopped (e.g. after a host reboot).
node_running() { [[ "$(podman container inspect -f '{{.State.Running}}' "$NODE" 2>/dev/null)" == true ]]; }

# For read-only commands: the cluster must exist and its node must be running.
require_running() {
  cluster_exists || die "cluster $CLUSTER not present (run: scripts/kind-dev.sh up)"
  node_running || die "cluster $CLUSTER exists but its node container is stopped (e.g. after a reboot); run: scripts/kind-dev.sh up"
}

# After `podman start` the API server needs a moment; poll /readyz instead of failing the first kubectl call.
wait_for_api() {
  local i
  for ((i = 0; i < 60; i++)); do
    kc get --raw /readyz >/dev/null 2>&1 && return 0
    sleep 2
  done
  die "API server of $CLUSTER did not become ready within 120s (see: podman logs $NODE)"
}

# https://127.0.0.1:<port> — the host port podman mapped to the API server's 6443.
api_url() {
  local mapping
  mapping="$(podman port "$NODE" 6443/tcp | head -n1)"
  [[ -n $mapping ]] || die "no host port mapped for 6443/tcp on $NODE"
  printf 'https://127.0.0.1:%s\n' "${mapping##*:}"
}

# True when something on this host already accepts connections on 127.0.0.1:<port>.
port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# Creates the cluster from cluster.yaml with apiServerPort set to $API_PORT (rendered into a temp copy).
create_cluster() {
  [[ $API_PORT =~ ^[0-9]+$ && $API_PORT -ge 1024 && $API_PORT -le 65535 ]] \
    || die "KIND_API_PORT must be a port number between 1024 and 65535 (got: $API_PORT)"
  if port_in_use "$API_PORT"; then
    die "port $API_PORT on 127.0.0.1 is already in use; free it or pick another, e.g. KIND_API_PORT=16444 scripts/kind-dev.sh up"
  fi
  grep -qx "  apiServerPort: $DEFAULT_API_PORT" "$CLUSTER_CONFIG" \
    || die "$CLUSTER_CONFIG lacks the line '  apiServerPort: $DEFAULT_API_PORT' that this script rewrites"
  local config
  config="$(mktemp)"
  sed "s/^  apiServerPort: $DEFAULT_API_PORT\$/  apiServerPort: $API_PORT/" "$CLUSTER_CONFIG" >"$config"
  info "creating cluster $CLUSTER (single node, ~1.5 GB RAM, API port $API_PORT)…"
  kind create cluster --config "$config" --kubeconfig "$KIND_KUBECONFIG" --wait 0s || { rm -f "$config"; exit 1; }
  rm -f "$config"
}

cmd_up() {
  if cluster_exists; then
    ok "cluster $CLUSTER already exists (create skipped)"
    if ! node_running; then
      info "node container $NODE is stopped (e.g. after a reboot); starting it…"
      podman start "$NODE" >/dev/null
      wait_for_api
      ok "node container started"
    fi
  else
    create_cluster
    ok "cluster $CLUSTER created"
  fi
  kc wait --for=condition=Ready node --all --timeout=180s >/dev/null
  ok "node Ready"
  # One stream, files in name order (namespaces first); apply reports `unchanged` on re-runs.
  local f first=1
  for f in "$SEED_DIR"/*.yaml; do
    [[ $first -eq 1 ]] || printf -- '---\n'
    first=0
    cat "$f"
  done | kc apply -f -
  ok "seed applied"
  kc -n team-a rollout status deployment/web --timeout=300s >/dev/null
  kc -n team-a rollout status statefulset/db --timeout=300s >/dev/null
  kc -n team-b rollout status deployment/echo --timeout=300s >/dev/null
  ok "workloads rolled out"
  info "API: $(api_url)"
  info "next: scripts/kind-dev.sh tokens   (API URL, CA bundle and SA tokens to register the cluster)"
  info "free the RAM again with: scripts/kind-dev.sh down"
}

cmd_down() {
  if cluster_exists; then
    kind delete cluster --name "$CLUSTER" --kubeconfig "$KIND_KUBECONFIG"
    ok "cluster $CLUSTER deleted"
  else
    ok "cluster $CLUSTER not present (nothing to do)"
  fi
}

cmd_status() {
  require_running
  ok "cluster $CLUSTER present"
  local ready
  ready="$(kc get node "$NODE" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}')"
  if [[ $ready == True ]]; then ok "node Ready"; else printf '! node not Ready (%s)\n' "$ready"; fi
  info "API: $(api_url)"
  printf '\nPods in team-a:\n'
  kc -n team-a get pods
}

cmd_tokens() {
  require_running
  local duration="${KIND_TOKEN_DURATION:-24h}" sa
  printf '# API URL\n%s\n\n' "$(api_url)"
  printf '# CA bundle (PEM)\n'
  podman exec "$NODE" cat /etc/kubernetes/pki/ca.crt
  for sa in "${SAS[@]}"; do
    printf '\n# Token for %s/%s (expires in %s)\n' "$SA_NAMESPACE" "$sa" "$duration"
    kc -n "$SA_NAMESPACE" create token "$sa" --duration "$duration"
  done
}

[[ $# -eq 1 ]] || { usage >&2; exit 2; }
case "$1" in
  -h|--help) usage; exit 0 ;;
  up|down|status|tokens) require; use_throwaway_kubeconfig; "cmd_$1" ;;
  *) die "unknown command: $1 (see --help)" ;;
esac
