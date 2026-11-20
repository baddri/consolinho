---
id: T-0049
title: Shared FileUploadField (a11y-linked helper/error text) — use for CA bundle
status: done
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
- [x] `FileUploadField` in `web/src/shared/forms/` (exported), uses `hideDefaultPreview` + own `TextArea` with
      `aria-describedby` linking helper and error text; `aria-invalid` on error.
- [x] Read failures (`onReadFailed`) show a field error.
- [x] `CaBundleField` uses it; no deep import from `fieldA11y` remains; optional client-side 256 KiB `.max` on CA bundle.
- [x] Tests: helper/error text reachable via `toHaveAccessibleDescription`; read failure shows error.
- [x] `scripts/check-fe.sh` green.

## Work log
- 2026-11-20 frontend-engineer: started; FileUploadField adapter in shared/forms, CaBundleField on top of it.
- 2026-11-20 frontend-engineer: done; FileUploadField + tests, CaBundleField migrated, 256 KiB byte check in schema. check-fe green.

## Handover notes
- `FileUploadField` (`@/shared/forms`): RHF adapter over PF `FileUpload hideDefaultPreview` + own `TextArea` (field id,
  ref for RHF focus, `aria-describedby` helper/error, `aria-invalid`). Options: `accept`, `maxSizeBytes`, `isMonospace`,
  `allowEditingUploadedText` (default true), `placeholder`, `filenamePlaceholder`, `browseButtonText`, `rows`.
- File problems (read failure, too large, wrong type) are component state shown as the field error; cleared by the next
  edit/upload/clear. They don't block submit (RHF re-validates on submit); the value is never set from a bad file.
- PF gotcha: `onFileInputChange` also fires for drop-zone-rejected files, so filename/error reset happen in
  `onReadStarted`. After a failed read PF calls `onDataChange('')` (value cleared) — kept.
- CA bundle: schema checks UTF-8 bytes ≤ `MAX_CA_BUNDLE_BYTES` (refine, mirrors server `CaBundle.MaxSizeBytes`, same
  message) rather than `.max` (chars); files over the limit are rejected before reading.
- Tests reach the hidden dropzone `<input type=file>` via `container.querySelector` (PF leaves it unlabelled).

## Review
- 2026-11-20 frontend-architect, round 1: **APPROVE** (check-fe green: 38 files / 438 tests). Optional nits:
  - FileUploadField.tsx TSDoc "they never change the value" — a read failure clears it (PF `onDataChange('')`); reword.
  - FileUploadField.tsx `<TextArea>` — add `spellCheck={false}` (PEM/tokens/YAML; stops enhanced spellcheck sending SA tokens off-box before T-0036).
  - FileUploadFieldProps `isDisabled`/`rows` lack TSDoc.
  - clusterForm.schema.ts refine message hardcodes "256 KiB"; derive from `MAX_CA_BUNDLE_BYTES`.
  - Tests' `container.querySelector('input[type="file"]')` is an acceptable RTL escape hatch (PF input is unlabelled; rule targets app code).
