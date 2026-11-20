import {
  Alert,
  AlertActionLink,
  Button,
  Flex,
  FlexItem,
  Stack,
  StackItem,
  Switch,
} from '@patternfly/react-core';
import { useMemo, useState } from 'react';
import { useAccessibleClusters } from '@/features/cluster-context';
import { errorMessage, isApiError } from '@/shared/api';
import type { K8sResource } from '@/shared/k8s';
import { EnvironmentLabel } from '@/shared/ui';
import { useResourceAccess } from '../actions/useResourceAccess';
import { useResourceDetails } from '../details/detailsContext';
import { UnsavedChangesGuard } from './UnsavedChangesGuard';
import { useUpdateResource } from './useUpdateResource';
import { YamlEditor } from './YamlEditor';
import { parseEdited, toEditorText } from './yamlObject';

/** Unsaved edits: the text and the object version they started from (its `resourceVersion` goes into the PUT). */
interface YamlEdit {
  base: K8sResource;
  text: string;
}

/**
 * YAML tab (UI-6, UI-7, ADR-0024): the live object in the Monaco editor, without `metadata.managedFields` unless
 * toggled. Lazy route module: Monaco (imported by `YamlEditor` via `monacoSetup`) loads only with this tab.
 *
 * - **Read-only** (UI-9 reason from `useResourceAccess`): info alert with the reason, read-only editor, no Save. While
 *   the access check runs the editor is read-only too.
 * - **Clean** editor follows the live object (watch). **Dirty** editor keeps the user's text; when the object changes on
 *   the cluster a warning offers Reload (discard edits).
 * - **Save** parses and checks the text client-side (no request on invalid YAML or a changed identity), then PUTs it
 *   with the version the edit started from. 409 → "updated since you opened it" with Reload, never an overwrite;
 *   other failures → the server's message. Edits are kept until the user saves successfully or reloads.
 */
export function ResourceYamlTab() {
  const { cluster, descriptor, obj } = useResourceDetails();
  const { model } = descriptor;
  const name = obj.metadata.name ?? '';
  const access = useResourceAccess(cluster, { verb: 'update', model, namespace: obj.metadata.namespace, name });
  const environment = useAccessibleClusters().data?.find((entry) => entry.name === cluster)?.environment;
  const update = useUpdateResource(cluster, model);

  const [showManagedFields, setShowManagedFields] = useState(false);
  const [edit, setEdit] = useState<YamlEdit | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const liveText = useMemo(() => toEditorText(obj, { showManagedFields }), [obj, showManagedFields]);
  const baseText = useMemo(
    () => (edit ? toEditorText(edit.base, { showManagedFields }) : liveText),
    [edit, liveText, showManagedFields],
  );
  const isReadOnly = access.disabledReason !== undefined;
  const isEditable = !isReadOnly && !access.isChecking;
  const isDirty = edit !== null && isEditable;
  const isConflict = isApiError(update.error, 'Kubernetes.Conflict');
  const changedOnCluster = isDirty && edit.base.metadata.resourceVersion !== obj.metadata.resourceVersion;

  const onChange = (text: string) => {
    setClientError(null);
    // A failed save's message is stale once the user edits; a conflict stays, as only Reload can resolve it.
    if (update.error !== null && !isConflict) update.reset();
    if (edit) {
      // Typing back to the original text makes the editor clean (and live) again.
      setEdit(text === baseText ? null : { ...edit, text });
    } else if (text !== liveText) {
      setEdit({ base: obj, text });
    }
  };

  const reload = () => {
    setEdit(null);
    setClientError(null);
    update.reset();
  };

  const save = () => {
    if (!edit) return;
    const parsed = parseEdited(edit.text, edit.base);
    if (!parsed.ok) {
      update.reset();
      setClientError(parsed.message);
      return;
    }
    setClientError(null);
    // The hook puts the saved object into the cache, so the clean editor shows it (with its new resourceVersion).
    update.mutate(parsed.obj, { onSuccess: () => setEdit(null) });
  };

  const reloadAction = <AlertActionLink onClick={reload}>Reload</AlertActionLink>;

  return (
    <Stack hasGutter>
      {access.disabledReason !== undefined && (
        <StackItem>
          <Alert variant="info" isInline title={access.disabledReason} />
        </StackItem>
      )}
      {changedOnCluster && !isConflict && (
        <StackItem>
          <Alert variant="warning" isInline title="This object changed on the cluster" actionLinks={reloadAction}>
            Your edits are kept. Reload to discard them and see the latest version.
          </Alert>
        </StackItem>
      )}
      {clientError !== null && (
        <StackItem>
          <Alert variant="danger" isInline isLiveRegion title={`${name} can't be saved`}>
            {clientError}
          </Alert>
        </StackItem>
      )}
      {update.error !== null && (
        <StackItem>
          {isConflict ? (
            <Alert
              variant="danger"
              isInline
              isLiveRegion
              title="This object has been updated since you opened it"
              actionLinks={reloadAction}
            >
              Your edits were not saved. Reload to discard them and edit the latest version.
            </Alert>
          ) : (
            <Alert variant="danger" isInline isLiveRegion title={`${name} couldn't be saved`}>
              {errorMessage(update.error)}
            </Alert>
          )}
        </StackItem>
      )}
      <StackItem>
        <YamlEditor
          value={isDirty ? edit.text : liveText}
          onChange={onChange}
          isReadOnly={!isEditable || update.isPending}
          downloadFileName={name}
          toolbar={
            <Switch
              id="yaml-show-managed-fields"
              label="Show managed fields"
              isChecked={showManagedFields}
              // Toggling re-renders the text from the object, which would throw away unsaved edits.
              isDisabled={isDirty}
              onChange={(_event, checked) => setShowManagedFields(checked)}
            />
          }
        />
      </StackItem>
      {!isReadOnly && (
        <StackItem>
          <Flex alignItems={{ default: 'alignItemsCenter' }}>
            <FlexItem>
              <Button
                variant="primary"
                onClick={save}
                isDisabled={!isDirty}
                isLoading={update.isPending}
                isAriaDisabled={update.isPending}
              >
                Save
              </Button>
            </FlexItem>
            <FlexItem>
              <Button variant="secondary" onClick={reload} isDisabled={!isDirty && update.error === null}>
                Reload
              </Button>
            </FlexItem>
            <FlexItem>{`Saving to ${cluster}`}</FlexItem>
            {environment && (
              <FlexItem>
                <EnvironmentLabel environment={environment} isCompact />
              </FlexItem>
            )}
          </Flex>
        </StackItem>
      )}
      <UnsavedChangesGuard when={isDirty} name={name} cluster={cluster} />
    </Stack>
  );
}
