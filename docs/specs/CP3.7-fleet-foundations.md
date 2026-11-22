# CP3.7 — Fleet foundations (spec)

**Author:** ocp-product-owner · **Date:** 2026-11-23 · **Checkpoint:** CP3.7 · **Branch:** `cp/3.7-fleet-foundations`
**Binding inputs:** ROADMAP §CP3.7 (human directive 2026-11-23, the scope), UX.md §2 Shell and §12 Accessibility,
CLAUDE.md "UI north star" (mirror OCP; no Red Hat/OpenShift/Kubernetes logos or trademarks as artwork).
**OCP references** (paths relative to `openshift-console/frontend`): perspective switcher
`packages/console-app/src/components/nav/NavHeader.tsx` (full-width `MenuToggle`, icon, `Title h2 size="md"`,
`SelectOption` with icon per perspective); ACM perspective id `packages/console-app/src/consts.ts` (`ACM_PERSPECTIVE_ID`)
and `masthead-toolbar.tsx` L252 ("ACM link is being moved to the perspective switcher") — the precedent for a
fleet entry living in the switcher.

## 1. Problem and goal

CP4/CP5 pages will be built on the shell, so its fleet-level shape has to be settled first:

1. The switcher shows the technical cluster name; operators think in display names ("Prod EU West"), and the
   toggle wastes width on "Read only".
2. Every cluster is assumed to be OpenShift. Kubernetes clusters arrive in CP5.5; the model, the admin form and the
   UI must already know the **distribution**, while **what a cluster can do comes from API discovery**, never from the type.
3. Fleet administration is a section of the cluster sidebar, mixed with per-cluster pages. It gets its own
   **Fleet perspective** (`/fleet/...`) entered from the switcher, which CP5's fleet view will join.
4. Operators must see at a glance that they are on a Kubernetes cluster (masthead theme + text tag).
5. A token test inspects one namespace; namespaced SAs need several, and admins retype them every time.

**Demo at the end of CP3.7:** an admin registers `kind-dev` as Kubernetes. The switcher lists "Prod EU West" with
`prod-eu-1` under it and an `OCP` tag, and "Kind dev" with a `K8s` tag. Switching to `kind-dev` turns the masthead navy;
the content looks unchanged. The admin picks **Fleet management** in the switcher, lands on `/fleet/admin/users` with a
sidebar holding only Fleet administration, and an old bookmark `/admin/clusters/kind-dev` redirects there too. They test
a credential against `team-a, team-b, team-c`, see one result per namespace, close the dialog, reopen it and find the
three namespaces prefilled.

## 2. Personas

| Persona | Needs from CP3.7 |
|---|---|
| **Fleet SRE** (Sam, daily user, 40 clusters) | Find clusters by the name the team uses; never mistake a Kubernetes cluster for OpenShift or prod for dev |
| **Fleet admin** (Priya) | Admin pages in one place apart from cluster work; declare the cluster type; test namespaced SAs quickly |
| **Colour-blind operator** (the human; some users) | Every cue (type, environment, read-only, perspective) readable as text, not only colour |

## 3. User stories

- US-1 As an SRE I want the switcher to show display names first, with the cluster name under them, so that I find clusters by the names my team uses but still see the unique id.
- US-2 As an SRE I want a type tag (`OCP`/`K8s`) and a distinct masthead on Kubernetes clusters so that I know which kind of cluster I'm acting on.
- US-3 As an admin I want to declare a cluster's distribution so that the console presents it correctly, and I want a warning when it doesn't match what the cluster serves.
- US-4 As an admin I want Fleet administration in its own perspective so that admin work and cluster work don't share one sidebar.
- US-5 As an admin I want old `/admin/...` links to keep working so that bookmarks and audit links don't break.
- US-6 As an admin I want to test a token in several namespaces at once and have that list remembered so that checking a namespaced SA takes one click.

## 4. Acceptance criteria

Conventions: "switcher" = the sidebar header switcher (UX.md §2). "Tag" = the cluster-type text tag. Exact names of
types, endpoints, fields and migrations are the architects' call unless quoted here.

### 4.1 Switcher (SW)
- **SW-1** Given a cluster whose display name differs from its name, the switcher menu item shows the display name as main text and the cluster name as the item description. When they are equal, only the name is shown (no duplicate line).
- **SW-2** The toggle stays one line (UX.md §2, OCP parity): the display name as `Title h2 size="md"`, truncating with an ellipsis without pushing the tags out. The cluster name is not shown on the toggle; it is in the toggle's tooltip (when it differs from the display name), in its accessible name, and as the menu item description (SW-1).
- **SW-3** Every cluster item and the toggle show a cluster-type icon and a text tag: `OCP` for OpenShift, `K8s` for Kubernetes. The icons differ in **shape** (not only colour), are generic PatternFly icons (no product logos), and are `aria-hidden` because the tag text carries the meaning. On the toggle the type icon is in the `MenuToggle` `icon` slot (replacing today's `ClusterIcon`).
- **SW-4** "Read only" appears as a label on menu items only, not on the toggle. The toggle's accessible name keeps the read-only cue, e.g. "Cluster Prod EU West (prod-eu-1, OCP, prod, read only), switch cluster".
- **SW-5** Label order on a menu item: type tag, environment label, Read only. On the toggle: type tag, environment label.
- **SW-6** Search also matches the type tag text (`ocp`, `k8s`) and the distribution word (`openshift`, `kubernetes`), in addition to today's fields.
- **SW-7** Existing switcher behaviour (Recent / All clusters groups, keyboard and focus, switcher criteria of earlier specs) is unchanged; existing tests still pass or are updated only for the new text.

### 4.2 Distribution (DIST)
- **DIST-1** A cluster has a distribution, `OpenShift` or `Kubernetes`, enforced in the domain (no other values). A migration sets `OpenShift` for all existing clusters.
- **DIST-2** The Register cluster form has a required "Distribution" field (radio or select: "OpenShift", "Kubernetes"), preselected "OpenShift". The Edit form can change it. A change is audited like other cluster edits and does not mark credential tests stale (it is not a connection setting).
- **DIST-3** The admin Clusters list has a "Type" column showing the tag (`OCP`/`K8s`); the cluster details page shows "Distribution: OpenShift|Kubernetes".
- **DIST-4** The admin API (create, update, get, list) and the user-facing accessible-clusters API expose the distribution; the generated SPA types include it. Create without a distribution is a 400 field error (the form always sends it).
- **DIST-5** Distribution is presentation only. Every registry descriptor declares the API group/version it needs (as today); a nav item, list page or details page for a kind the cluster doesn't serve is hidden or shows the existing "not served" state — regardless of the declared distribution. Given a cluster declared OpenShift that doesn't serve `project.openshift.io`, the UI uses Namespaces; given a cluster declared Kubernetes that does serve it, it uses Projects. Tests cover both mismatches.
- **DIST-6** No per-cluster screen (cluster sidebar, list/details/YAML, overview, search, project selector) contains hard-coded "OpenShift" copy; product words only come from data (e.g. the ClusterVersion) or from discovery-driven model labels. Admin screens may name the distribution.
- **DIST-7** Connection test (stored credential and unsaved token): the test reads API discovery and detects the type (served `config.openshift.io` ⇒ OpenShift). On a mismatch it adds a **warning** step result: "The cluster serves OpenShift APIs but is registered as Kubernetes. Check the distribution." (and the reverse wording). A mismatch never fails the test.
- **DIST-8** For a cluster declared Kubernetes without OpenShift APIs, the ClusterVersion step is reported as skipped ("Not an OpenShift cluster"), not as a warning. For OpenShift the step stays as today (not visible ⇒ warning).

### 4.3 Fleet perspective (FLEET)
- **FLEET-1** Admins (including read-only admins) see a "Fleet management" entry in the switcher menu, first, with its own icon and separated from the cluster groups by a divider. Non-admins don't see it. The search box filters clusters only; the entry stays visible while searching.
- **FLEET-2** Selecting it navigates to `/fleet`, which redirects to `/fleet/admin/users` (today's `/admin` default). On every `/fleet/...` page the toggle shows the fleet icon and "Fleet management" (no type tag, no environment label), and its accessible name is "Fleet management, switch cluster".
- **FLEET-3** On `/fleet/...` pages the sidebar contains only the Fleet section(s): "Fleet administration" with Users, Clusters, Credentials, Audit log (same items and order as today). The cluster sections, Home and Favorites are not shown there.
- **FLEET-4** The cluster sidebar no longer contains "Fleet administration" for anyone.
- **FLEET-5** Selecting a cluster in the switcher while on a fleet page goes to that cluster's default page (existing `clusterSwitchPath` rule), and the cluster sidebar returns.
- **FLEET-6** Routes: every current admin page moves from `/admin/<rest>` to `/fleet/admin/<rest>` with the same `<rest>`. `/admin` and every `/admin/<rest>` redirect (client-side, replace, query string and hash preserved) to the matching `/fleet/admin/<rest>`; unknown rests then hit the existing not-found handling. Login `returnUrl` to an old path ends on the new one.
- **FLEET-7** No internal link, audit-log link or test fixture points to `/admin/...` apart from the redirect and its tests. The backend `/api/admin/...` endpoints are unchanged.
- **FLEET-8** A non-admin opening any `/fleet/...` URL gets the same result as today's `/admin/...` for non-admins (no data, the existing forbidden page), and the API still refuses (no change to authorization).
- **FLEET-9** The masthead and environment band on fleet pages are neutral (no cluster environment band, no Kubernetes theme).

### 4.4 Kubernetes theme (THEME)
- **THEME-1** While the active cluster's distribution is Kubernetes, the masthead and the sidebar nav header (switcher area) use a dark navy background with a Kubernetes-blue accent. Content area, page sections, tables and the rest of the sidebar are unchanged. OpenShift clusters and fleet pages look exactly as today.
- **THEME-2** The theme is driven by a class/attribute on the shell plus CSS custom properties built on PF tokens; no inline styles, no DOM manipulation. The exact token values are **set by the ux-designer** and recorded in UX.md §2.
- **THEME-3** Contrast meets WCAG 2.2 AA in light and dark colour scheme: text ≥ 4.5:1, icons, focus indicators and the toggle border ≥ 3:1 against the themed background. Verified with the style probe (`scripts/ui-probe.mjs`) and recorded in the ux review.
- **THEME-4** Colour is never the only cue: the `K8s` tag on the toggle (SW-3) is always visible on Kubernetes clusters. The production environment band stays visually dominant over the theme (it is the first safety cue).
- **THEME-5** Switching between an OpenShift and a Kubernetes cluster updates the theme without a reload and without a flash of the wrong theme after the cluster list has loaded.

### 4.5 Namespace test (NST)
- **NST-1** Both connection-test dialogs (stored credential, unsaved token in add/rotate) take a list of namespaces instead of one: a PF text-input-group/chip input labelled "Inspect namespaces", helper text "Optional. Up to 10. Lists what the token may do in each namespace."
- **NST-2** Validation (client and server): 0–10 entries, each a valid namespace name (DNS-1123 label, ≤ 63 chars), trimmed, duplicates removed. 11 or an invalid name ⇒ field error naming the entry; nothing is sent to the cluster.
- **NST-3** The rules reviews run in parallel with the existing bounded concurrency, after the capability checks. One namespace failing (403, not found, timeout) never fails the others or the test: its result says why, and the step is a warning ("Rules reviewed in 2 of 3 namespaces").
- **NST-4** The result view shows one expandable section per namespace in the order entered, each with the existing rules table, or its error, and the incomplete/evaluation-error notes as today.
- **NST-5** The namespace list is saved on the credential: when adding a credential (from the add form's test field), and when a stored-credential test runs (the list used replaces the saved one; an empty list clears it). Rotation keeps the saved list. The unsaved-token test in rotate is prefilled from the credential.
- **NST-6** Opening the test dialog for a credential prefills the saved namespaces. The credential details show them ("Inspect namespaces: team-a, team-b"; "—" when empty).
- **NST-7** Audit: test entries record the namespace list (names only), never tokens. Existing token-leak sweeps still pass with namespaces in the payload.
- **NST-8** The saved list is not used by any other feature in CP3.7 (the namespace-picker fallback is CP5.5).

### 4.6 ADRs and quality gates (ADR, QG)
- **ADR-1** ADRs written: cluster type vs API discovery (DIST-5); Fleet perspective and route migration (FLEET-6); groups and grant priority (CP4.5 decisions in ROADMAP, decision only); access cache (CP4.5, decision only). No groups or cache code in CP3.7.
- **QG-1** `scripts/check-be.sh` and `scripts/check-fe.sh` green; new behaviour covered: domain (distribution invariant, namespace list invariant), application (DIST-7/8, NST-2/3/5), API (DIST-4, NST-2), SPA (SW-1..6, FLEET-1..8 incl. redirects, THEME-1/5, NST-1/4/6).
- **QG-2** ux-designer review of the switcher, fleet sidebar and Kubernetes masthead against OCP `NavHeader.tsx` and UX.md (clipped screenshots, light + dark for THEME), with THEME-3 contrast numbers.

## 5. UX notes

- **Switcher menu** (top to bottom): search; "Fleet management" (admins); divider; Recent; All clusters. A cluster item:
  `[type icon] Prod EU West            [OCP] [prod] [Read only]` with `prod-eu-1` as the description line. Keep PF
  `MenuItem` + `description`; don't build a custom two-line layout.
- **Toggle** (cluster): `[type icon] Prod EU West [OCP] [prod]`, one line (name `prod-eu-1` in the tooltip). Fleet:
  `[fleet icon] Fleet management`. The fleet icon must differ from both type icons (ux-designer picks the PF icons).
- **Fleet sidebar:** same `PageSidebar > Nav` structure and NavExpandable styling as the cluster sidebar; only the
  contents change. Page titles and breadcrumbs of admin pages are unchanged (the URL is the only visible change).
- **Kubernetes masthead:** like OCP's dark masthead in structure; only colour tokens change. Don't recolour PF
  buttons/menus that open from it (dropdown menus keep standard surfaces).
- **Distribution field:** radio group, horizontal, "OpenShift" / "Kubernetes", helper text "Changes how the console
  presents the cluster. Available pages come from the cluster's APIs."
- **Namespace input:** chips (`LabelGroup` in a `TextInputGroup`, Enter or comma adds), remove button per chip with
  `aria-label="Remove team-a"`, counter "3 of 10" in helper text when ≥ 1.
- **Empty/error states:** no namespaces ⇒ no rules section (as today). All namespaces failed ⇒ warning step, each
  section shows its error; never a generic "test failed".

## 6. Out of scope (CP3.7)

- Groups, grant priority, effective-access view, access cache, Redis (CP4.5 — only their ADRs here).
- Real Kubernetes onboarding: kind cluster, Kubernetes-only kinds, per-distribution sidebar beyond discovery gating,
  namespace-picker fallback from the saved list (CP5.5).
- Fleet overview / status of all clusters, non-admin access to the Fleet perspective (CP5).
- Filtering the Clusters list or the switcher by distribution (backlog), other distributions (EKS, AKS, …), auto-setting
  the distribution from the detected type.
- Per-namespace saved results or scheduled tests; more than 10 namespaces.
- Themes for other distributions or per-environment masthead colours.

## 7. Open questions (with recommendation)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Show the cluster name under the display name on the toggle? | **Decided (orchestrator, 2026-11-23): no** — one-line toggle like OCP and the human's "takes too much space" concern; the name is in the tooltip, accessible name and menu (SW-2). |
| Q2 | Detect the type from discovery or ClusterVersion? | **Discovery** (`config.openshift.io` served): any authenticated SA may read discovery; ClusterVersion is often 403 for namespaced SAs. |
| Q3 | Auto-correct the distribution on mismatch? | **No**, warn only (DIST-7). The admin's declaration stays the source of the presentation. |
| Q4 | Fleet routes `/fleet/users` or `/fleet/admin/users`? | **`/fleet/admin/...`**, so CP5's fleet view (`/fleet/clusters`, status of all clusters) doesn't collide with admin Clusters. |
| Q5 | How long do `/admin/...` redirects live? | Until CP6 at least; drop only with a release note. They're cheap. |
| Q6 | Fleet sidebar section starts collapsed (UX.md: every section starts collapsed)? | **Keep the rule** for consistency with OCP; revisit when CP5 adds a second section. |
| Q7 | Save the namespace list implicitly on every stored-credential test? | **Yes** (NST-5): the list you last tested is the one you want next time; the test is already an audited admin action that records state. |
| Q8 | Read-only admins and Fleet management? | **Visible** (they can read admin pages today); mutations stay refused as today. |

## 8. Proposed ROADMAP backlog additions (for the orchestrator to append)

- (CP3.7 spec) Filter the admin Clusters list and the switcher by distribution (`OCP`/`K8s`) and environment.
- (CP3.7 spec) "Fix distribution" quick action from the DIST-7 mismatch warning (one click to the edit form, field focused).
- (CP3.7 spec) Show the saved inspect namespaces in the Credentials list as a hover hint for namespaced SAs.
