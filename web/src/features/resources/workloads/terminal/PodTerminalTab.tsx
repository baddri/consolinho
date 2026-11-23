import {
  Alert,
  AlertActionLink,
  Bullseye,
  Button,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Skeleton,
  Spinner,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import { CubesIcon, LockIcon, RhUiCompressIcon, RhUiExpandIcon } from '@patternfly/react-icons';
import type { ComponentType } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { execUrl, PodModel, type Pod } from '@/shared/k8s';
import { XTerm, type XTermHandle } from '@/shared/ui/terminal';
import {
  readOnlyGrantReason,
  USER_READ_ONLY_REASON,
  useResourceAccess,
} from '../../actions/useResourceAccess';
import { useResourceDetails } from '../../details/detailsContext';
import { useFullscreen } from '../../yaml/useFullscreen';
import { ContainerLabel, ContainerSelect } from '../ContainerSelect';
import { containerNames } from '../containers';
import { useSelectedContainer } from '../useSelectedContainer';
import styles from './PodTerminalTab.module.css';
import { useExecSession } from './useExecSession';

/** OCP's TERM-3 copy when the server gave no close reason. */
export const CONNECTION_CLOSED = 'The terminal connection has closed.';

/** Red line in the terminal, as OCP `onConnectionClosed`. */
const redLine = (text: string) => `\x1b[31m${text}\x1b[m\r\n`;

/** Names of the pod's containers that are running (only those can be exec'd into). */
function runningContainers(pod: Pod): Set<string> {
  return new Set((pod.status?.containerStatuses ?? []).filter((s) => s.state?.running).map((s) => s.name));
}

/** Empty state in place of the terminal, at the top of the tab like other tab empty states (UX.md §10). */
function TerminalEmptyState({ title, body, icon }: { title: string; body: string; icon: ComponentType }) {
  return (
    <EmptyState titleText={title} headingLevel="h2" icon={icon}>
      <EmptyStateBody>{body}</EmptyStateBody>
    </EmptyState>
  );
}

/**
 * Terminal tab of a Pod (OCP `PodConnectLoader`/`PodConnect`, TERM-1..5): gated by `create pods/exec` (read-only user
 * or grant → TERM-4 copy, cluster RBAC → its reason; no socket either way) and by the pod running (TERM-5), then
 * {@link PodConnect}. Lazy route module, so xterm loads only here.
 */
export function PodTerminalTab() {
  const { cluster, obj } = useResourceDetails();
  const pod = obj as Pod;
  const namespace = pod.metadata?.namespace;
  const access = useResourceAccess(cluster, {
    verb: 'create',
    model: PodModel,
    subresource: 'exec',
    namespace,
    name: pod.metadata?.name,
  });

  if (access.isChecking) return <Skeleton height="24rem" screenreaderText="Loading terminal" />;
  if (access.disabledReason !== undefined) {
    const isFleetReadOnly =
      access.disabledReason === USER_READ_ONLY_REASON ||
      access.disabledReason === readOnlyGrantReason(cluster);
    return (
      <TerminalEmptyState
        title="Terminal not available"
        icon={LockIcon}
        body={
          isFleetReadOnly
            ? `You have read-only access to ${cluster}. The terminal is not available.`
            : access.disabledReason
        }
      />
    );
  }
  if (pod.status?.phase !== 'Running') {
    return (
      <TerminalEmptyState
        title="Pod is not running"
        icon={CubesIcon}
        body="The terminal connects to a running container. It is available when the pod is running."
      />
    );
  }
  return <PodConnect cluster={cluster} pod={pod} />;
}

/**
 * OCP `PodConnect`: toolbar "Connecting to" + container (select when there are several; non-running ones disabled)
 * and "Expand"; on close a warning `Alert` with "Reconnect" (TERM-3); then the terminal. Switching container closes
 * the session and opens one on the new container (TERM-2).
 */
function PodConnect({ cluster, pod }: { cluster: string; pod: Pod }) {
  const [container, selectContainer] = useSelectedContainer(pod, { includeInit: false });
  const running = runningContainers(pod);
  const isContainerRunning = running.has(container);
  const terminalRef = useRef<XTermHandle>(null);
  const { ref: fullscreenRef, isFullscreen, isSupported, toggle } = useFullscreen();

  const url = isContainerRunning
    ? execUrl(
        cluster,
        pod.metadata?.namespace ?? '',
        pod.metadata?.name ?? '',
        { container },
        globalThis.location.href,
      )
    : undefined;
  const session = useExecSession({
    url,
    onOpen: useCallback(() => {
      terminalRef.current?.reset();
      terminalRef.current?.focus();
    }, []),
    onOutput: useCallback((bytes: Uint8Array) => terminalRef.current?.write(bytes), []),
    onFailure: useCallback((message: string) => terminalRef.current?.write(redLine(message)), []),
  });
  const isClosed = url !== undefined && session.state === 'closed';
  const hasManyContainers = containerNames(pod).length > 1;
  const closeMessage = session.closeReason ?? CONNECTION_CLOSED;

  useEffect(() => {
    if (isClosed) terminalRef.current?.write(redLine(closeMessage));
  }, [isClosed, closeMessage]);

  return (
    <div ref={fullscreenRef} className={styles.connect}>
      <Toolbar>
        <ToolbarContent alignItems="center">
          <Flex direction={{ default: 'column', sm: 'row' }} alignItems={{ sm: 'alignItemsCenter' }}>
            <FlexItem>Connecting to</FlexItem>
            <FlexItem>
              {hasManyContainers ? (
                <ContainerSelect
                  pod={pod}
                  value={container}
                  onChange={selectContainer}
                  includeInit={false}
                  isOptionDisabled={(name) => !running.has(name)}
                />
              ) : (
                <ContainerLabel name={container} />
              )}
            </FlexItem>
          </Flex>
          {isContainerRunning && !isClosed && isSupported && (
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button
                  variant="link"
                  icon={isFullscreen ? <RhUiCompressIcon /> : <RhUiExpandIcon />}
                  onClick={toggle}
                >
                  {isFullscreen ? 'Collapse' : 'Expand'}
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          )}
        </ToolbarContent>
      </Toolbar>
      {isClosed && (
        <Alert
          variant="warning"
          isInline
          title={closeMessage}
          className="pf-v6-u-mb-md"
          actionLinks={<AlertActionLink onClick={session.reconnect}>Reconnect</AlertActionLink>}
        />
      )}
      <div className={styles.body}>
        {isContainerRunning ? (
          <div className={styles.fill}>
            <XTerm
              ref={terminalRef}
              aria-label={`Terminal of container ${container}`}
              onData={session.write}
              onResize={session.resize}
              isInputDisabled={session.state !== 'open'}
            />
            {session.state === 'connecting' && (
              // OCP shows `LoadingBox` until the socket opens. The terminal stays mounted underneath so the first
              // output (the prompt) is not lost and its fitted size is ready to send on open.
              <Bullseye className={styles.loading}>
                <Spinner size="xl" aria-label="Connecting to the terminal" />
              </Bullseye>
            )}
          </div>
        ) : (
          <TerminalEmptyState
            title="Container is not running"
            icon={CubesIcon}
            body={
              hasManyContainers
                ? `Container ${container} is not running. Choose a running container.`
                : `Container ${container} is not running.`
            }
          />
        )}
      </div>
    </div>
  );
}
