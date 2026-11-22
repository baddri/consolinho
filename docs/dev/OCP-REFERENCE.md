# OCP reference console (for UI parity)

The real OpenShift console, built from the local clone `/home/bad/works/openshift-console`, running at
`http://127.0.0.1:9000` against the current `oc` login. It is the visual ground truth for UX.md §0. Treat it as read-only:
it runs with the logged-in user's token (often cluster-admin), so only browse and screenshot it. Never use its actions.

## One-time build (repeat only after `git pull` of the clone)
```bash
cd /home/bad/works/openshift-console
./build-backend.sh                                  # Go (vendored), ~1 min → bin/bridge
# Frontend needs Node >= 24.22.1 (host has 22), so build it in a container. Mount the WHOLE repo: codegen reads ../LICENSE.
podman run --rm --userns=keep-id -v "$PWD":/repo:Z -w /repo/frontend -e HOME=/tmp docker.io/library/node:24 \
  bash -c 'node .yarn/releases/yarn-4.18.0.cjs install --immutable && node .yarn/releases/yarn-4.18.0.cjs run build'
```

## Run and screenshot
```bash
scripts/ocp-ref/run-console.sh            # foreground; needs `oc login`; binds 127.0.0.1 only (auth is disabled)
node scripts/ocp-ref/shot.mjs /k8s/ns/openshift-console/pods pods <scratchpad> [1920]
```
- The UI is the clone's `main` (perspective "Core platform", "Ecosystem" nav), which may be newer than the cluster's
  installed console. We mirror the clone. The launcher sets `BRIDGE_BRANDING=ocp` (felt theme, the look we mirror; Red Hat logo). Override with `OCP_BRANDING=okd`. Never copy logos.
- The bearer token expires with the `oc` login. Restart the console after `oc login`.
- Stop it with `kill <pid>` (find the pid with `ss -ltnp | grep 9000`). `pkill -f bin/bridge` also kills the calling shell.

## Measure instead of eyeballing: the style probe (T-0138)
```bash
node scripts/ui-probe.mjs <ours-route> <ocp-route|-> --pair '<ourSel>=<ocpSel>' [--pair ...] \
     [--props font-size,gap,...] [--width 1280] [--theme light|dark|both] [--shot <scratchpad dir>] [--user admin|alice]
node scripts/ui-probe.mjs --stop     # stop the mock server the probe started
# e.g. node scripts/ui-probe.mjs /c/dev-1/k8s/ns/shop/pods/web-7d4b9c8f6d-2xkqp /k8s/ns/consolinho/pods/<pod> --pair 'h1=h1'
```
- Prints only mismatches, `<ourSel> | <prop>: ours=<v> ocp=<v>`, then `N mismatches / M checked`. It also reports `box`
  (WxH) and `gap-to-prev` (px to the previous sibling). Width and box depend on content, so compare them only on the same data.
- Our side is the mock UI on fixed port 5199. The probe starts it once, detached, and later runs reuse it. Don't start
  or kill dev servers by hand. If :9000 is down, it prints a hint and probes our side only (`-` as the OCP route does the same).
- It only navigates and reads, never clicks. `--shot` writes PNGs clipped to the probed elements. Open them only for
  what the numbers can't settle (CLAUDE.md "Screenshots").
