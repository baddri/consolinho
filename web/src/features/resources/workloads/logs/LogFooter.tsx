import { Button } from '@patternfly/react-core';
import { RhUiPlayCircleIcon } from '@patternfly/react-icons';
import { css } from '@patternfly/react-styles';
import styles from './PodLogsTab.module.css';

/** Props for {@link LogFooter}. */
export interface LogFooterProps {
  /** Shown only while paused; otherwise kept invisible (and inert) so the viewer doesn't change height. */
  paused: boolean;
  linesBehind: number;
  onResume: () => void;
}

/**
 * The log viewer footer (OCP `resource-log.tsx` `FooterButton`, LOG-7/8): a block button that resumes a paused stream,
 * naming how many lines arrived meanwhile. Always rendered and hidden while streaming, as OCP's
 * `log-window__footer--hidden`, so pausing doesn't resize the viewer.
 */
export function LogFooter({ paused, linesBehind, onResume }: LogFooterProps) {
  const text =
    linesBehind > 0
      ? `Resume stream and show ${linesBehind} new ${linesBehind === 1 ? 'line' : 'lines'}`
      : 'Resume stream';
  return (
    <div className={css(!paused && styles.footerHidden)} inert={!paused}>
      <Button icon={<RhUiPlayCircleIcon />} onClick={onResume} isBlock>
        {text}
      </Button>
    </div>
  );
}
