#!/usr/bin/env bash
# Deploy-manifest gate (QG-4, K8S-1, ADR-0030) with token-frugal output: renders the kustomize overlays offline,
# asserts the ADR-0030 invariants on the rendered YAML, validates it with kubeconform and shellchecks the CP3 scripts.
# Never talks to a cluster. Full renders/logs go to <git-dir>/checks/<run>/; only a summary + failures are printed.
# Tools: a kustomize renderer (oc | kubectl | kustomize | podman image), kubeconform and shellcheck (binary or podman
# image). The podman fallbacks need network access on first use (image pull; kubeconform also fetches schemas).
# Usage: scripts/check-deploy.sh
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/.." && pwd))"; cd "$ROOT" || exit 1
# Logs live in the checkout's git dir: per-worktree, never tracked. One sub-directory per run; keep the newest 20.
LOGS="$(git rev-parse --path-format=absolute --git-path checks 2>/dev/null || echo "$ROOT/.checks")"
LOGS="$LOGS/$(date +%Y%m%d-%H%M%S)-$$"; mkdir -p "$LOGS"
# shellcheck disable=SC2012  # run dirs are our own timestamp-pid names
ls -1dt "$(dirname "$LOGS")"/*/ 2>/dev/null | tail -n +21 | xargs -r rm -rf

KUSTOMIZE_DIR=deploy/kustomize
RENDERS=(overlays/dev overlays/production build)
# Overlays that contain the Route and therefore the PublicOrigin -> Route host replacement.
ROUTE_RENDERS=(overlays/dev overlays/production)
KUSTOMIZE_IMAGE=registry.k8s.io/kustomize/kustomize:v5.6.0
KUBECONFORM_IMAGE=ghcr.io/yannh/kubeconform:v0.7.0
SHELLCHECK_IMAGE=docker.io/koalaman/shellcheck:stable
# OpenShift 4.20 ships Kubernetes 1.33.
K8S_VERSION=1.33.0
# CP3 scripts only; the older check scripts predate the shellcheck gate.
SHELL_SCRIPTS=(scripts/check-deploy.sh scripts/check-image.sh scripts/deploy-dev.sh)

FAILED=0
fail() { echo "FAIL: $*"; FAILED=1; }

# --- renderer --------------------------------------------------------------------------------------------------
if command -v oc >/dev/null 2>&1; then RENDERER=oc
elif command -v kubectl >/dev/null 2>&1; then RENDERER=kubectl
elif command -v kustomize >/dev/null 2>&1; then RENDERER=kustomize
elif command -v podman >/dev/null 2>&1; then RENDERER=podman
else echo "RENDER: FAILED (no oc, kubectl, kustomize or podman found)"; exit 1
fi

# Renders one kustomization (path relative to deploy/kustomize) to stdout. Client-side only: no cluster access.
render() {
  case "$RENDERER" in
    oc) oc kustomize "$KUSTOMIZE_DIR/$1" ;;
    kubectl) kubectl kustomize "$KUSTOMIZE_DIR/$1" ;;
    kustomize) kustomize build "$KUSTOMIZE_DIR/$1" ;;
    # label=disable: read the bind mount without relabelling the working tree for SELinux.
    podman) podman run --rm --security-opt label=disable -v "$ROOT/$KUSTOMIZE_DIR:/work:ro" \
              "$KUSTOMIZE_IMAGE" build "/work/$1" ;;
  esac
}

# Prints one line per container of every workload in a rendered stream:
#   <kind>/<name> <container> req=<0|1> limmem=<0|1> rofs=<0|1>
# Relies on kustomize's normalised output (2-space indent, sequence dashes at the parent key's indent, no comments),
# which is what makes plain awk sufficient here (no yq/jq dependency).
containers_report() {
  awk '
    function indent(s) { match(s, /^ */); return RLENGTH }
    function flush() {
      if (cname != "") printf "%s/%s %s req=%d limmem=%d rofs=%d\n", kind, name, cname, req, limmem, rofs
      cname = ""; req = 0; limmem = 0; rofs = 0; sub0 = ""; sub1 = ""
    }
    /^---$/ { flush(); inlist = 0; kind = ""; name = ""; top = ""; next }
    /^[a-zA-Z]/ { flush(); inlist = 0; top = $1; if ($1 == "kind:") kind = $2; next }
    top == "metadata:" && /^  name: / { name = $2 }
    {
      ind = indent($0)
      if (inlist) {
        if (ind == cind && substr($0, ind + 1, 2) == "- ") { flush(); cname = "?"; line = substr($0, ind + 3); d = 0 }
        else if (ind <= cind) { flush(); inlist = 0 }
        else { line = substr($0, ind + 1); d = ind - cind - 2 }
      }
      if (inlist) {
        split(line, kv, ": *"); key = kv[1]; sub(/:$/, "", key); val = kv[2]
        if (d == 0) { sub0 = key; sub1 = ""; if (key == "name") cname = val }
        else if (d == 2) { sub1 = key; if (sub0 == "resources" && key == "requests") req = 1
                           if (sub0 == "securityContext" && key == "readOnlyRootFilesystem" && val == "true") rofs = 1 }
        else if (d == 4 && sub0 == "resources" && sub1 == "limits" && key == "memory") limmem = 1
        next
      }
      if ($0 ~ /^ *(containers|initContainers):$/) { inlist = 1; cind = ind }
    }
    END { flush() }
  ' "$1"
}

# Value of a data key of the rendered ConfigMap consolinho-config (generated name carries a hash suffix).
config_value() {
  awk -v want="$2" '
    /^---$/ { kind = ""; name = ""; data = ""; top = ""; next }
    /^[a-zA-Z]/ { top = $1; if ($1 == "kind:") kind = $2 }
    top == "metadata:" && /^  name: / { name = $2 }
    top == "data:" && $1 == want ":" { data = $2 }
    data != "" && kind == "ConfigMap" && name ~ /^consolinho-config/ { print data; exit }
  ' "$1" | tr -d '"'"'"
}

# spec.host of the rendered Route consolinho.
route_host() {
  awk '
    /^---$/ { kind = ""; name = ""; host = ""; top = ""; next }
    /^[a-zA-Z]/ { top = $1; if ($1 == "kind:") kind = $2 }
    top == "metadata:" && /^  name: / { name = $2 }
    top == "spec:" && /^  host: / { host = $2 }
    host != "" && kind == "Route" && name == "consolinho" { print host; exit }
  ' "$1"
}

# --- render + assertions ---------------------------------------------------------------------------------------
for r in "${RENDERS[@]}"; do
  out="$LOGS/render-${r//\//-}.yaml"
  if ! render "$r" > "$out" 2> "$out.err"; then
    fail "render $r ($RENDERER) — see $out.err"; head -5 "$out.err"; continue
  fi
  echo "RENDER: $r ok ($(grep -c '^kind: ' "$out") objects, $RENDERER)"

  # CFG-5: Secrets are created out of band; a rendered Secret means a value got committed.
  grep -q '^kind: Secret$' "$out" && fail "$r renders a kind: Secret (CFG-5)"

  # K8S-4/K8S-5: every container sized; the consolinho containers run with a read-only root filesystem.
  report="$(containers_report "$out")"; echo "$report" > "$out.containers"
  # Guard against the parser silently matching nothing (e.g. if the renderer's output format changes).
  if grep -qE '^kind: (Deployment|StatefulSet)$' "$out" && [[ -z $report ]]; then
    fail "$r has workloads but no containers were parsed"
  fi
  while read -r workload cname req limmem rofs; do
    [[ -n $workload ]] || continue
    [[ $req == req=1 ]] || fail "$r $workload/$cname has no resources.requests"
    [[ $limmem == limmem=1 ]] || fail "$r $workload/$cname has no resources.limits.memory"
    if [[ $workload == Deployment/consolinho && $rofs != rofs=1 ]]; then
      fail "$r $workload/$cname lacks readOnlyRootFilesystem: true"
    fi
  done <<< "$report"
done

# ADR-0030: the Route host is replaced from Console__PublicOrigin, so OAuth redirect URI and Route can't drift.
for r in "${ROUTE_RENDERS[@]}"; do
  out="$LOGS/render-${r//\//-}.yaml"; [[ -s $out ]] || continue
  origin="$(config_value "$out" Console__PublicOrigin)"; host="$(route_host "$out")"
  want="$(sed -E 's#^[a-zA-Z]+://([^/]+).*#\1#' <<< "$origin")"
  if [[ -z $host || $host != "$want" ]]; then
    fail "$r Route host '$host' != PublicOrigin host '$want'"
  fi
done

# --- kubeconform -----------------------------------------------------------------------------------------------
# Route/BuildConfig/ImageStream are OpenShift kinds with no schema in the upstream Kubernetes catalogue.
KC_ARGS=(-strict -summary -kubernetes-version "$K8S_VERSION" -skip "Route,BuildConfig,ImageStream")
kubeconform_run() {
  if command -v kubeconform >/dev/null 2>&1; then kubeconform "${KC_ARGS[@]}" -
  else podman run --rm -i "$KUBECONFORM_IMAGE" "${KC_ARGS[@]}" -
  fi
}
for r in "${RENDERS[@]}"; do
  out="$LOGS/render-${r//\//-}.yaml"; [[ -s $out ]] || continue
  if kubeconform_run < "$out" > "$out.kubeconform" 2>&1; then
    echo "KUBECONFORM: $r ok — $(grep -m1 '^Summary' "$out.kubeconform" | sed 's/.*stdin - //')"
  else
    fail "kubeconform $r (full: $out.kubeconform)"; grep -v '^Summary' "$out.kubeconform" | head -10
  fi
done

# --- shellcheck ------------------------------------------------------------------------------------------------
shellcheck_run() {
  # Fed via stdin so the podman fallback needs no bind mount.
  if command -v shellcheck >/dev/null 2>&1; then shellcheck --shell=bash -
  else podman run --rm -i "$SHELLCHECK_IMAGE" --shell=bash -
  fi
}
for s in "${SHELL_SCRIPTS[@]}"; do
  [[ -f $s ]] || continue
  if shellcheck_run < "$s" > "$LOGS/shellcheck-${s##*/}.log" 2>&1; then
    echo "SHELLCHECK: $s ok"
  else
    fail "shellcheck $s (full: $LOGS/shellcheck-${s##*/}.log)"; head -20 "$LOGS/shellcheck-${s##*/}.log"
  fi
done

if [[ $FAILED == 0 ]]; then echo "DEPLOY CHECK: ok (logs: $LOGS)"; else echo "DEPLOY CHECK: FAILED (logs: $LOGS)"; exit 1; fi
