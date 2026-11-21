---
id: T-0117
title: Mark spec lines superseded by CP3.5 (look & feel) in CP0/CP1/CP2 specs
status: todo
owner: ocp-product-owner
checkpoint: CP3.5
depends_on: [T-0111, T-0112, T-0113, T-0115]
paths: [docs/specs/CP0-foundations.md, docs/specs/CP1-identity-and-admin.md, docs/specs/CP2-proxy-and-resource-browser.md, docs/specs/CP2-acceptance.md]
review_rounds: 0
---

## Goal
CP3.5 changed UI that older specs still describe. Add a short "Superseded by CP3.5 (T-xxxx)" note at each line below so
later agents don't implement or test the old behaviour. Note only; keep the original text (history).

## Scope
- In: the lines listed below (verified 2026-11-22 against the current files).
- Out: rewriting requirements; FRONTEND.md / UX.md (already current).

## Superseded lines
| Spec line | Old text (short) | Now | Task |
|---|---|---|---|
| CP0-foundations L13 | masthead with placeholder cluster switcher | switcher at the top of the sidebar | T-0111 |
| CP1-identity-and-admin L282 (SW-2) | "The masthead switcher lists those clusters" | sidebar switcher | T-0111 |
| CP1-identity-and-admin L321 (UI table, Masthead) | Switcher `Select` in the masthead | masthead = hamburger, logo, theme menu, user menu | T-0111 |
| CP1-identity-and-admin L78 | "Admin via configuration" | "Admin set in the deployment settings" / "Admin through group <g>" | T-0115 |
| CP1-identity-and-admin L324 (`/admin/users/:username`) | "Admin via config" badge | source shown as above, in Role details | T-0115 |
| CP2-proxy-and-resource-browser L240 (§5 Page header) | breadcrumb `Projects › shop › Pods › web-…` | OCP breadcrumb `<Kinds> › <Kind> details`, project bar above | T-0113 |
| CP2-proxy-and-resource-browser L247 (§5 Live indicator) | "Live" / "Paused — retrying" label next to the title | no Live label (watch behaviour unchanged) | T-0112 |
| CP2-acceptance L83 (DATA-3) | paused-indicator evidence | indicator removed; paging/watch/relist evidence still valid | T-0112 |

## Acceptance criteria
- [ ] Each line above carries a one-line superseded note pointing to its task; no other spec text changed.
