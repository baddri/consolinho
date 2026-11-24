import { FormGroup, FormSection, Radio } from '@patternfly/react-core';
import { useState } from 'react';
import { useController, type Control } from 'react-hook-form';
import type { GrantSubjectKind } from '@/shared/api';
import { fieldIdFor } from '@/shared/forms';
import type { GrantFormValues } from './grantForm.schema';
import { GroupTypeahead } from './GroupTypeahead';
import { SUBJECT_KIND_TEXT } from './grantText';
import { UserTypeahead } from './UserTypeahead';

/** Props for {@link SubjectSection}. */
export interface SubjectSectionProps {
  control: Control<GrantFormValues>;
  /** Subjects of each kind that already hold a grant on the cluster (offered disabled). */
  granted: Readonly<Record<GrantSubjectKind, ReadonlySet<string>>>;
  /** The kind changed: the form clears the subject name and priority (UIG-1). */
  onKindChange: () => void;
}

const SUBJECT_KINDS: readonly GrantSubjectKind[] = ['user', 'group'];

/**
 * "Subject" section of the create dialog (UIG-1), shaped like OCP's RoleBinding form (`RBAC/bindings.tsx`): a
 * `FormSection` with an unlabelled stack of kind radios (accessible name "Subject kind"), then "Subject name" — a user
 * typeahead for User (the default), a group typeahead with free text for Group. Switching the kind remounts the name
 * field empty and focuses it.
 */
export function SubjectSection({ control, granted, onKindChange }: SubjectSectionProps) {
  const { field } = useController({ control, name: 'subjectKind' });
  const [hasSwitched, setHasSwitched] = useState(false);
  const fieldId = fieldIdFor(field.name);
  const kind = field.value;

  const changeKind = (next: GrantSubjectKind) => {
    if (next === kind) return;
    field.onChange(next);
    onKindChange();
    setHasSwitched(true);
  };

  return (
    <FormSection title="Subject" titleElement="h2">
      <FormGroup role="radiogroup" fieldId={fieldId} aria-label="Subject kind" isStack>
        {SUBJECT_KINDS.map((value) => (
          <Radio
            key={value}
            id={`${fieldId}-${value}`}
            name={fieldId}
            value={value}
            label={SUBJECT_KIND_TEXT[value]}
            isChecked={kind === value}
            onChange={() => changeKind(value)}
          />
        ))}
      </FormGroup>
      {kind === 'user' ? (
        <UserTypeahead key="user" control={control} granted={granted.user} isAutoFocus={hasSwitched} />
      ) : (
        <GroupTypeahead key="group" control={control} granted={granted.group} isAutoFocus={hasSwitched} />
      )}
    </FormSection>
  );
}
