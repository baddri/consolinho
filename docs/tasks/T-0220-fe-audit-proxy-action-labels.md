---
id: T-0220
title: Readable audit labels for proxy entries (POL-3)
status: done
owner: frontend-engineer
checkpoint: CP4c
depends_on: []
paths: [web/src/features/admin/audit/auditActionLabels.ts, web/src/features/admin/audit/auditActionLabels.test.ts, web/src/features/admin/audit/AuditEntryRow.tsx, web/src/mocks/k8s/proxyAudit.ts]
review_rounds: 1
---

## Goal
The audit log shows "Scale Deployment", "Exec into Pod", "Delete Pod" for proxy entries instead of `proxy.update`. The labels come from one shared, unit-tested map from (verb, resource, subresource) to label. The raw id stays visible (POL-3, plus the §4b.8 follow-up for DC `instantiate`/`rollback` and Job create).

## Scope
- In:
  - `auditEntryLabel(entry)` (or `proxyActionLabel(details)`) in `auditActionLabels.ts`.
  - `AuditEntryRow` uses it for the title.
  - The raw `action` stays in the expanded detail (L151 already shows it). The row title gets a tooltip with the raw id.
- Out: backend changes (`details` already carries `method, path, group, version, resource, subresource, namespace, name`); the audit filters (they keep filtering by raw action id).

## Contract / design notes
- The kind comes from `resource` via the registry: use the `K8sModel` with that group and plural, falling back to a sentence-cased singular of the plural. Use only `shared/k8s` models (the admin feature must not import `features/resources` internals). If the lookup needs the registry, put a small `kindForResource(group, plural)` in `shared/k8s`.
- Rules (first match wins), one table, not a switch spread across files:
  - `subresource=scale` + update/patch → "Scale <Kind>"
  - `pods/exec` → "Exec into Pod"
  - `pods/attach` → "Attach to Pod"
  - `pods/eviction` → "Evict Pod"
  - `deploymentconfigs/instantiate` → "Start rollout of DeploymentConfig"
  - `deploymentconfigs/rollback` → "Roll back DeploymentConfig" (OCP action copy + kind)
  - `subresource=status` → "Update <Kind> status"
  - otherwise by action: create → "Create <Kind>", update → "Update <Kind>", patch → "Patch <Kind>", delete → "Delete <Kind>", delete_collection → "Delete <Kind> collection", connect → "Connect to <Kind>".
  - Restart/pause/resume are plain patches on the backend (no hint), so they read "Patch Deployment". Accept this; don't guess from the body.
- Non-proxy actions keep the existing map unchanged.

## Context pack
- Touch points:
  - `web/src/features/admin/audit/auditActionLabels.ts:auditActionLabel`.
  - `web/src/features/admin/audit/AuditEntryRow.tsx` L121 (label) and L151 (raw `<code>`).
  - The proxy details shape: `web/src/mocks/k8s/proxyAudit.ts:proxyAuditInput` L104-134.
  - The generated audit DTO type in `web/src/shared/api` (`details` is a JSON object; narrow it with a zod/type guard, no `any`).
- Parallel work: T-0205 (ux) edits `AuditLogPage.tsx` only, so the paths are disjoint.

## Acceptance criteria
- [x] POL-3: a table-driven unit test covers each rule (scale, exec, attach, eviction, instantiate, rollback, status, Job create, Pod delete, an unknown CRD plural, and a missing/malformed `details` → raw id).
- [x] The audit row title shows the label, and the raw action id is still visible in the expanded row and the tooltip (RTL test).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: `auditEntryLabel` + one `PROXY_LABEL_RULES` table in `auditActionLabels.ts` (zod-narrowed
  `details`, kind via `K8S_MODELS`, else singularised plural); row title shows it with a raw-id `Tooltip`. No
  `shared/k8s` change needed (`K8S_MODELS` already exported); `proxyAudit.ts` unchanged. Out-of-paths: updated
  `AuditLogPage.test.tsx` PAUD-4/AUD-2 (they matched raw `proxy.*` row text) — it now carries the RTL AC.

## Review
**UX round 1 — CHANGES_REQUESTED** (code read; OCP table-cell tooltip pattern: `console-shared/src/components/datetime/Timestamp.tsx` L35-43)
- OK: labels "<Verb> <Kind>" with the kind as in OCP action labels, OCP copy for scale/DC rollback, raw id in tooltip and expanded row.
- AuditEntryRow Action cell — `<span tabIndex={0}>` adds one tab stop per row (50+ on a page), hurting focus order; OCP's in-table tooltip trigger (Timestamp) is a plain non-focusable `<span>`, and the raw id is keyboard-reachable in the expanded row — fix: drop `tabIndex` and the eslint-disable, and correct the comment (no OCP "tooltip-on-status" source exists for it).

## Handover notes
- Labels: `features/admin/audit/auditActionLabels.ts` (`auditEntryLabel`; non-proxy ids still via `auditActionLabel`).
- RTL coverage of label + tooltip + expanded `Action ID` lives in `AuditLogPage.test.tsx` PAUD-4 (no row test file).
- Filters still use raw ids by design.

- 2026-11-24 orchestrator round 2: UX finding applied verbatim (one-line fix), scoped tests 63/63 + eslint green → APPROVE.
