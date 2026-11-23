import { zodResolver } from '@hookform/resolvers/zod';
import type { FormProps } from '@patternfly/react-core';
import { useMemo, useState } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { errorMessage, isApiError } from '@/shared/api';
import { DeploymentModel } from '@/shared/k8s';
import { useUpdateResource } from '../../../yaml/useUpdateResource';
import { parseEdited, toEditorText } from '../../../yaml/yamlObject';
import { deploymentFormSchema, type DeploymentFormValues } from './deploymentFormSchema';
import { applyFormValues, toFormValues, type DeploymentObject } from './deploymentFormValues';
import { useEditorType, type EditorType } from './useEditorType';

/** State and commands of the Edit Deployment page; see {@link useDeploymentEditor}. */
export interface DeploymentEditor {
  form: UseFormReturn<DeploymentFormValues>;
  view: EditorType;
  /** Asks to switch views; leaving invalid YAML sets {@link yamlWarning} instead. */
  changeView: (view: EditorType) => void;
  yamlText: string;
  setYamlText: (text: string) => void;
  /** Why the YAML can't become form values (OCP "Invalid YAML cannot be persisted"), or `null`. */
  yamlWarning: string | null;
  /** "Switch and delete": drops the invalid YAML and shows the form as it was. */
  confirmSwitchToForm: () => void;
  dismissYamlWarning: () => void;
  /** The edit differs from the version it started from. */
  isDirty: boolean;
  /** Form view has validation errors (validated on change, like OCP's Formik); Save waits for them to clear. */
  hasErrors: boolean;
  /** A newer version exists (the watch delivered one, or a save answered 409): "This object has been updated." */
  isStale: boolean;
  /** Client-side (invalid YAML) or server error of the last save. */
  error: string | null;
  isSaving: boolean;
  /** The saved object once a save succeeded; the page then leaves for the details page. */
  saved: DeploymentObject | null;
  submit: NonNullable<FormProps['onSubmit']>;
  /** Discards the edits and starts over from the live object. */
  reload: () => void;
}

/**
 * The synced Form/YAML editor of one Deployment (FORM-1, FORM-3; OCP `EditDeployment` + `SyncedEditorField`).
 *
 * - **Base**: the version the edit started from (mount or Reload); its `resourceVersion` goes into the PUT, so a
 *   concurrent change answers 409 instead of being overwritten. OCP keeps the base while the live object moves on and
 *   reports it stale.
 * - **Working object**: what the form values are written into (`applyFormValues`): the base, or the object last parsed
 *   from the YAML view, so YAML edits to fields the form doesn't own survive a trip through the form.
 * - **Form → YAML** dumps the working object with the form values; **YAML → Form** parses the text (same checks as the
 *   YAML tab's `parseEdited`) into a new working object and form values, or raises the invalid-YAML warning.
 * - **Save** sends one PUT of the current view's object; success hands the saved object to the page.
 */
export function useDeploymentEditor(cluster: string, live: DeploymentObject, isEditable: boolean): DeploymentEditor {
  const [view, setView] = useEditorType();
  const [base, setBase] = useState(live);
  const [working, setWorking] = useState(live);
  const [yamlText, setYamlText] = useState(() => toEditorText(live));
  const [yamlWarning, setYamlWarning] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [saved, setSaved] = useState<DeploymentObject | null>(null);
  const update = useUpdateResource(cluster, DeploymentModel);
  const form = useForm<DeploymentFormValues>({
    resolver: zodResolver(deploymentFormSchema),
    defaultValues: toFormValues(live),
    disabled: !isEditable,
    mode: 'onChange',
  });
  const values = useWatch({ control: form.control });

  const baseText = useMemo(() => toEditorText(base), [base]);
  const formText = useMemo(
    () => toEditorText(applyFormValues(working, { ...toFormValues(working), ...values })),
    [working, values],
  );
  const isDirty = isEditable && (view === 'yaml' ? yamlText : formText) !== baseText;
  const isStale =
    base.metadata.resourceVersion !== live.metadata.resourceVersion ||
    isApiError(update.error, 'Kubernetes.Conflict');

  const changeView = (next: EditorType) => {
    if (next === view) return;
    if (next === 'yaml') {
      setYamlText(formText);
      setView('yaml');
      return;
    }
    const parsed = parseEdited(yamlText, base);
    if (!parsed.ok) {
      setYamlWarning(parsed.message);
      return;
    }
    const obj = parsed.obj as DeploymentObject;
    setWorking(obj);
    // Keeping the defaults keeps RHF's dirty state relative to the base.
    form.reset(toFormValues(obj), { keepDefaultValues: true });
    setYamlWarning(null);
    setView('form');
  };

  const put = (obj: DeploymentObject) => {
    setClientError(null);
    update.reset();
    update.mutate(obj, { onSuccess: (result) => setSaved(result as DeploymentObject) });
  };

  const submit: DeploymentEditor['submit'] = (event) => {
    event.preventDefault();
    if (!isEditable || update.isPending) return;
    if (view === 'yaml') {
      const parsed = parseEdited(yamlText, base);
      if (parsed.ok) put(parsed.obj as DeploymentObject);
      else setClientError(parsed.message);
      return;
    }
    void form.handleSubmit((submitted) => put(applyFormValues(working, submitted)))(event);
  };

  const reload = () => {
    setBase(live);
    setWorking(live);
    setYamlText(toEditorText(live));
    setYamlWarning(null);
    setClientError(null);
    update.reset();
    form.reset(toFormValues(live));
  };

  return {
    form,
    view,
    changeView,
    yamlText,
    setYamlText,
    yamlWarning,
    confirmSwitchToForm: () => {
      setYamlWarning(null);
      setView('form');
    },
    dismissYamlWarning: () => setYamlWarning(null),
    isDirty,
    hasErrors: view === 'form' && Object.keys(form.formState.errors).length > 0,
    isStale,
    error: clientError ?? (update.error === null ? null : errorMessage(update.error)),
    isSaving: update.isPending,
    saved,
    submit,
    reload,
  };
}
