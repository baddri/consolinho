# CP1 — Identity & administration (spec)

**Author:** ocp-product-owner · **Date:** 2026-11-18 · **Checkpoint:** CP1 · **Branch:** `cp/1-identity-admin`
**Binding inputs:** ROADMAP CP1, ADR-0007 (host-cluster OpenShift OAuth login), SECURITY.md, ADR-0004 (token encryption).

## 1. Problem and goal

Today every operator holds 40 kubeconfigs or hops between 40 OCP consoles, each with its own login, and there is no
single place that says *who can touch which cluster with which identity*. Before FleetConsole can proxy a single
Kubernetes call (CP2), it needs:

1. **Identity**: people log in with the same OpenShift identity they already use (host cluster OAuth). No new passwords.
2. **Administration**: a fleet admin registers the 40 clusters, stores one or more ServiceAccount tokens per cluster
   (encrypted, write-only), and grants users access to clusters through a credential with ReadOnly or ReadWrite mode.
3. **Confidence**: before handing a credential to 20 people, the admin can *test* it and see in plain words what the SA
   can do on that cluster; expiring tokens are visible before they break; every admin action is audited.
4. **First real switcher**: after login, the masthead cluster switcher shows exactly the clusters the user was granted
   (navigation only — cluster pages stay placeholders until CP2).

**Demo at the end of CP1:** `aspire run` → log in via the DevOAuth emulator as `admin` → register a cluster, add a
token, test the connection, grant `alice` ReadOnly → log in as `alice` → switcher shows that cluster with a "Read only"
badge → log in as `bob` → friendly "no clusters assigned" page → audit log shows all of it.

## 2. Personas

| Persona | Who | What they need from CP1 |
|---|---|---|
| **Fleet admin** (Priya) | Platform team, 2–4 people, owns FleetConsole | Register/maintain 40 clusters, manage SA tokens and rotations, onboard/offboard people fast, bulk-grant |
| **Operator** (Sam) | SRE/app-ops, day-2 on many clusters | Log in once with OCP identity, see *only* their clusters, know immediately which are prod and which are read-only |
| **Auditor** (Ines) | Security / compliance | Read-only look at who has access to what and the history of admin changes, without being able to change anything |
| **Newcomer** (Bob) | Just logged in, no grants yet | A clear message, not a broken page or a 403 storm |

## 3. User stories

- US-1 As an operator I want to log in with my OpenShift account so that I don't manage another password.
- US-2 As an operator I want deep links (`/c/prod-eu-1/...`) to survive the login redirect so that links from chat/tickets work.
- US-3 As a fleet admin I want to pre-create users and decide whether unknown people may self-register so that I control who gets in.
- US-4 As a fleet admin I want to deactivate a user and have it take effect within a minute so that offboarding is immediate even if their OCP account still exists.
- US-5 As a fleet admin I want to register a cluster with its API URL, CA bundle and environment tag so that FleetConsole connects to it securely and everyone sees which clusters are production.
- US-6 As a fleet admin I want to store SA tokens that nobody can read back, rotate them in place, and see fingerprint and expiry so that I can manage them safely.
- US-7 As a fleet admin I want to test a cluster+token and see a summarized capability report so that I know what users will be able to do before I grant them.
- US-8 As a fleet admin I want to grant a user access to many clusters in one action so that onboarding an SRE to 30 clusters is not 30 dialogs.
- US-9 As a fleet admin I want to see, on a cluster page, who has access and with which mode/credential so that I can answer "who can touch prod-eu-1?" in seconds.
- US-10 As a fleet admin I want warnings about credentials that expire soon or have expired so that users don't discover it at 3 a.m.
- US-11 As an auditor I want a filterable audit log of admin actions and a read-only admin view so that I can review access without risk.
- US-12 As an operator I want the cluster switcher to list only my clusters with environment colour and access mode so that I never act on the wrong cluster.
- US-13 As a newcomer with no grants I want a friendly explanation and who to ask so that I'm not confused.

## 4. Acceptance criteria

Conventions: "admin" = user with role Admin; "read-only admin" = Admin with the global read-only flag. All API errors
are RFC 9457 ProblemDetails with a human-readable `detail` the UI shows verbatim. All admin API endpoints live under
`/api/admin/*`. Exact routes/DTOs are the architects' call; the indicative surface is in §6.

### 4.1 Authentication & session (AUTH)

- **AUTH-1 Login flow.** Given an unauthenticated browser, when it opens any SPA route, then it is sent to `/login`,
  which shows a single "Log in with OpenShift" button; clicking it goes through the host cluster's OAuth authorize
  endpoint (auth code + PKCE, scope `user:info`), callback under `/api/auth/...`, `users/~` lookup, and ends on the
  originally requested route with a FleetConsole cookie session.
- **AUTH-2 Return URL safety.** The post-login return URL is preserved through the flow and must be a local path
  (starts with a single `/`); absolute URLs, `//host`, and backslash tricks fall back to `/`. Tested with at least 4
  malicious values.
- **AUTH-3 Token discarded.** The OCP access token is never persisted (DB, cookie, logs). Test asserts the cookie
  payload and DB contain no token, and the token value does not appear in captured logs.
- **AUTH-4 Cookie.** Session cookie is `HttpOnly`, `Secure` (except plain-http dev profile), `SameSite=Lax`, sliding
  expiration, default 8h (`Auth:SessionLifetime`).
- **AUTH-5 Auto-provisioning on.** Given `Auth:AutoProvision=true` and an OCP user unknown to FleetConsole, when they
  log in, then a User is created (role User, not read-only, no grants), last login and groups are recorded, and an
  audit entry `user.provisioned` (actor = the user, source = login) is written.
- **AUTH-6 Auto-provisioning off.** Given `Auth:AutoProvision=false` and an unknown OCP user, when they log in, then
  no session is created and `/login` shows "Your OpenShift account `<name>` is not registered in FleetConsole. Ask a
  FleetConsole administrator to add you." A pre-created user with that username logs in normally.
- **AUTH-7 Deactivated user.** A deactivated user's login is refused with "Your FleetConsole account is deactivated."
  (no session created). Audited as `auth.login_denied` with reason.
- **AUTH-8 Bootstrap admins.** A user whose username is in `Auth:BootstrapAdminUsers`, or who is a member of any group
  in `Auth:AdminGroups`, gets role Admin on login (persisted; audited `user.promoted` with actor `system (config)` when
  it changes). Such users are marked "Admin via configuration" in the admin UI (see USR-6). *(Superseded by CP3.5, T-0115: Role details read "Admin set in the deployment settings" / "Admin through group <g>".)*
- **AUTH-9 `GET /api/auth/me`.** Returns username, display name (OCP `fullName` if present), role, global read-only
  flag, groups (from the last login), and whether admin comes from configuration. Returns 401 when not authenticated.
  The SPA masthead user menu shows the display name/username, a role badge for admins, a "Read only" badge when
  globally read-only, and "Log out".
- **AUTH-10 Logout.** `POST /api/auth/logout` (requires CSRF header) clears the FleetConsole session and lands on
  `/login?loggedOut=1` showing "You have been logged out" and the login button — it must **not** auto-redirect back
  into OAuth (which would silently log the user in again). Logout of the host OCP OAuth session is out of scope
  (see Q3).
- **AUTH-11 Session revalidation.** Sessions are revalidated against the DB at least every 60 s
  (`Auth:RevalidationInterval`). Given a logged-in user, when an admin deactivates them, then their next API call
  after the interval returns 401 and the SPA shows the login page with "Your session ended". When an admin changes their
  role or read-only flag, the next call after the interval reflects the new value (no re-login required).
- **AUTH-12 Expired session in the SPA.** Any 401 from `/api` sends the SPA to `/login` with the current location as
  return URL; no infinite redirect loop (the login page itself does not require auth).
- **AUTH-13 CSRF.** Every non-GET/HEAD/OPTIONS request under `/api` without `X-Console-Request: 1` is rejected with 403
  ProblemDetails ("Missing CSRF header") before reaching the endpoint, including for anonymous endpoints. The shared
  SPA API client always sends it. Integration-tested for POST, PUT, PATCH, DELETE.
- **AUTH-14 Host OAuth unavailable.** If the host OAuth server/`users/~` is unreachable or returns an error, `/login`
  shows "OpenShift login is currently unavailable (host cluster OAuth server did not respond). Existing sessions are not
  affected." and the failure is logged with a correlation id (no tokens/codes in logs). OAuth `error=access_denied`
  (user cancelled) shows "Login was cancelled."
- **AUTH-15 Dev emulator.** `FleetConsole.DevOAuth` is wired into the AppHost and emulates `/.well-known/oauth-authorization-server`,
  `/oauth/authorize` (user picker page), `/oauth/token`, `/apis/user.openshift.io/v1/users/~`, with at least users
  `admin` (group `fleetconsole-admins`), `alice` (group `sre`), `bob` (no groups), and dev config making
  `fleetconsole-admins` an admin group. The Api's integration tests use the same emulator in-process. The emulator
  project is not referenced by the Api project (architecture test).

### 4.2 Authorization & admin shell (ADM)

- **ADM-1** `/api/admin/*` requires role Admin (endpoint policy and pipeline behavior); a non-admin gets 403, an
  anonymous caller 401. Integration-tested on one query and one command endpoint.
- **ADM-2 Read-only admin (auditor).** An Admin with the global read-only flag can call every admin **query** but every
  admin **command** returns 403 "Your account is read-only". In the UI all mutating buttons/kebab items are disabled with
  a tooltip saying the same.
- **ADM-3** The "Administration" nav section and admin pages are visible only to admins. A non-admin navigating to
  `/admin/...` sees a "You don't have access to Administration" page (not a blank screen or raw 403).
- **ADM-4 Optimistic concurrency.** Edits to users, clusters, credentials and grants carry a version; a stale edit gets
  409 "This <thing> was changed by someone else. Reload and try again." and the UI shows it as an inline danger alert
  without losing the form input.
- **ADM-5 Last-admin protection.** The last active, non-read-only Admin cannot be demoted, deactivated, or set
  read-only (409 with explanation). An admin cannot deactivate or demote themselves.

### 4.3 Users (USR)

- **USR-1 List.** `/admin/users` lists all users with: username, display name, role (Admin badge), status
  (Active / Deactivated / Pending = pre-created, never logged in), read-only flag, number of cluster grants, last login
  (relative time, absolute on hover), OCP groups (first 3 as labels + "+N"). Client-side text filter on
  username/display name/group, and filter chips for role, status, read-only. Sorted by username by default; sortable by
  last login.
- **USR-2 Pre-create.** Admin can create a user by OCP username (exact, case-sensitive, validated against OCP username
  rules, unique → 409 if exists) with optional role Admin and read-only flag. Status is Pending until first login.
  Optional "Grant cluster access now" step opens the bulk grant flow (GRANT-4) for the new user.
- **USR-3 Promote/demote.** Admin can change a user's role between Admin and User. Confirmation names the user.
- **USR-4 Deactivate/reactivate.** Deactivate requires confirmation: "Deactivate `alice`? She will be logged out within
  a minute and loses access to all N clusters. Her grants are kept and return if reactivated." Reactivate restores
  access with the existing grants.
- **USR-5 Global read-only.** Admin can toggle the global read-only flag. The detail page explains: "Read-only applies
  on every cluster regardless of grant mode (enforced by the proxy from CP2) and blocks admin changes for admins."
- **USR-6 Config-sourced admin.** For a user who is admin via `Auth:BootstrapAdminUsers`/`Auth:AdminGroups`, "Demote"
  is disabled with tooltip "Admin granted by configuration (group `fleetconsole-admins`). Change the configuration to
  remove." The admin-via-config state is computed at their last login.
- **USR-7 Detail page.** `/admin/users/:username` shows Details (role, status, read-only, created, last login, groups
  last seen, display name) and a **Cluster access** tab listing the user's grants (cluster with env label, access mode,
  credential name, credential expiry status, granted by/at) with add / change / revoke actions (GRANT-*), plus a
  "View audit entries" link to the audit log filtered to this user (as actor or target).
- **USR-8** Users are never hard-deleted in CP1 (audit references them); deactivation is the offboarding action.

### 4.4 Clusters (CLU)

- **CLU-1 Register.** Admin registers a cluster with: **name** (slug used in URLs; DNS-label rules, ≤ 40 chars,
  unique, immutable after creation), display name (optional, defaults to name), **API URL** (absolute `https://` URL,
  host + optional port, no path/query), **environment** (production / staging / development — see Q5), optional web
  console URL (`https://`, for a link-out), optional description, CA bundle (PEM), "Skip TLS verification" flag,
  enabled flag (default enabled). Validation errors appear inline on the field.
- **CLU-2 CA bundle.** The PEM must parse into ≥ 1 X.509 certificate, otherwise a field error. After save, the detail
  page shows each certificate's subject, issuer and expiry (warning label if expiring within 30 days or expired). The
  bundle is not secret and may be viewed/replaced; clearing it means "use system trust store".
- **CLU-3 Skip TLS flagged.** When Skip TLS verification is on: the form shows a warning alert, the clusters list and
  detail page show a "TLS not verified" warning label, and saving it on a production cluster requires an extra
  confirmation naming the cluster. Skip TLS and CA bundle are mutually exclusive (validation error if both).
- **CLU-4 Edit.** All fields except name are editable. Changing API URL, CA bundle or Skip TLS marks the last connection
  test result as stale ("Settings changed since last test").
- **CLU-5 Enable/disable.** Disable requires a confirmation naming the cluster and environment: "Disable `prod-eu-1`
  (production)? N users will no longer see it in the cluster switcher." Disabled clusters are excluded from
  `GET /api/clusters` and shown greyed with a "Disabled" label in the admin list. Grants and credentials are kept.
- **CLU-6 Delete.** Only a **disabled** cluster can be deleted; deletion removes its credentials and grants; the
  confirmation requires typing the cluster name and states counts ("3 credentials and 14 grants will be removed").
  Audited with the counts.
- **CLU-7 List.** `/admin/clusters` lists: name + display name, environment label (prod red / staging orange / dev
  green, same component as the switcher), API URL, status (Enabled/Disabled), TLS (CA bundle / system trust / "not
  verified" warning), credentials count with worst expiry status icon, users with access count, last test result +
  time. Text filter on name/display name/API URL and filter chips for environment and status. Must render 40+ clusters
  without pagination jank (client-side list is fine).
- **CLU-8 Detail page.** `/admin/clusters/:name` has tabs **Details** (all settings, CA certs summary, link to web
  console), **Credentials** (CRED-*), **Access** (all grants on this cluster: user, access mode, credential, granted
  by/at, user status; filter; add/change/revoke) and an Actions dropdown (Edit, Enable/Disable, Test connection, Delete).
  The page header shows the environment label next to the name.

### 4.5 Credentials (CRED)

- **CRED-1 Add.** On a cluster's Credentials tab, admin adds a credential with: name (unique per cluster, e.g.
  `fleet-view`), optional description, and the token (password-style masked textarea; trimmed; non-empty; no internal
  whitespace; ≤ 16 KiB). Each credential belongs to exactly one cluster.
- **CRED-2 Write-only.** No API response, log line, audit entry or error message ever contains the token. Integration
  test: after add and rotate, every admin GET response body for clusters/credentials/grants/audit is scanned for the
  token string and must not contain it. The token is encrypted at rest (ADR-0004) — test asserts the DB column does
  not contain the plaintext.
- **CRED-3 Metadata.** For each credential the API returns: name, description, fingerprint (first 8 hex of SHA-256,
  ADR-0004), token type (JWT / opaque), for JWTs: expiry from `exp` (or "No expiry" — typical for legacy secret-based
  SA tokens), issued-at from `iat`, and ServiceAccount identity from `sub`
  (`system:serviceaccount:<ns>:<name>` shown as "`<ns>/<name>`"); created by/at, last rotated by/at, last test
  result/time, number of grants using it. The JWT is decoded **without** signature validation, purely for display.
- **CRED-4 Expiry status.** Each credential has a status: OK, Expiring soon (exp within `Credentials:ExpiryWarningDays`,
  default 14), Expired, No expiry, Unknown (opaque token). Shown as PatternFly labels (warning/danger) with the date.
- **CRED-5 Rotate.** "Rotate token" replaces the token in place (same credential id, grants unchanged). The dialog names
  the cluster and how many users are affected, shows the current fingerprint, and offers **"Test new token"** before
  saving (runs TEST-1 with the unsaved token server-side; nothing stored). Saving a token whose test failed requires an
  explicit "Save anyway". Audit records old and new fingerprints.
- **CRED-6 Delete.** Deleting a credential that grants still use returns 409 listing the count; the UI shows the
  affected users and a hint to re-assign or revoke those grants first. Unused credentials delete after a confirmation
  naming credential and cluster.
- **CRED-7 Fleet credentials page.** `/admin/credentials` lists all credentials across clusters: cluster (with env
  label, link), name, SA identity, fingerprint, expiry status/date, grants count, last test. Default sort: soonest
  expiry first. Filter chips: expiry status, environment.
- **CRED-8 Expiry warnings.** When any credential is Expired or Expiring soon, the admin Clusters and Credentials pages
  show an inline alert "2 credentials expired, 3 expire within 14 days" linking to `/admin/credentials` filtered
  accordingly. The cluster list shows the worst status icon per cluster (CLU-7).

### 4.6 Grants (GRANT)

- **GRANT-1 Model.** A grant links one user, one cluster and one credential **of that cluster**, with access mode
  ReadOnly or ReadWrite. At most one grant per (user, cluster): a second create returns 409 "alice already has access to
  prod-eu-1 — change the existing grant instead". A credential from another cluster is rejected (400).
- **GRANT-2 Create (single).** From user detail (Cluster access tab) or cluster detail (Access tab): pick cluster or
  user (typeahead), credential (pre-selected when the cluster has exactly one), access mode (default **ReadOnly**).
  Granting ReadWrite on a production cluster shows an inline warning "This user will be able to change production
  cluster `prod-eu-1`."
- **GRANT-3 Change / revoke.** Admin can change access mode and/or credential of a grant, or revoke it. Revoke confirms
  naming user and cluster: "Revoke `alice`'s access to `prod-eu-1` (production)?"
- **GRANT-4 Bulk grant to one user.** From the user detail page, "Grant access to clusters" opens a modal/wizard: select
  N clusters (checkbox table with env label and filter; clusters where the user already has a grant are shown disabled
  with "already has access"), choose access mode for all, then a review table with a credential picker per cluster,
  pre-filled when the cluster has exactly one credential or one whose name matches the optional "Preferred credential
  name" field (e.g. `fleet-view`). Submit is blocked while any row lacks a credential. The operation is
  **all-or-nothing** and writes one audit entry per created grant. Production clusters in the review are highlighted;
  ReadWrite on any production cluster shows the warning from GRANT-2.
- **GRANT-5 Grants and state.** Grants on disabled clusters, deactivated users, or expired credentials are kept but
  visibly marked in the grant tables (e.g. "Cluster disabled", "Credential expired").
- **GRANT-6 Admin ≠ cluster access.** Role Admin does not imply access to any cluster; admins need grants like everyone.

### 4.7 Test connection (TEST)

- **TEST-1 Run.** From the cluster detail (Actions → Test connection, or per credential on the Credentials tab) an
  admin runs a test for (cluster, credential). Runs server-side with the cluster's TLS settings and the decrypted
  token; overall timeout 15 s; each step reports its own result. Available for disabled clusters too (validate before
  enabling).
- **TEST-2 Steps and results.** The result shows, in order:
  1. **Reachability & TLS** — `GET /version`: OK with Kubernetes `gitVersion`, or a categorized failure: DNS/connection
     refused/timeout, TLS failure ("certificate signed by unknown authority — add the cluster CA bundle" / hostname
     mismatch / expired cert).
  2. **Authentication** — 401 → "Token rejected by the cluster (expired, revoked, or for another cluster)".
  3. **Identity** — username the cluster sees (`SelfSubjectReview`, falling back to JWT `sub` when not supported).
  4. **OpenShift version** — `ClusterVersion version`: current version and whether an update is progressing; if
     forbidden, "Not visible with this credential" (not a failure).
  5. **Capability summary** — see TEST-3.
- **TEST-3 Capability summary.** Built from cluster-scoped `SelfSubjectAccessReview`s for a fixed, documented check
  set; displayed as a headline level plus a compact grid:
  - Headline: **Cluster admin** (`*` on `*`), **Cluster-wide edit**, **Cluster-wide view**, or **Limited** (no
    cluster-wide list on pods).
  - Read: list pods / deployments / events (all namespaces), get pod logs, list secrets, list nodes, list
    ClusterOperators, list namespaces/projects.
  - Write: patch deployments (scale/restart), delete pods, create `pods/exec`, update configmaps.
  - Optional "Inspect namespace" input runs a `SelfSubjectRulesReview` for that namespace and shows the returned rules
    in an expandable table (verbs, API groups, resources, names), including the `incomplete` flag.
  The check set lives in one place (configuration or a single class) so it can grow without UI changes.
- **TEST-4 Grant-mode hints.** The result adds hints when relevant: "N users have ReadWrite grants with this credential
  but it cannot modify workloads" (warning); "This credential is cluster-admin; ReadOnly grants rely on FleetConsole's
  read-only guard" (info).
- **TEST-5 Recording.** The outcome (success/failed step, headline level, timestamp) is stored on the credential as
  "last test" (CRED-3, CLU-7) and audited as `credential.tested`. Raw responses and the token are not stored.

### 4.8 Audit log (AUD)

- **AUD-1 Coverage.** Every successful admin command writes exactly one audit entry per affected object, atomically
  with the change (if the change rolls back, no entry): user provisioned/created/promoted/demoted/deactivated/
  reactivated/read-only changed; cluster registered/updated (list of changed field names, never the CA content)/
  enabled/disabled/deleted; credential added/rotated (old→new fingerprint)/deleted/tested; grant created/changed
  (old→new mode/credential)/revoked. Auth events: login, login denied (with reason), logout.
- **AUD-2 Entry shape.** Timestamp (UTC, shown in local time), actor (username or `system (config)`), action, target
  type + display name (kept even if target later deleted), cluster (when applicable), summary text, correlation id,
  details (structured JSON shown in an expandable row). Never contains tokens, auth codes, or cookie values.
- **AUD-3 Append-only.** No API exists to modify or delete audit entries.
- **AUD-4 Viewer.** `/admin/audit` shows newest first, server-side paginated (page size 50, "Load more"/pagination
  consistent while new entries arrive), with filters: actor, action category (Auth / Users / Clusters / Credentials /
  Grants), cluster, target, time range (presets: 1h, 24h, 7d, 30d, custom). Filters are reflected in the URL so a
  filtered view is linkable (used by USR-7 and cluster detail).
- **AUD-5** Read-only admins can view the audit log (ADM-2).

### 4.9 Cluster switcher & landing (SW)

- **SW-1 `GET /api/clusters`.** Returns, for the current user, enabled clusters with an active grant (user active):
  name, display name, environment, access mode, web console URL. No API URL, CA, or credential info. Admins get only
  their own granted clusters (GRANT-6). Sorted by environment (production first) then name — see Q6.
- **SW-2 Switcher.** The masthead switcher *(superseded by CP3.5, T-0111: sidebar switcher)* lists those clusters (replacing the placeholder list) with the environment
  label and a "Read only" label for ReadOnly grants (and for globally read-only users). Still navigation only.
  Loading → skeleton/spinner in the toggle; error → toggle shows "Clusters unavailable" with retry.
- **SW-3 Landing.** `/` redirects to the last used cluster (localStorage) if it is still in the list, otherwise the
  first one.
- **SW-4 No grants.** A user with zero clusters landing on `/` sees an EmptyState: title "No clusters assigned yet",
  body "You are logged in as `bob`, but no clusters have been assigned to you. Ask a FleetConsole administrator to grant
  you access." The switcher shows "No clusters" (disabled). Admins additionally see "Go to Administration" and "Grant
  yourself access" hint.
- **SW-5 Not granted / unknown.** Navigating to `/c/<name>/...` for a cluster not in the user's list shows "Cluster
  `<name>` is not available — it does not exist or you don't have access" with a link back to `/`. The message does not
  reveal whether the cluster exists.
- **SW-6 Live-ish.** The cluster list refetches on window focus and at most every 5 min, so new grants appear without
  logout.

### 4.10 Quality gates (QG)

- **QG-1** Backend: unit tests for aggregate invariants (one grant per user+cluster, credential belongs to cluster,
  last-admin protection, cluster name immutability) and integration tests for every admin endpoint's happy path + main
  failures (400 validation, 403, 404, 409) using Testcontainers and the DevOAuth emulator.
- **QG-2** Test connection is integration-tested against a fake API server (canned `/version`, 401, TLS-failure,
  SSAR responses), not a real cluster.
- **QG-3** Frontend: MSW-based tests for each admin page's loading/empty/error states, the bulk-grant flow, the
  read-only admin disabled state, the no-grants empty state, and 401 → login redirect.
- **QG-4** Admin API TS types are generated from OpenAPI (`npm run gen:api`); no hand-written duplicates.

## 5. UX notes per page

General: PatternFly 6, OCP-console look. Lists use `Toolbar` (SearchInput + filter chips/`ToolbarFilter`) above a
composable `Table` with kebab (`ActionsColumn`) per row; detail pages use `PageSection` header with name + env label +
Actions `Dropdown`, then `Tabs`. Every destructive or access-changing confirmation is a `Modal variant="small"` whose
title names the object **and** cluster, and shows the environment label; production-scoped destructive actions
(disable/delete cluster, ReadWrite grant on prod via bulk) use danger-styled buttons. Success → `AlertGroup` toast
("Granted alice read only on prod-eu-1"). Loading → `Skeleton` rows; API error → inline `Alert variant="danger"` with
the ProblemDetails `detail` and a Retry button; never a blank page. Relative times with absolute `Tooltip`.

| Page | Layout & components | Empty / error states |
|---|---|---|
| `/login` | Centered `LoginPage`-style card: product name, "Log in with OpenShift" primary button, optional message `Alert` (logged out / session ended / not registered / deactivated / cancelled / unavailable) | — |
| Masthead *(superseded by CP3.5, T-0111: masthead = hamburger, logo, theme menu, user menu; switcher at the top of the sidebar)* | Switcher `Select` with typeahead-ready structure (search comes in CP2); user `Dropdown` shows name, Admin/Read only badges, Log out | Switcher: "No clusters" disabled; "Clusters unavailable — retry" |
| `/` (no grants) | `EmptyState` with `CubesIcon`, text per SW-4 | — |
| `/admin/users` | Toolbar (search, Role, Status, Read-only chips), "Add user" primary; Table cols per USR-1; kebab: Promote/Demote, Set read-only, Deactivate/Reactivate, Grant access | EmptyState only theoretical (the admin exists); filter-no-match → "No users match" + Clear filters |
| `/admin/users/:username` | Header: username, display name, badges (Admin, Admin via config, Read only, Deactivated/Pending) *(superseded by CP3.5, T-0115: no "via config" badge; source shown in Role details; bulk wizard in Actions, "Grant access" in the Cluster access toolbar)*; Tabs Details / Cluster access; "Grant access to clusters" button opens bulk `Modal` (or `Wizard`: Select clusters → Mode → Review) | Cluster access empty: "No cluster access yet" + Grant button |
| `/admin/clusters` | Expiry `Alert` (CRED-8) on top; Toolbar (search, Environment, Status); "Register cluster" primary; Table cols per CLU-7; kebab: Edit, Test connection, Enable/Disable, Delete (only when disabled) | Empty: "No clusters registered" + Register cluster CTA, short explanation of what's needed (API URL, CA, SA token) |
| `/admin/clusters/new`, `/:name/edit` | Full-page `Form` with `FormSection`s: Identity (name, display name, environment), Connection (API URL, CA bundle `FileUpload`/textarea, Skip TLS `Switch` with warning `Alert`), Links (web console URL), Status (enabled). After create, land on the cluster's Credentials tab with an "Add a credential" prompt | Inline field errors; 409 name taken on the name field |
| `/admin/clusters/:name` | Tabs Details / Credentials / Access. Credentials tab: table (name, SA identity, fingerprint in monospace, expiry label, grants, last test) + "Add credential", kebab: Test, Rotate, Delete. Test result shown in a `Modal` or expandable panel: step list with status icons (`CheckCircle`/`ExclamationTriangle`/`ExclamationCircle`), headline level `Label`, capability grid (`DescriptionList` or compact table with check/cross), hints (TEST-4), optional namespace inspect | Credentials empty: "No credentials — users can't be granted access until you add a ServiceAccount token" + `oc create token <sa> -n <ns> --duration=...` hint in a `ClipboardCopy`. Access empty: "Nobody has access to this cluster" + Grant |
| Add/Rotate credential | `Modal`: name, description, token `TextArea` (masked style, autocomplete off, not echoed back after save); Rotate shows current fingerprint, affected user count, "Test new token" secondary button with inline result | Token validation errors inline |
| `/admin/credentials` | Table per CRED-7, sorted by expiry; Expiry + Environment filter chips | Empty: "No credentials yet" with link to Clusters |
| `/admin/audit` | Toolbar: actor typeahead, category, cluster, time range `Select` (+ `DatePicker`s for custom); Table with expandable rows (details JSON in `CodeBlock`); pagination | "No audit entries match these filters" + Clear filters |

Admin sidebar section order: Users, Clusters, Credentials, Audit log (unchanged). Grants have no section of their own —
they are managed from user and cluster pages (that is where admins think about them).

## 6. Indicative API surface (architects own the final contract)

```
GET  /api/auth/login?returnUrl=   GET /api/auth/callback   POST /api/auth/logout   GET /api/auth/me
GET  /api/clusters
GET|POST /api/admin/users              GET|PATCH /api/admin/users/{username}   (role, readOnly, active)
POST /api/admin/users/{username}/grants:bulk
GET|POST /api/admin/clusters           GET|PUT|DELETE /api/admin/clusters/{name}   POST .../enable|disable
GET|POST /api/admin/clusters/{name}/credentials   PUT .../{id}/token (rotate)   DELETE .../{id}
POST /api/admin/clusters/{name}/credentials/{id}/test     POST /api/admin/clusters/{name}/test-token (unsaved token)
GET  /api/admin/credentials            (fleet-wide)
GET|POST /api/admin/grants?userId=&cluster=   PATCH|DELETE /api/admin/grants/{id}
GET  /api/admin/audit?actor=&category=&cluster=&target=&from=&to=&cursor=
```

## 7. Out of scope (CP1)

- The Kubernetes proxy, MutationGuard enforcement, real cluster pages, switcher search/recent/favourites (CP2).
- Group-based grants (groups are only recorded and displayed), OIDC/other IdPs.
- Logging out of the host OCP OAuth session (Q3).
- Hard deletion of users; audit export (CSV), retention/purging, SIEM forwarding.
- FleetConsole creating ServiceAccounts/RBAC or minting tokens on managed clusters (TokenRequest auto-renewal).
- Continuous cluster health monitoring / fleet status page (CP5); test connection is on demand only.
- Email/Slack notifications about expiring credentials.
- Self-service access requests; time-bound (expiring) grants.
- Bulk operations other than "grant one user many clusters" (e.g. grant many users one cluster, bulk re-assign credential).
- Admin UI on mobile layouts beyond what PatternFly gives for free.

## 8. Open questions (with recommendation)

> **Resolved 2026-11-18 by the orchestrator: all recommendations Q1–Q11 accepted as written.** Q9 mechanism → backend-architect ADR (same-transaction write preferred).

| # | Question | Recommendation |
|---|---|---|
| Q1 | Default of `Auth:AutoProvision`? | **true**. A provisioned user without grants sees nothing; it saves admins pre-creating 100 accounts. Prod operators who want tight control set it false. |
| Q2 | `/login`: show a button or auto-redirect into OAuth like the OCP console? | **Button**, with auto-redirect only when arriving from a deep link (no message to show). Gives a stable place for error messages and avoids the logout→silent-login loop. Acceptable to ship button-only in CP1. |
| Q3 | Should logout also end the host OCP OAuth session? | **No for CP1.** Local logout + "logged out" page (AUTH-10). Backlog: optional `Auth:LogoutRedirectUrl`. |
| Q4 | Revalidation interval? | **60 s** default, configurable. Deactivation effective "within a minute" is what offboarding expects; one indexed DB read per user per minute is negligible. |
| Q5 | Environment values: fixed enum or free text? | **Fixed enum** production / staging / development (matches the current FE colours); add `test` only if an admin asks. Colour is a safety feature — free text can't be coloured reliably. |
| Q6 | Switcher ordering? | Production first, then staging, then development, alphabetical within. Recent clusters come in CP2. |
| Q7 | Is "test connection" required before a credential can be granted? | **No**, but the grant pickers show "Never tested"/"Last test failed" next to the credential. Hard gating would block emergency setups. |
| Q8 | Admin config-sourced role: re-evaluated only at login or also on revalidation? | **At login only** (groups are only known at login). Removal from `fleetconsole-admins` takes effect at the user's next login (the role is then set back to User unless an admin promoted them explicitly — track the source: config vs manual). Until then another admin can deactivate them if urgent. Document in the ops runbook. |
| Q9 | Should the audit write be in the same transaction (vs post-commit event/outbox)? | Product requirement is AUD-1 atomicity ("no change without its entry, no entry without its change"). Mechanism is the architects' ADR; same-transaction write satisfies it simplest. |
| Q10 | Do non-JWT (opaque, e.g. `sha256~` OAuth) tokens get accepted as credentials? | **Accept with a warning** "Not a ServiceAccount token; expiry unknown and it is tied to a person's account." Don't block — some teams use a bot user. |
| Q11 | Credential expiry warning threshold? | **14 days**, `Credentials:ExpiryWarningDays`. |

## 9. Proposed ROADMAP backlog additions (for the orchestrator to append)

- Fleet access matrix: users × clusters grid with mode, editable in place; bulk grant many users to one cluster; bulk
  re-assign grants from credential A to B (SA migration).
- Group-based grants using the OCP groups already recorded in CP1 (`sre` → ReadOnly on all production clusters).
- Time-bound / break-glass grants (ReadWrite on prod for 2h, auto-revert, audited).
- Scheduled credential checks (nightly test connection for all credentials) + expiry notifications (email/webhook).
- Token auto-renewal via TokenRequest using a minimal "token minter" SA per cluster.
- Audit export (CSV/JSON), retention policy, forwarding to SIEM/Splunk.
- Optional OCP OAuth logout redirect (`Auth:LogoutRedirectUrl`).
- Cluster labels (region, owner team, tier) for filtering in switcher and admin lists.
