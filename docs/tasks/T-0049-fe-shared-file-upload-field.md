---
id: T-0049
title: Shared FileUploadField (a11y-linked helper/error text) — use for CA bundle
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0034]
paths: [web/src/shared/forms/, web/src/features/admin/clusters/form/CaBundleField.tsx]
review_rounds: 0
---

## Goal
From T-0034 review: `CaBundleField` deep-imports `@/shared/forms/fieldA11y`, and PF `FileUpload` doesn't forward
`aria-describedby` to its text area, so helper/error text isn't programmatically linked. Extract a shared
`FileUploadField` adapter in `shared/forms` (exported from its index) that T-0036's token upload can reuse.

## Acceptance criteria
- [ ] `FileUploadField` in `web/src/shared/forms/` (exported), uses `hideDefaultPreview` + own `TextArea` with
      `aria-describedby` linking helper and error text; `aria-invalid` on error.
- [ ] Read failures (`onReadFailed`) show a field error.
- [ ] `CaBundleField` uses it; no deep import from `fieldA11y` remains; optional client-side 256 KiB `.max` on CA bundle.
- [ ] Tests: helper/error text reachable via `toHaveAccessibleDescription`; read failure shows error.
- [ ] `scripts/check-fe.sh` green.

## Work log

## Handover notes
