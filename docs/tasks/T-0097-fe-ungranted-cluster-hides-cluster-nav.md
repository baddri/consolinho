---
id: T-0097
title: Hide cluster navigation on the "cluster not available" page
status: todo
owner: frontend-engineer
checkpoint: 6
depends_on: []
paths: [web/src/app/layout/, web/src/features/cluster-context/]
review_rounds: 0
superseded_by: [T-0119, T-0125]
---

## Goal
Opening `/c/<ungranted>/k8s/pods` shows "Cluster … is not available" with switcher "Select a cluster", but the sidebar
still offers Home/Workloads/Networking/Administration links that lead back to the same error. Found in CP2 PO acceptance
(admin persona on prod-eu-1 in `dev:mock`).

## Scope
- In: when the URL cluster is unknown/ungranted, render only "Fleet administration" (admins) in the sidebar; the empty
  state offers "Select a cluster" (opens switcher) next to "Go to home".
- Out: any change to the 404 semantics of the proxy (PRX-2).

## Acceptance criteria
- [ ] Given an ungranted cluster in the URL, the sidebar has no cluster sections; switching to a granted cluster restores them.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
