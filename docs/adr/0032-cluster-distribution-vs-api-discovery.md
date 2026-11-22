# 0032 — Cluster distribution is presentation; capabilities come from API discovery
**Status:** Accepted (2026-11-23) · CP3.7 DIST-1..8 · implemented by T-0139 (domain/API), T-0142 (detection); FE side ADR-0033 / FE tasks

## Context
FleetConsole will manage plain Kubernetes clusters next to OpenShift (CP5.5). The UI needs to know "what kind of
cluster is this" for the switcher tag (`OCP`/`K8s`), the Kubernetes masthead theme and admin screens. Two sources exist:
an admin-declared type stored on the cluster, and what the API server actually serves (discovery). They can disagree:
a cluster registered as OpenShift may hide `project.openshift.io` from a namespaced SA, a "Kubernetes" cluster may be
a MicroShift/OKD install that serves OpenShift groups, and admins make typos.

## Decision
1. **`Cluster.Distribution` (`OpenShift` | `Kubernetes`) is declared by the admin** and stored on the aggregate (enum,
   text column, required; existing rows migrate to `OpenShift`). It is **presentation only**: the switcher tag, the
   theme, admin copy. It is a cluster setting, not a connection setting: changing it is audited (`changedFields`
   contains `distribution`) but does not move `ConnectionSettingsChangedAt` (tests stay fresh).
2. **Capabilities always come from discovery.** Registry descriptors declare the group/version they need; nav items and
   pages hide or show "not served" from the cluster's discovery, never from the declared distribution. Nothing on a
   per-cluster screen branches on `distribution` except styling (tag, theme).
3. **Detection, never correction.** The connection test reads `GET /apis` and detects *OpenShift* when the group
   `config.openshift.io` is served, otherwise *Kubernetes*. The result carries `detectedDistribution`; a mismatch with
   the declaration is a **warning** step (`distribution`), never a failure, and never rewrites the declaration (spec Q3).
   Discovery not readable → warning, `detectedDistribution = null`.
4. `config.openshift.io` is the marker because every OpenShift 4 cluster serves it (ClusterVersion, Infrastructure),
   it is cluster-level (not a namespaced add-on like `route.openshift.io` on some distributions), and `GET /apis` is
   readable by every authenticated subject (`system:discovery`).
5. A cluster declared Kubernetes that doesn't serve OpenShift APIs skips the ClusterVersion step ("Not an OpenShift
   cluster") instead of warning; every other combination keeps today's ClusterVersion behaviour.

## Consequences
- One enum value per distribution; adding one (e.g. a future managed-Kubernetes flavour) is an enum member + a
  migration-free change (text column) + FE tag/theme, no capability code.
- Admins can register a cluster wrongly and the console still works (discovery decides features); the test tells them.
- No auto-detection at registration: registration doesn't need a token, and the declaration must stay the admin's.

## Alternatives rejected
- **Derive the type from discovery only** (no stored field): needs a live call before the switcher can render, and a
  namespaced SA's restricted discovery would flip the cluster's look per user.
- **Branch features on the declared type**: breaks for MicroShift/OKD and for SAs that can't see some groups.
