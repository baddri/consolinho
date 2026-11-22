# CP3.6 acceptance — OCP parity (product owner, 2026-11-22, branch `cp/3.6-ocp-parity`)

**Verdict: ACCEPT WITH FOLLOW-UPS**, on two conditions: (1) T-0132 lands (in progress) and (2) one new blocker,
**B1**, is fixed. Then the human records the waivers below.

**Human decision (2026-11-22):** B1 fixed by T-0135, T-0132 and T-0136 landed; **W1–W5 accepted as proposed** (W2 waived for good, W1/W3/W4 → CP4, W5 → CP4/CP5 scope). CP3.6 closed. QA input: `docs/specs/CP3.6-verify.md` (PASS WITH FOLLOW-UPS).

## Walk-through (mock UI 1280 light vs reference `127.0.0.1:9000`, browse only; delete dialogs opened and cancelled on ours only)
| Flow | Verdict | Evidence |
|---|---|---|
| Pick a cluster (switcher, prod banner, read-only label) | met | OCP perspective-switcher layout; alice on prod-eu-1 gets the OCP-style "Production cluster prod-eu-1" banner |
| Find a pod (Pods list, filter, badges, status, Owner) | met | Same toolbar, `/` hint, sticky Name/kebab, RS owner badge; Memory/CPU absent (no metrics, matrix-waived) |
| Pod details / YAML / Events | met | Same DescriptionList order, YAML toolbar/footer, event stream and pause. Only the schema-sidebar icon is missing (W1) |
| Deployment, ring, Pods tab | partially | Matches, except dotted field-help underlines (W3) and ring ▲▼ (W4). These are the clearest giveaways |
| Actions menu / delete dialog | **not met** | B1 below. Dialog body, dependents checkbox and cluster cue are fine |
| Preferences / favourites | met | General tab matches; OCP's extra tabs (Language, Notifications…) are feature scope |
| Fleet administration | met | Uses the OCP list and details patterns; credential-expiry alert reads like OCP's inline danger alert |

## Blocker (row 42 / actions marked `match` but differs)
- **B1** The Actions menu and kebab say "Edit YAML" and a red "Delete". OCP (`console-app/src/actions/hooks/useCommonActions.ts`)
  says "Edit <Kind>" and "Delete <Kind>", with no danger colour, and puts Delete last. This copy is muscle memory and costs one string change:
  `web/src/features/resources/actions/useResourceActions.tsx:72,77`. Fix it in CP3.6 (new FE task), then update the matrix row.

## Waiver proposals (the human decides)
- **W1** YAML schema sidebar toggle → CP4. It needs the cluster OpenAPI (`/openapi/v2` or v3) through the proxy, which is new backend work.
- **W2** YAML Lightspeed button → permanent. It only appears when the Lightspeed product plugin is installed, and the reference console has none either.
- **W3** Details field-help popovers (T-0133) → CP4. OCP takes the text from the same swagger (`details-item.tsx` → `getPropertyDescription`),
  so build it together with W1 on one "cluster OpenAPI definitions" capability. Faking the text would drift.
- **W4** Deployment ring scale ▲▼ (T-0133) → CP4. It is the scale action from the CP4 scope, so building it now would be feature work.
- **W5** Missing tabs and actions (Logs, Terminal, Environment, Metrics, ReplicaSets, Edit Pod count…) and nav sections
  (Storage, Builds, Compute) → CP4/CP5 feature scope, not parity. Record this so nobody reopens CP3.6 for them.

## Follow-ups (`later`, added to ROADMAP)
- CP4: one cluster-OpenAPI capability that feeds the YAML schema sidebar (W1) and the field-help popovers (W3).
- Backlog: the switcher toggle clips a prod name to "prod…" next to the prod and Read-only labels. Prod-eu-1 and prod-us-1 then look the same.
  The banner helps, but the toggle should keep the cluster name and drop "Read only" before the name gets clipped.
- Backlog: T-0134 (favourite modal autofocus); event-card timestamp crowding at 375px (verify §Edge probes).
