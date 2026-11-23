import { LogViewer } from '@patternfly/react-log-viewer';
import { css } from '@patternfly/react-styles';
import { useEffect, useRef, useState } from 'react';
import { useFullscreen } from '@/shared/hooks';
import { podLogPath, type Pod } from '@/shared/k8s';
import { useTheme } from '@/shared/theme';
import { useResourceDetails } from '../../details/detailsContext';
import { ContainerSelect } from '../ContainerSelect';
import { useSelectedContainer } from '../useSelectedContainer';
import { LogFooter } from './LogFooter';
import { LogStatusBanner } from './LogStatusBanner';
import { LogToolbar } from './LogToolbar';
import styles from './PodLogsTab.module.css';
import { useLogPreferences } from './useLogPreferences';
import { usePodLog } from './usePodLog';

/** The part of the viewer's (react-window) list handle the tab uses; OCP scrolls the same way. */
interface LogListHandle {
  scrollToBottom: () => void;
}

/** The status of `container` (init containers included), as the live pod reports it. */
function containerStatus(pod: Pod, container: string) {
  return [...(pod.status?.containerStatuses ?? []), ...(pod.status?.initContainerStatuses ?? [])].find(
    ({ name }) => name === container,
  );
}

/**
 * Logs tab of a Pod (OCP `PodLogs` + `ResourceLog`, LOG-2…10): the container's log in a PF `LogViewer` with OCP's
 * toolbar, line-count banner and "Resume stream" footer, streamed by {@link usePodLog}. Scrolling up pauses (the shown
 * lines freeze, new ones are counted), scrolling to the bottom or "Resume stream" follows the tail again. Choosing
 * another container returns to the current log, as OCP. A stream that failed because the container was not running
 * yet restarts when the live pod shows it running.
 */
export function PodLogsTab() {
  const { cluster, obj } = useResourceDetails();
  const pod = obj as Pod;
  const namespace = pod.metadata?.namespace ?? '';
  const name = pod.metadata?.name ?? '';
  const [container, selectContainer] = useSelectedContainer(pod);
  const { theme } = useTheme();
  const { wrapLines, setWrapLines, showFullLog, setShowFullLog } = useLogPreferences();
  const [previous, setPrevious] = useState(false);
  const [paused, setPaused] = useState(false);
  const { ref: fullscreenRef, isFullscreen, isSupported, toggle: toggleFullscreen } = useFullscreen();
  const listRef = useRef<LogListHandle>(null);

  const status = containerStatus(pod, container);
  const isRunning = status?.state?.running !== undefined;
  const log = usePodLog({
    cluster,
    namespace,
    pod: name,
    container,
    previous,
    showFull: showFullLog,
    paused,
    isContainerRunning: isRunning,
  });
  const isWaiting = status?.state?.waiting !== undefined && log.error?.status === 400;

  // The container started after its log request failed (e.g. "waiting to start"): stream again, as OCP restarts its
  // socket when the log source status changes.
  const [wasRunning, setWasRunning] = useState(isRunning);
  if (wasRunning !== isRunning) {
    setWasRunning(isRunning);
    if (isRunning && log.error) log.reconnect();
  }

  // Follow the tail while streaming or at the end; the timeout lets the viewer render the new lines first (OCP).
  const following = log.status === 'streaming' || log.status === 'eof';
  useEffect(() => {
    if (!following || log.lines.length === 0) return undefined;
    const timer = setTimeout(() => listRef.current?.scrollToBottom(), 1);
    return () => clearTimeout(timer);
  }, [following, log.lines]);

  // The viewer measures its height only on window `resize`: after entering or leaving full screen it would keep the
  // old height (the page scrolls after Collapse). OCP `resource-log.tsx` dispatches the same event.
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [isFullscreen]);

  // The viewer only reads its data (PF types it mutable): pass the hook's array as is, no copy per update.
  const data = log.lines as string[];

  const changeContainer = (next: string): void => {
    setPrevious(false);
    setPaused(false);
    selectContainer(next);
  };

  return (
    <div ref={fullscreenRef} className={css(styles.log, isFullscreen && styles.expanded)}>
      <LogViewer
        ref={listRef}
        data={data}
        theme={theme}
        height="100%"
        hasLineNumbers={false}
        isTextWrapped={wrapLines}
        initialIndexWidth={7}
        header={
          <LogStatusBanner
            lineCount={log.lines.length}
            status={log.status}
            error={log.error}
            isWaiting={isWaiting}
            onRetry={log.reconnect}
          />
        }
        toolbar={
          <LogToolbar
            status={log.status}
            onTogglePlay={() => setPaused((was) => !was)}
            containerSelect={<ContainerSelect pod={pod} value={container} onChange={changeContainer} />}
            previous={previous}
            onPreviousChange={(next) => {
              setPrevious(next);
              setPaused(false);
            }}
            hasPreviousLog={(status?.restartCount ?? 0) > 0}
            showFullLog={showFullLog}
            onShowFullLogChange={setShowFullLog}
            wrapLines={wrapLines}
            onWrapLinesChange={setWrapLines}
            logHref={podLogPath(cluster, namespace, name, { container, previous })}
            downloadName={`${[name, container].filter(Boolean).join('-')}.log`}
            canExpand={isSupported}
            isExpanded={isFullscreen}
            onToggleExpand={toggleFullscreen}
          />
        }
        footer={
          <LogFooter
            paused={log.status === 'paused'}
            linesBehind={log.linesBehind}
            onResume={() => setPaused(false)}
          />
        }
        onScroll={({ scrollOffsetToBottom, scrollDirection, scrollUpdateWasRequested }) => {
          // Only the user's scrolling counts, not the viewer following the tail (OCP `onScroll`).
          if (scrollUpdateWasRequested || log.status === 'eof') return;
          if (scrollOffsetToBottom < 1) setPaused(false);
          else if (scrollDirection === 'backward') setPaused(true);
        }}
      />
    </div>
  );
}
