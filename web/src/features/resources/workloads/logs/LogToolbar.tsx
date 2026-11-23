import {
  Button,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  ToolbarToggleGroup,
  Tooltip,
  type MenuToggleElement,
} from '@patternfly/react-core';
import {
  RhUiCompressIcon,
  RhUiDownloadIcon,
  RhUiExpandIcon,
  RhUiExternalLinkIcon,
  RhUiSearchIcon,
} from '@patternfly/react-icons';
import { LogViewerSearch } from '@patternfly/react-log-viewer';
import { useState, type ReactNode, type Ref } from 'react';
import { TogglePlay } from '@/shared/ui';
import type { PodLogStatus } from './usePodLog';
import styles from './PodLogsTab.module.css';

/** OCP `streamStatusMessages` (`resource-log.tsx`): the play/pause tooltip and the previous log's status text. */
const STATUS_MESSAGES: Record<PodLogStatus, string> = {
  eof: 'Log stream ended.',
  loading: 'Loading log...',
  paused: 'Log stream paused.',
  streaming: 'Log streaming...',
};

/** Props for {@link LogToolbar}. */
export interface LogToolbarProps {
  status: PodLogStatus;
  /** Toggles between streaming and paused (the round play/pause button). */
  onTogglePlay: () => void;
  /** The container picker. */
  containerSelect: ReactNode;
  previous: boolean;
  onPreviousChange: (previous: boolean) => void;
  /** The container restarted, so its previous instance has a log (OCP `hasPreviousLogs`). */
  hasPreviousLog: boolean;
  showFullLog: boolean;
  onShowFullLogChange: (full: boolean) => void;
  wrapLines: boolean;
  onWrapLinesChange: (wrap: boolean) => void;
  /** Plain log URL (no `follow`, no `timestamps`) behind "View raw logs" and "Download" (LOG-9). */
  logHref: string;
  downloadName: string;
  /** The browser allows full screen (OCP `canUseFullScreen`); "Expand" is hidden otherwise. */
  canExpand: boolean;
  /** The log fills the screen (Fullscreen API); Esc leaves it natively. */
  isExpanded: boolean;
  onToggleExpand: () => void;
}

/** OCP `playPauseButton`: a spinner while loading, play/pause while streaming, nothing at the end (the banner says it). */
function StreamControl({
  status,
  previous,
  onTogglePlay,
}: Pick<LogToolbarProps, 'status' | 'previous' | 'onTogglePlay'>) {
  if (previous) return <ToolbarItem>{STATUS_MESSAGES.eof}</ToolbarItem>;
  if (status === 'eof') return null;
  if (status === 'loading') {
    return (
      <ToolbarItem>
        <Spinner size="lg" aria-label={STATUS_MESSAGES.loading} />
      </ToolbarItem>
    );
  }
  return (
    <ToolbarItem>
      <Tooltip content={STATUS_MESSAGES[status]}>
        <TogglePlay active={status === 'streaming'} onClick={onTogglePlay} className={styles.togglePlay} />
      </Tooltip>
    </ToolbarItem>
  );
}

/** OCP's "Options" settings menu: "Show full log" and "Wrap lines" checkbox options. */
function LogOptions({
  showFullLog,
  onShowFullLogChange,
  wrapLines,
  onWrapLinesChange,
}: Pick<LogToolbarProps, 'showFullLog' | 'onShowFullLogChange' | 'wrapLines' | 'onWrapLinesChange'>) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Select
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onSelect={(_event, value) => {
        if (value === 'fullLog') onShowFullLogChange(!showFullLog);
        if (value === 'wrapLines') onWrapLinesChange(!wrapLines);
      }}
      popperProps={{ appendTo: 'inline' }}
      toggle={(toggleRef: Ref<MenuToggleElement>) => (
        <MenuToggle ref={toggleRef} onClick={() => setIsOpen((open) => !open)} isExpanded={isOpen} isSettings>
          <span className="pf-v6-u-display-none pf-v6-u-display-inline-on-lg">Options</span>
        </MenuToggle>
      )}
    >
      <SelectList aria-label="Log options">
        <Tooltip
          content="Select to view the entire log. Default view is the last 1,000 lines."
          position="right"
        >
          <SelectOption value="fullLog" isSelected={showFullLog} hasCheckbox>
            Show full log
          </SelectOption>
        </Tooltip>
        <SelectOption value="wrapLines" isSelected={wrapLines} hasCheckbox>
          Wrap lines
        </SelectOption>
      </SelectList>
    </Select>
  );
}

/** OCP's "Log type" select (Current log / Previous log); disabled with a tooltip until the container restarted. */
function LogTypeSelect({
  previous,
  onPreviousChange,
  hasPreviousLog,
}: Pick<LogToolbarProps, 'previous' | 'onPreviousChange' | 'hasPreviousLog'>) {
  const [isOpen, setIsOpen] = useState(false);
  const select = (
    <Select
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      selected={previous ? 'previous' : 'current'}
      onSelect={(_event, value) => {
        onPreviousChange(value === 'previous');
        setIsOpen(false);
      }}
      popperProps={{ appendTo: 'inline' }}
      toggle={(toggleRef: Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => setIsOpen((open) => !open)}
          isExpanded={isOpen}
          isDisabled={!hasPreviousLog}
          aria-label="Log type"
        >
          {previous ? 'Previous log' : 'Current log'}
        </MenuToggle>
      )}
    >
      <SelectList aria-label="Log type">
        <SelectOption value="current">Current log</SelectOption>
        <SelectOption value="previous">Previous log</SelectOption>
      </SelectList>
    </Select>
  );
  if (hasPreviousLog) return select;
  // A disabled button gets no pointer events in some browsers: the tooltip listens on a wrapper.
  return (
    <Tooltip content="Only the current log is available for this container.">
      <span>{select}</span>
    </Tooltip>
  );
}

/**
 * The Logs tab toolbar (OCP `resource-log.tsx` `LogControls`, LOG-2): stream control, container picker and options
 * on the left; search, log type and the plain "View raw logs", "Download" and "Expand"/"Collapse" actions on the
 * right. Searching pauses a streaming log, as OCP, so matches don't scroll away.
 */
export function LogToolbar(props: LogToolbarProps) {
  const { status, onTogglePlay, logHref, downloadName, canExpand, isExpanded, onToggleExpand } = props;
  return (
    <Toolbar>
      <ToolbarContent>
        <ToolbarGroup className="pf-v6-u-display-flex pf-v6-u-flex-direction-column pf-v6-u-flex-direction-row-on-md pf-v6-u-w-100">
          <ToolbarGroup align={{ default: 'alignStart' }}>
            <StreamControl status={status} previous={props.previous} onTogglePlay={onTogglePlay} />
            <ToolbarItem>{props.containerSelect}</ToolbarItem>
            <ToolbarItem>
              <LogOptions
                showFullLog={props.showFullLog}
                onShowFullLogChange={props.onShowFullLogChange}
                wrapLines={props.wrapLines}
                onWrapLinesChange={props.onWrapLinesChange}
              />
            </ToolbarItem>
          </ToolbarGroup>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarGroup>
              <ToolbarToggleGroup toggleIcon={<RhUiSearchIcon />} breakpoint="lg">
                <ToolbarItem>
                  <LogViewerSearch
                    placeholder="Search logs"
                    minSearchChars={0}
                    aria-label="Search logs"
                    onFocus={() => {
                      if (status === 'streaming') onTogglePlay();
                    }}
                  />
                </ToolbarItem>
              </ToolbarToggleGroup>
              <ToolbarItem>
                <LogTypeSelect
                  previous={props.previous}
                  onPreviousChange={props.onPreviousChange}
                  hasPreviousLog={props.hasPreviousLog}
                />
              </ToolbarItem>
            </ToolbarGroup>
            <ToolbarGroup variant="action-group-plain">
              <ToolbarItem>
                <Tooltip content="View raw logs">
                  <Button
                    variant="plain"
                    component="a"
                    href={logHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    icon={<RhUiExternalLinkIcon />}
                    aria-label="View raw logs"
                  />
                </Tooltip>
              </ToolbarItem>
              <ToolbarItem>
                <Tooltip content="Download">
                  <Button
                    variant="plain"
                    component="a"
                    href={logHref}
                    download={downloadName}
                    icon={<RhUiDownloadIcon />}
                    aria-label="Download"
                  />
                </Tooltip>
              </ToolbarItem>
              {canExpand && (
                <ToolbarItem>
                  <Tooltip content={isExpanded ? 'Collapse' : 'Expand'}>
                    <Button
                      variant="plain"
                      onClick={onToggleExpand}
                      icon={isExpanded ? <RhUiCompressIcon /> : <RhUiExpandIcon />}
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    />
                  </Tooltip>
                </ToolbarItem>
              )}
            </ToolbarGroup>
          </ToolbarGroup>
        </ToolbarGroup>
      </ToolbarContent>
    </Toolbar>
  );
}
