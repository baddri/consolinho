# CP1 — Identity & administration: product-owner acceptance

**Date:** 2026-11-20 · **Branch:** `cp/1-identity-admin` @ `ada71c4` · **Spec:** `CP1-identity-and-admin.md` ·
**Inputs:** `CP1-qa-report.md` (70 ACs: 66 pass, 0 fail, 4 needs-human), T-0043 demo work log, `web/src/features/admin/`
and `web/src/features/cluster-context/` components and tests (no screenshots, no browser).

**Checkpoint verdict: ACCEPTED WITH FOLLOW-UPS.** No acceptance criterion is unmet. Merge to `main` after the human runs
H1–H4 below. If any of them fails, file a bug task and hold the merge.

## Verdicts per user story

| Story | Verdict | Evidence / follow-up |
|---|---|---|
| US-1 OCP login | ACCEPTED | AUTH-1/3–9/14/15 pass. The live DevOAuth flow worked for admin, alice and bob. Login is a button, as Q2 allows. |
| US-2 Deep links survive login | ACCEPTED WITH FOLLOW-UPS | Server-side redirect checked with curl, plus 21 malicious-URL FE tests. Browser check is H1. Follow-up T-0054. |
| US-3 Pre-create users / self-registration | ACCEPTED | AUTH-5/6, USR-2. "Create and grant access" chains into the bulk wizard, which is good onboarding UX. |
| US-4 Deactivate takes effect within a minute | ACCEPTED | AUTH-11 `SessionRevalidationTests` (deactivate → 401 + cookie cleared). USR-4: the dialog names the user and their cluster count. Backlog: "Revoke all grants". |
| US-5 Register cluster (URL, CA, env) | ACCEPTED | CLU-1..8. CA bundle `FileUpload` with per-cert expiry. Skip-TLS needs confirmation on production. Delete requires typing the name (OCP muscle memory). The list handles 40+ clusters. |
| US-6 Write-only tokens, rotate, fingerprint, expiry | ACCEPTED | CRED-1..8, `TokenLeakSweepTests` with a hostile upstream. Rotate shows the fingerprint and affected users, and offers "Test new token" before "Save anyway". The empty state has an `oc create token` hint. |
| US-7 Test connection report | ACCEPTED | TEST-1..5: step list with icons, headline, capability grid, hints, namespace inspect, cancellable. T-0052 notes disabled clusters. |
| US-8 Bulk grant | ACCEPTED | GRANT-4: production rows are highlighted with a ReadWrite warning, per-item 400 marks the row, all-or-nothing. |
| US-9 Who can touch prod-eu-1 | ACCEPTED | CLU-8 cluster Access tab with text filter. Revoke names the user, the cluster and the environment. Fleet-wide matrix stays in backlog. |
| US-10 Expiry warnings | ACCEPTED | CRED-8: counts and filtered link on the Clusters and Credentials pages, warning vs danger. Notifications stay in backlog. |
| US-11 Auditor: filterable audit log + read-only admin | ACCEPTED | AUD-1..5. ADM-2: the matrix covers all 19 commands → 403 and all 9 queries → allowed. In the UI every mutating control is aria-disabled with a reason. |
| US-12 Switcher: only my clusters, env colour, mode | ACCEPTED WITH FOLLOW-UPS | SW-1/3/5/6 pass. SW-2 FE tests cover order and the env and Read only labels. Browser check is H3. Search and recents come in CP2 as planned. |
| US-13 Newcomer with no grants | ACCEPTED WITH FOLLOW-UPS | SW-4 FE tests cover the user, admin and read-only admin variants. Live: bob gets `[]`. Browser check is H4. |

## Decisions

- **D1 — Nav label (HANDOVER open question).** The shipped label "Admin" is **accepted for CP1**, so this is not an
  AC failure. ADM-3 is about visibility gating and the no-access page, and both pass. The label itself was a naming
  detail. It still has to change before CP2: once the cluster nav is real, an admin on a cluster sees the OCP-faithful
  cluster "Administration" section (Namespaces, later cluster settings) in the same sidebar. Two "Administration"
  headings would be ambiguous, and "Admin" reads like "cluster-admin". **Decision: the FleetConsole admin area is
  called "Fleet administration"** in the sidebar, on the no-access page, in the "Go to …" link and in dialog prose.
  The role label "Admin" and the `/admin/...` URLs stay as they are. The cluster section keeps its OCP name
  "Administration". This amends ADM-3's wording. Follow-up **T-0053** (checkpoint 2).
- **D2 — Needs-human items.** H1–H4 are confirmations, not open risks. Server-side and component evidence exists for
  each. The human runs them once before merging (see below). Automating them is **T-0054** (checkpoint 2, may move to
  CP3 but not later than the first deployment).
- **D3 — QA residual risks.** I accept R1 (framework 400 on bodies that fail binding; the UI is unaffected), R2
  (ADR-0009 concurrent cross-demotion; recovery is through config admins), R5 and R6 for CP1. R4 (extend the leak
  sweep and authz matrix to proxy routes) becomes a CP2 acceptance criterion when I write the CP2 spec. It is noted in
  the ROADMAP backlog.

## Manual checks for the human (before merge)

Run **H1–H4** exactly as written in `CP1-qa-report.md` § "Needs-human steps (browser)":
H1 = AUTH-2 deep link + open-redirect, H2 = AUTH-10 logout page without auto-redirect, H3 = SW-2 alice's switcher shows
"Development" + "Read only", H4 = SW-4 bob's "No clusters assigned yet" and the admin variant.
While on H3/H4 as `admin`, also look at the sidebar on a cluster page. It shows "Administration" (cluster) and
"Admin" (fleet). That is expected until T-0053.

## Follow-ups

| Item | Type | Where |
|---|---|---|
| T-0053 Rename admin area to "Fleet administration" | later (CP2) | `docs/tasks/T-0053-fe-fleet-administration-nav-label.md` |
| T-0054 Playwright smoke for H1–H4 | later (CP2/CP3) | `docs/tasks/T-0054-e2e-login-switcher-smoke.md` |
| Proxy leak/authz sweeps (QA R4) | CP2 spec AC | ROADMAP backlog |
| Copy access from user, revoke-all on offboarding, fleet-admin overview, "Test all credentials", credential last-used, audit ↔ object links, link-out to the cluster's OCP console | later | ROADMAP "Backlog / ideas" (tagged `CP1 ACCEPT`) |

No blocker bugs filed.
