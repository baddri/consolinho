import { Button } from '@patternfly/react-core';
import { RhUiPauseFillIcon, RhUiPlayFillIcon } from '@patternfly/react-icons';
import { css } from '@patternfly/react-styles';
import styles from './TogglePlay.module.css';

/** Props for {@link TogglePlay}. */
export interface TogglePlayProps {
  /** Streaming is running: shows the pause icon and the green ring. */
  active: boolean;
  onClick: () => void;
  /** Placement tweaks from the caller (e.g. the events timeline offset). */
  className?: string;
}

/**
 * OCP `TogglePlay` (`public/components/utils/toggle-play.tsx`): the round pause/play button used by the Events stream
 * and Pod logs. The aria-labels are OCP's, which say "event streaming" in both places.
 */
export function TogglePlay({ active, onClick, className }: TogglePlayProps) {
  return (
    <Button
      variant="plain"
      icon={active ? <RhUiPauseFillIcon /> : <RhUiPlayFillIcon />}
      className={css(styles.togglePlay, active && styles.active, className)}
      onClick={onClick}
      aria-label={active ? 'Pause event streaming' : 'Start streaming events'}
    />
  );
}
