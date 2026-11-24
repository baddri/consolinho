---
id: T-0234
title: Route without sticky-session cookie (round-robin)
status: done
owner: orchestrator
checkpoint: 4c
depends_on: [T-0233]
paths: [deploy/kustomize/base/route.yaml]
review_rounds: 0
---

## Goal
Human directive 2026-11-24: a browser should not stick to one pod. The API keeps no per-user state in memory
(sessions and OAuth state are cookies protected with the shared key ring; T-0233 + human pod-delete test proved
cross-pod decryption), so the router's default sticky cookie only hides imbalance.

## Acceptance criteria
- [x] Route annotations `disable_cookies: "true"` and `balance: roundrobin` in `deploy/kustomize/base/route.yaml`
- [x] Live route in consolinho: no router `set-cookie` (spread not measurable: the API does not log these requests)

## Work log
- 2026-11-24 orchestrator: annotations added to base route.yaml; `oc kustomize` renders; applied live with `oc annotate` in consolinho; /healthz now returns no set-cookie.
