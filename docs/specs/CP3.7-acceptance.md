# CP3.7 acceptance — Fleet foundations (product owner, 2026-11-23, branch `cp/3.7-fleet-foundations`)

**Verdict: ACCEPT WITH FOLLOW-UPS.** All 40 criteria are met (QA input: `docs/specs/CP3.7-verify.md`, PASS, 1830 BE +
891 FE + 10/10 e2e). My walk-through found no blocker. Two day-2 findings, F1 (menu name clipping on read-only prod
items) and F2 (prod band salience on a Kubernetes cluster), are `later` items below. Neither breaks the wording of a criterion.

## Walk-through (`vite --mode mock` on :5411, 1280 light, `?mockUser=admin|alice`, throw-away Playwright; browse only, server stopped)
| Flow | Verdict | Evidence |
|---|---|---|
| Know where I am: switcher display name + type tag (SW-1..5) | met | alice toggle "Production EU 1 \| OCP \| prod", aria "Cluster Production EU 1 (prod-eu-1, OCP, prod, read only), switch cluster"; tooltip "Lab 1 / lab-1"; no "Read only" on the toggle |
| Read-only shown only in the menu (SW-4/5) | met, see F1 | alice menu items: type, env, "Read only", name as description. On the 256 px menu "Production EU 1" is clipped to "P" next to OCP + prod + Read only |
| Find a cluster by type (SW-6) | met | QA manual + tests; `k8s`/`kubernetes` → Lab 1 |
| Fleet perspective from the switcher (FLEET-1/2/3/5) | met | admin menu: "Fleet management" first; → `/fleet/admin/users`, toggle "Fleet management, switch cluster", sidebar only "Fleet administration: Users, Clusters, Credentials, Audit log"; neutral masthead; alice has no entry |
| Old bookmark (FLEET-6) | met | `/admin/clusters/dev-2?x=1#h` → `/fleet/admin/clusters/dev-2?x=1#h` |
| Kubernetes cluster at a glance (THEME-1/4/5, colourblind) | met, see F2 | lab-1: `data-cluster-type="kubernetes"`, masthead rgb(0,51,102) vs white for OCP, so the cue is luminance and not hue. The `K8s` text tag is always on the toggle. The type icons differ in shape (server vs cubes). Discovery-driven sidebar: Namespaces, no Projects (DIST-5). Contrast is from the T-0149 ux probe (12.6:1 text, 5.0:1 border) |
| Multi-namespace token test (NST-1/2/4/5/6) | met | `team-a, team-b,team-c` comma-entry → 3 chips, "3 of 10". `Bad_NS` → "Not a valid namespace name: Bad_NS.", duplicate dropped. lab-1 run passes with "Rules in namespace team-a/b/c" sections. Reopening prefills the 3 namespaces, and the credential row shows "Inspect namespaces: team-a, team-b, team-c" |
| K8s test wording (DIST-7/8) | met | lab-1: "Distribution: No OpenShift APIs served, as registered", "OpenShift version: Not an OpenShift cluster" |

## Findings (`later`)
- **F1** Switcher menu (fixed to toggle width by T-0152): a read-only prod item has 3 labels and shows "P". The description line
  `prod-eu-1` still tells the items apart, so this is not a blocker. Across 40 clusters, though, the display name the operator searches by should not be the part that gets clipped.
- **F2** On a Kubernetes **production** cluster, the navy masthead outweighs the pale-pink production band (QA screenshot, lab-1
  edited to prod). The band is unchanged from OCP and has its text, so THEME-4 holds. The safety cue still needs a deliberate ux check.

## Mock data: add a Kubernetes production cluster? Yes
It is a fixture change of a few lines. It is the riskiest combination (navy theme + prod band + read-only) for a colourblind operator,
it lets F1/F2 be reviewed without editing data, and CP5.5 needs it anyway. Grant it to alice read-only, so it also exercises F1.

## Follow-ups (one line each, suggested checkpoint)
- CP4 (first task): mock fixture `prod-k8s-1` "Production K8s 1" (Kubernetes, production), granted to alice read-only and to admin.
- CP4: switcher menu: never clip the display name to < ~12 chars. Let the menu grow past the toggle width (OCP allows a wider menu) or wrap labels under the name; ux-designer decides.
- CP4: ux-designer rechecks the prod band salience on the K8s theme (F2) with the new fixture, light + dark; keep the band dominant (e.g. a stronger band on themed shells).
- CP5.5: connection-test summary on Kubernetes clusters hides "OpenShift version: Unknown" and the "List cluster operators" capability (it shows OpenShift-only items as unknown/denied).
- Backlog (as spec §6): filter the switcher and Clusters list by distribution; auto-suggest the distribution from the detected type.
