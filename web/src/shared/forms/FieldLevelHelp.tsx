import { Button, Popover } from '@patternfly/react-core';
import { RhUiQuestionMarkCircleIcon } from '@patternfly/react-icons';
import type { ReactNode } from 'react';
import styles from './FieldLevelHelp.module.css';

/** Props for {@link FieldLevelHelp}. */
export interface FieldLevelHelpProps {
  /** The popover body, usually one or more `Content` paragraphs. */
  children: ReactNode;
}

/**
 * The "?" next to a form label that opens a help popover, as OCP's `FieldLevelHelp` (`field-level-help.tsx`): an inline
 * link button with a 12px question-mark icon, 5px after the label. Pass it as a field's `labelHelp`. PF's
 * `FormGroupLabelHelp` is not used because it renders a plain (grey) button, not OCP's link-coloured one.
 */
export function FieldLevelHelp({ children }: FieldLevelHelpProps) {
  return (
    <Popover aria-label="Help" bodyContent={children}>
      <Button
        variant="link"
        isInline
        aria-label="Help"
        className={styles.help}
        icon={<RhUiQuestionMarkCircleIcon className={styles.icon} />}
      />
    </Popover>
  );
}
