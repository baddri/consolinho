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
