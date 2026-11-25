import { Button, Icon, Popover, Skeleton } from '@patternfly/react-core';
import {
  RhUiCheckCircleFillIcon,
  RhUiErrorFillIcon,
  RhUiSyncIcon,
  RhUiUnknownIcon,
  RhUiWarningFillIcon,
} from '@patternfly/react-icons';
import type { ComponentType, ReactNode } from 'react';
import styles from './Overview.module.css';

/** OCP `HealthState` as far as this dashboard uses it (`status-card/states.tsx`). */
export type HealthState = 'ok' | 'updating' | 'warning' | 'error' | 'unknown' | 'notAvailable' | 'loading';

/** Icon and PF icon status per state (OCP `healthStateMapping`: green check, blue sync, yellow triangle, …). */
const HEALTH_ICONS: Record<
  Exclude<HealthState, 'loading'>,
  {
    glyph: ComponentType<{ title?: string }>;
    status?: 'success' | 'info' | 'warning' | 'danger';
    title: string;
  }
> = {
  ok: { glyph: RhUiCheckCircleFillIcon, status: 'success', title: 'Healthy' },
  updating: { glyph: RhUiSyncIcon, status: 'info', title: 'Updating' },
  warning: { glyph: RhUiWarningFillIcon, status: 'warning', title: 'Warning' },
  error: { glyph: RhUiErrorFillIcon, status: 'danger', title: 'Error' },
  unknown: { glyph: RhUiUnknownIcon, title: 'Unknown' },
  notAvailable: { glyph: RhUiUnknownIcon, title: 'Not available' },
};

/** OCP's health-state icon (`HealthItemIcon`); `size` `heading_2xl` in the Status card, inline in popovers. */
export function HealthIcon({
  state,
  size,
}: {
  state: Exclude<HealthState, 'loading'>;
  size?: 'heading_2xl';
}) {
  const { glyph: Glyph, status, title } = HEALTH_ICONS[state];
  return (
    <Icon status={status} size={size} isInline={!size} className={size ? styles.healthIcon : undefined}>
      <Glyph title={title} />
    </Icon>
  );
}

/** Props for {@link HealthItem}. */
export interface HealthItemProps {
  title: string;
  state: HealthState;
  /** Secondary text under the title ("Degraded", "1 degraded"); hidden while loading. */
  detail?: string;
  /** Popover (header + body) opened by the title, as OCP's operator status popup. */
  popover?: { header: string; body: ReactNode };
}

/**
 * One Status card health item (OCP `HealthItem`): a large state icon, the title (a link button opening `popover` when
 * given) and the secondary text. While loading the icon is a round skeleton.
 */
export function HealthItem({ title, state, detail, popover }: HealthItemProps) {
  const loading = state === 'loading';
  return (
    <div className={styles.healthItem}>
      {loading ? (
        <Skeleton shape="circle" width="1.5rem" screenreaderText={`Loading ${title} status`} />
      ) : (
        <HealthIcon state={state} size="heading_2xl" />
      )}
      <div>
        <span className={styles.healthItemText}>
          {popover && !loading ? (
            <Popover
              position="top"
              headerContent={popover.header}
              bodyContent={popover.body}
              maxWidth="21rem"
            >
              <Button variant="link" isInline className={styles.popupButton}>
                {title}
              </Button>
            </Popover>
          ) : (
            title
          )}
        </span>
        {!loading && detail && (
          <span className={`${styles.healthItemText} pf-v6-u-text-color-subtle`}>{detail}</span>
        )}
      </div>
    </div>
  );
}
