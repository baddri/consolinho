import { ActionGroup, Alert, Button, Flex, FlexItem, Form } from '@patternfly/react-core';
import { RhUiDownloadIcon } from '@patternfly/react-icons';
import { css } from '@patternfly/react-styles';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAccessibleClusters } from '@/features/cluster-context';
import { errorMessage, isApiError } from '@/shared/api';
import type { K8sResource } from '@/shared/k8s';
import { EnvironmentLabel } from '@/shared/ui';
import { useResourceAccess } from '../actions/useResourceAccess';
import { useResourceDetails } from '../details/detailsContext';
import { resourcePath } from '../paths';
import styles from './ResourceYamlTab.module.css';
import { UnsavedChangesGuard } from './UnsavedChangesGuard';
import { useFullscreen } from './useFullscreen';
import { useUpdateResource } from './useUpdateResource';
import { YamlEditor } from './YamlEditor';
import { parseEdited, toEditorText } from './yamlObject';

/** Unsaved edits: the text and the object version they started from (its `resourceVersion` goes into the PUT). */
interface YamlEdit {
  base: K8sResource;
  text: string;
}

/** `data:` URL of `text` as a YAML file, for the Download link (no DOM work needed to save it). */
const yamlDataUrl = (text: string) => `data:text/yaml;charset=utf-8,${encodeURIComponent(text)}`;

/**
 * YAML tab (UI-6, UI-7, ADR-0024), OCP's `EditYAML` (`public/components/edit-yaml.tsx`): the live object in the
 * Monaco editor (`metadata.managedFields` folded), alerts, then the button bar Save · Reload · Cancel · Download, all in
 * a full screen capable column. Lazy route module: Monaco (imported by `YamlEditor` via `monacoSetup`) loads only with
 * this tab.
 *
 * - **Read-only** (UI-9 reason from `useResourceAccess`): info alert with the reason, read-only editor, no Save. While
 *   the access check runs the editor is read-only too.
 * - **Clean** editor follows the live object (watch). **Dirty** editor keeps the user's text; when the object changes on
 *   the cluster (or a save answered 409) OCP's "This object has been updated." alert asks to reload (discarding edits).
 * - **Save** (also Ctrl/Cmd+S) parses and checks the text client-side (no request on invalid YAML or a changed
 *   identity), then PUTs it with the version the edit started from. Success → "<name> has been updated to version
 *   <rv>"; any failure (409 conflict included, never an overwrite) → "An error occurred" with the message. Edits are
 *   kept until the user saves successfully or reloads. Next to Save the fleet cue names the target cluster (SW-10).
 * - **Cancel** returns to Details (asking first if there are unsaved edits); **Download** saves the editor text as
 *   `<kind>-<name>.yaml` like OCP's `downloadYaml`.
 */
export function ResourceYamlTab() {
  const { cluster, descriptor, obj } = useResourceDetails();
  const { model } = descriptor;
  const name = obj.metadata.name ?? '';
  const access = useResourceAccess(cluster, {
    verb: 'update',
    model,
    namespace: obj.metadata.namespace,
    name,
  });
  const environment = useAccessibleClusters().data?.find((entry) => entry.name === cluster)?.environment;
  const update = useUpdateResource(cluster, model);
  const navigate = useNavigate();
  const { ref: fullscreenRef, ...fullscreen } = useFullscreen();

  const [edit, setEdit] = useState<YamlEdit | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const liveText = useMemo(() => toEditorText(obj), [obj]);
  const baseText = useMemo(() => (edit ? toEditorText(edit.base) : liveText), [edit, liveText]);
  const isReadOnly = access.disabledReason !== undefined;
  const isEditable = !isReadOnly && !access.isChecking;
  const isDirty = edit !== null && isEditable;
  const text = isDirty ? edit.text : liveText;
  // A 409 proves a newer version exists even when the watch hasn't delivered it yet (lagging or reconnecting).
  const isStale =
    isDirty &&
    (edit.base.metadata.resourceVersion !== obj.metadata.resourceVersion ||
      isApiError(update.error, 'Kubernetes.Conflict'));
  const error = clientError ?? (update.error === null ? null : errorMessage(update.error));

  const onChange = (next: string) => {
    if (edit) {
      // Typing back to the original text makes the editor clean (and live) again.
      setEdit(next === baseText ? null : { ...edit, text: next });
    } else if (next !== liveText) {
      setEdit({ base: obj, text: next });
    }
  };

  const reload = () => {
    setEdit(null);
    setClientError(null);
    setSuccess(null);
    update.reset();
  };

  const save = () => {
    if (!isEditable || update.isPending) return;
    setSuccess(null);
    update.reset();
    const parsed = parseEdited(text, edit?.base ?? obj);
    if (!parsed.ok) {
      setClientError(parsed.message);
      return;
    }
    setClientError(null);
    // The hook puts the saved object into the cache, so the clean editor shows it (with its new resourceVersion).
    update.mutate(parsed.obj, {
      onSuccess: (saved) => {
        setEdit(null);
        setSuccess(`${name} has been updated to version ${saved.metadata.resourceVersion ?? ''}`);
      },
    });
  };

  return (
    <div ref={fullscreenRef} className={css(styles.page, fullscreen.isFullscreen && styles.fullscreen)}>
      <div className={styles.yamlEditor}>
        <YamlEditor
          value={text}
          onChange={onChange}
          isReadOnly={!isEditable || update.isPending}
          onSave={isEditable ? save : undefined}
          fullscreen={fullscreen}
        />
        <div className={styles.buttons}>
          {access.disabledReason !== undefined && (
            <Alert className={styles.alert} variant="info" isInline title={access.disabledReason} />
          )}
          {error !== null && (
            <Alert
              className={css(styles.alert, styles.scrollable)}
              variant="danger"
              isInline
              isLiveRegion
              title="An error occurred"
            >
              <div className={styles.preLine}>{error}</div>
            </Alert>
          )}
          {success !== null && <Alert className={styles.alert} variant="success" isInline title={success} />}
          {isStale && (
            <Alert className={styles.alert} variant="info" isInline title="This object has been updated.">
              Click reload to see the new version.
            </Alert>
          )}
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <ActionGroup className={styles.actionGroup}>
              {!isReadOnly && (
                <Button
                  type="submit"
                  variant="primary"
                  // A defined `isLoading` (even false) reserves spinner room and widens the button.
                  isLoading={update.isPending ? true : undefined}
                  isAriaDisabled={!isEditable || update.isPending}
                >
                  Save
                </Button>
              )}
              <Button variant="secondary" onClick={reload}>
                Reload
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void navigate(resourcePath(cluster, model, { namespace: obj.metadata.namespace, name }))
                }
              >
                Cancel
              </Button>
              {!isReadOnly && (
                <Flex
                  className={styles.target}
                  spaceItems={{ default: 'spaceItemsSm' }}
                  flexWrap={{ default: 'nowrap' }}
                >
                  <FlexItem>{`Saving to ${cluster}`}</FlexItem>
                  {environment && (
                    <FlexItem>
                      <EnvironmentLabel environment={environment} isCompact />
                    </FlexItem>
                  )}
                </Flex>
              )}
              <Button
                component="a"
                href={yamlDataUrl(text)}
                download={`${obj.kind.toLowerCase()}-${name}.yaml`}
                variant="secondary"
                icon={<RhUiDownloadIcon />}
                className={css(styles.alignRight, 'pf-v6-u-display-none pf-v6-u-display-flex-on-sm')}
              >
                Download
              </Button>
            </ActionGroup>
          </Form>
        </div>
      </div>
      <UnsavedChangesGuard when={isDirty} name={name} cluster={cluster} />
    </div>
  );
}
