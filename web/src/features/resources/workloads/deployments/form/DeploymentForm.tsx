import { ActionGroup, Alert, Button, Flex, FlexItem, PageSection, Title } from '@patternfly/react-core';
import { RhUiDownloadIcon } from '@patternfly/react-icons';
import { css } from '@patternfly/react-styles';
import { Navigate, useNavigate } from 'react-router';
import { useAccessibleClusters } from '@/features/cluster-context';
import { useFullscreen } from '@/shared/hooks';
import { DeploymentModel } from '@/shared/k8s';
import { EnvironmentLabel, FlexForm, FormFooter } from '@/shared/ui';
import { useResourceAccess } from '../../../actions/useResourceAccess';
import { resourcePath } from '../../../paths';
import { UnsavedChangesGuard } from '../../../yaml/UnsavedChangesGuard';
import { YamlEditor } from '../../../yaml/YamlEditor';
import { DeploymentFormEditor } from './DeploymentFormEditor';
import type { DeploymentObject } from './deploymentFormValues';
import styles from './EditDeployment.module.css';
import { EditorToggle } from './EditorToggle';
import { useDeploymentEditor } from './useDeploymentEditor';

/** `data:` URL of `text` as a YAML file, for the Download link (as on the YAML tab). */
const yamlDataUrl = (text: string) => `data:text/yaml;charset=utf-8,${encodeURIComponent(text)}`;

/** Props for {@link DeploymentForm}. */
export interface DeploymentFormProps {
  cluster: string;
  /** The watched Deployment; the edit starts from the version present at mount (or Reload). */
  live: DeploymentObject;
}

/**
 * Edit Deployment form (OCP `EditDeploymentForm` in a `FlexForm`): heading, the "Configure via:" toggle, the form or
 * YAML view, then the sticky footer with alerts and Save · Reload · Cancel (· Download in YAML view). State lives in
 * {@link useDeploymentEditor}; this component renders it.
 *
 * - **Read-only** (ACT-4, from `useResourceAccess` update): fields disabled, YAML read-only, the reason as an info
 *   alert, no Save and no "Saving to" cue. While the check runs everything is read-only too.
 * - **Save** is disabled until something changed and while the form has errors (OCP `!dirty || !isEmpty(errors)`); success navigates to the details page.
 * - **Cancel** goes to the details page; `UnsavedChangesGuard` asks first while the edit is dirty.
 */
export function DeploymentForm({ cluster, live }: DeploymentFormProps) {
  const { namespace, name = '' } = live.metadata;
  const access = useResourceAccess(cluster, { verb: 'update', model: DeploymentModel, namespace, name });
  const isEditable = !access.isChecking && access.disabledReason === undefined;
  const isReadOnly = access.disabledReason !== undefined;
  const editor = useDeploymentEditor(cluster, live, isEditable);
  const environment = useAccessibleClusters().data?.find((entry) => entry.name === cluster)?.environment;
  const navigate = useNavigate();
  const { ref: fullscreenRef, ...fullscreen } = useFullscreen();
  const detailsPath = resourcePath(cluster, DeploymentModel, { namespace, name });

  if (editor.saved !== null) return <Navigate to={detailsPath} />;

  return (
    <FlexForm onSubmit={editor.submit} aria-label="Edit Deployment">
      <PageSection isFilled hasBodyWrapper={false} className={styles.body}>
        <Title headingLevel="h1" size="2xl">
          Edit Deployment
        </Title>
        <EditorToggle value={editor.view} onChange={editor.changeView} />
        {editor.yamlWarning !== null && (
          <Alert
            className={styles.yamlWarning}
            variant="danger"
            isInline
            title="Invalid YAML cannot be persisted"
          >
            <p>{editor.yamlWarning}</p>
            <p className="pf-v6-u-mb-sm">Switching to form view will delete any invalid YAML.</p>
            <Button variant="danger" onClick={editor.confirmSwitchToForm}>
              Switch and delete
            </Button>
            {'\u00a0'}
            <Button variant="secondary" onClick={editor.dismissYamlWarning}>
              Cancel
            </Button>
          </Alert>
        )}
        {editor.view === 'form' ? (
          <DeploymentFormEditor control={editor.form.control} name={name} />
        ) : (
          <div
            ref={fullscreenRef}
            className={css(styles.yamlView, fullscreen.isFullscreen && styles.fullscreen)}
          >
            <YamlEditor
              value={editor.yamlText}
              onChange={editor.setYamlText}
              isReadOnly={!isEditable || editor.isSaving}
              fullscreen={fullscreen}
            />
          </div>
        )}
      </PageSection>
      <FormFooter
        actions={
          <ActionGroup>
            {!isReadOnly && (
              <Button
                type="submit"
                variant="primary"
                // A defined `isLoading` (even false) reserves spinner room and widens the button.
                isLoading={editor.isSaving ? true : undefined}
                isDisabled={!editor.isDirty || editor.hasErrors || editor.isSaving}
              >
                Save
              </Button>
            )}
            <Button variant="secondary" onClick={editor.reload}>
              Reload
            </Button>
            <Button variant="secondary" onClick={() => void navigate(detailsPath)}>
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
            {editor.view === 'yaml' && (
              <Button
                component="a"
                href={yamlDataUrl(editor.yamlText)}
                download={`deployment-${name}.yaml`}
                variant="secondary"
                icon={<RhUiDownloadIcon />}
                className={css(styles.alignRight, 'pf-v6-u-display-none pf-v6-u-display-flex-on-sm')}
              >
                Download
              </Button>
            )}
          </ActionGroup>
        }
      >
        {access.disabledReason !== undefined && (
          <Alert variant="info" isInline title={access.disabledReason} />
        )}
        {editor.error !== null && (
          <Alert variant="danger" isInline isLiveRegion title="An error occurred">
            {editor.error}
          </Alert>
        )}
        {editor.isStale && (
          <Alert variant="info" isInline title="This object has been updated.">
            Click reload to see the new version.
          </Alert>
        )}
      </FormFooter>
      <UnsavedChangesGuard when={editor.isDirty} name={name} cluster={cluster} />
    </FlexForm>
  );
}
