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
RENDERS=(overlays/dev overlays/prod overlays/production build)
# Overlays (base included): Route + PublicOrigin -> Route host replacement, HPA, and the access-cache Redis.
ROUTE_RENDERS=(overlays/dev overlays/prod overlays/production)
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

# Prints the scaling objects of consolinho in a rendered stream (ADR-0030 Amendment 2026-11-24), one line each:
#   HorizontalPodAutoscaler <apiVersion> <scaleTargetRef.kind> <scaleTargetRef.name> <minReplicas> <maxReplicas>
#   Deployment replicas=<0|1>        (1 = spec.replicas is set, which would fight the HPA)
#   PodDisruptionBudget
# Same normalised-output assumptions as containers_report; missing fields print as "-".
scaling_report() {
  awk '
    function flush() {
      if (name == "consolinho") {
        if (kind == "HorizontalPodAutoscaler") print kind, api, tkind, tname, mn, mx
        else if (kind == "Deployment") print kind, "replicas=" reps
        else if (kind == "PodDisruptionBudget") print kind
      }
      kind = ""; name = ""; api = "-"; tkind = "-"; tname = "-"; mn = "-"; mx = "-"; reps = 0; top = ""; sub1 = ""
    }
    BEGIN { flush() }
    /^---$/ { flush(); next }
    /^[a-zA-Z]/ { top = $1; if ($1 == "kind:") kind = $2; if ($1 == "apiVersion:") api = $2; next }
    top == "metadata:" && /^  name: / { name = $2 }
    top == "spec:" && /^  [a-zA-Z]/ { sub1 = $1 }
    top == "spec:" && /^  replicas: / { reps = 1 }
    top == "spec:" && /^  minReplicas: / { mn = $2 }
    top == "spec:" && /^  maxReplicas: / { mx = $2 }
    top == "spec:" && sub1 == "scaleTargetRef:" && /^    kind: / { tkind = $2 }
    top == "spec:" && sub1 == "scaleTargetRef:" && /^    name: / { tname = $2 }
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

# Prints the rendered object <kind> <name> (one YAML document, without the separator) of a rendered stream.
render_object() {
  awk -v want_kind="$2" -v want_name="$3" '
    function flush() { if (kind == want_kind && name == want_name) printf "%s", buf; buf = ""; kind = ""; name = ""; top = "" }
    /^---$/ { flush(); next }
    { buf = buf $0 "\n" }
    /^[a-zA-Z]/ { top = $1; if ($1 == "kind:") kind = $2 }
    top == "metadata:" && /^  name: / { name = $2 }
    END { flush() }
  ' "$1"
}

# Prints the list item of container <name> from `containers:` (not initContainers) of one rendered object on stdin.
# kustomize sorts keys, so `name:` is not the item's first line: items are buffered and printed once complete.
container_item() {
  awk -v want="$1" '
    function indent(s) { match(s, /^ */); return RLENGTH }
    function flush() { if (item ~ ("\n *-? *name: " want "\n")) printf "%s", item; item = "" }
    inlist && indent($0) == cind && substr($0, cind + 1, 2) == "- " { flush(); item = "\n" $0 "\n"; next }
    inlist && indent($0) <= cind { flush(); inlist = 0 }
    inlist { item = item $0 "\n"; next }
    /^ *containers:$/ { inlist = 1; cind = indent($0) }
    END { flush() }
  '
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
    if [[ $workload =~ ^Deployment/consolinho(-redis)?$ && $rofs != rofs=1 ]]; then
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

# ADR-0030 Amendment (2026-11-24): an autoscaling/v2 HPA (min >= 3) owns the replica count, the Deployment sets no
# spec.replicas (else every apply would fight the HPA), and a PDB bounds voluntary disruptions.
for r in "${ROUTE_RENDERS[@]}"; do
  out="$LOGS/render-${r//\//-}.yaml"; [[ -s $out ]] || continue
  scaling="$(scaling_report "$out")"; echo "$scaling" > "$out.scaling"
  hpas="$(grep -c '^HorizontalPodAutoscaler ' <<< "$scaling")"
  if [[ $hpas != 1 ]]; then
    fail "$r renders $hpas HorizontalPodAutoscaler consolinho (want exactly 1)"
  else
    read -r _ api tkind tname mn mx <<< "$(grep '^HorizontalPodAutoscaler ' <<< "$scaling")"
    hpa_ok=1
    [[ $api == autoscaling/v2 ]] || { fail "$r HPA consolinho apiVersion '$api' != autoscaling/v2"; hpa_ok=0; }
    if [[ $tkind != Deployment || $tname != consolinho ]]; then
      fail "$r HPA consolinho scaleTargetRef '$tkind/$tname' != Deployment/consolinho"; hpa_ok=0
    fi
    if ! [[ $mn =~ ^[0-9]+$ && $mn -ge 3 ]]; then fail "$r HPA consolinho minReplicas '$mn' < 3"; hpa_ok=0; fi
    if ! [[ $mx =~ ^[0-9]+$ && $mn =~ ^[0-9]+$ && $mx -ge $mn ]]; then
      fail "$r HPA consolinho maxReplicas '$mx' < minReplicas '$mn'"; hpa_ok=0
    fi
    [[ $hpa_ok == 1 ]] && echo "HPA: $r ok (min=$mn max=$mx)"
  fi
  grep -qx 'Deployment replicas=1' <<< "$scaling" && fail "$r Deployment consolinho sets spec.replicas (the HPA owns it)"
  grep -qx 'PodDisruptionBudget' <<< "$scaling" || fail "$r renders no PodDisruptionBudget consolinho"
done

# OPS-1 (ADR-0040 §9): every overlay ships the access-cache Redis — ephemeral (no PVC), reachable only through a
# NetworkPolicy selecting it, its image mapped by the overlay — and the server container gets ConnectionStrings__redis.
for r in "${ROUTE_RENDERS[@]}"; do
  out="$LOGS/render-${r//\//-}.yaml"; [[ -s $out ]] || continue
  redis="$(render_object "$out" Deployment consolinho-redis)"
  if [[ -z $redis ]]; then fail "$r renders no Deployment consolinho-redis"; continue; fi
  redis_ok=1
  if grep -qE '(volumeClaimTemplates|persistentVolumeClaim):' <<< "$redis"; then
    fail "$r consolinho-redis uses a PVC (Redis must stay ephemeral)"; redis_ok=0
  fi
  image="$(container_item redis <<< "$redis" | sed -n 's/^ *-\{0,1\} *image: //p' | head -1)"
  [[ $image == */* ]] || { fail "$r consolinho-redis image '$image' not mapped by an images: entry"; redis_ok=0; }
  # NetworkPolicy whose spec.podSelector (2-space key under spec) selects component=redis.
  if ! awk '/^---$/ { k = ""; t = ""; s = ""; next } /^kind: / { k = $2 } /^[a-zA-Z]/ { t = $1 }
            t == "spec:" && /^  [a-zA-Z]/ { s = $1 }
            k == "NetworkPolicy" && s == "podSelector:" && /^      app.kubernetes.io\/component: redis$/ { f = 1 }
            END { exit !f }' "$out"; then
    fail "$r renders no NetworkPolicy selecting component=redis"; redis_ok=0
  fi
  server="$(render_object "$out" Deployment consolinho | container_item server)"
  if ! grep -q 'name: ConnectionStrings__redis$' <<< "$server"; then
    fail "$r server container lacks ConnectionStrings__redis"; redis_ok=0
  fi
  [[ $redis_ok == 1 ]] && echo "REDIS: $r ok ($image)"
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
