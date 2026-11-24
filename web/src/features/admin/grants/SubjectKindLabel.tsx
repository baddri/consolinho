import { Label } from '@patternfly/react-core';
import type { GrantSubjectKind } from '@/shared/api';

const SUBJECT_KIND_TEXT: Readonly<Record<GrantSubjectKind, string>> = { user: 'User', group: 'Group' };

/** Props for {@link SubjectKindLabel}. */
export interface SubjectKindLabelProps {
  kind: GrantSubjectKind;
}

/** Whom a grant is for, as a compact grey label: "User" (direct grant) or "Group" (spec §5, UIG). */
export function SubjectKindLabel({ kind }: SubjectKindLabelProps) {
  return <Label isCompact>{SUBJECT_KIND_TEXT[kind]}</Label>;
}
