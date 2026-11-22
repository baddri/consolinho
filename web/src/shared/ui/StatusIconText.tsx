import { Flex, FlexItem, Icon, Label } from '@patternfly/react-core';
import {
  RhUiBanIcon,
  RhUiCheckCircleFillIcon,
  RhUiErrorFillIcon,
  RhUiInformationFillIcon,
  RhUiInProgressIcon,
  RhUiSyncIcon,
  RhUiUnknownIcon,
  RhUiWarningFillIcon,
} from '@patternfly/react-icons';
import type { ComponentType } from 'react';

/**
 * Feature-free status vocabulary (OCP `console-dynamic-plugin-sdk/.../status/Status.tsx` icon families); each feature
 * maps its own enum to it in one adapter, k8s status words go through {@link statusKindOf}.
 * - `success` green check, `danger` red exclamation, `warning` yellow triangle, `info` blue info;
 * - `pending` in-progress icon, `progress` sync icon, `ban` ban icon, `unknown` unknown icon (all uncoloured);
 * - `neutral` text only.
 */
export type StatusKind =
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'pending'
  | 'progress'
  | 'ban'
  | 'unknown'
  | 'neutral';

/** Props for {@link StatusIconText}. */
export interface StatusIconTextProps {
  status: StatusKind;
  text: string;
  /** Outlined compact `Label` with the icon — only for a details-page title (`UX.md` §3). */
  asLabel?: boolean;
}

/** The `rh-ui-*` icons OCP uses per family (`status/icons.tsx`, `Status.tsx`). */
const ICONS: Record<StatusKind, ComponentType | null> = {
  success: RhUiCheckCircleFillIcon,
  danger: RhUiErrorFillIcon,
  warning: RhUiWarningFillIcon,
  info: RhUiInformationFillIcon,
  pending: RhUiInProgressIcon,
  progress: RhUiSyncIcon,
  ban: RhUiBanIcon,
  unknown: RhUiUnknownIcon,
  neutral: null,
};

/**
 * `Icon status` takes the PF status tokens (`--pf-t--global--icon--color--status--*`), as OCP `status/icons.scss`;
 * the other families keep the text colour.
 */
const ICON_STATUS: Partial<Record<StatusKind, 'success' | 'danger' | 'warning' | 'info'>> = {
  success: 'success',
  danger: 'danger',
  warning: 'warning',
  info: 'info',
};

/** The AT-hidden status icon, or `null` for `neutral`. */
function StatusIcon({ status }: { status: StatusKind }) {
  const Glyph = ICONS[status];
  if (!Glyph) return null;
  return (
    <Icon status={ICON_STATUS[status]} isInline aria-hidden="true">
      <Glyph />
    </Icon>
  );
}

/**
 * Status as icon + text (OCP `StatusIconAndText`, `UX.md` §5): the text is always visible, the icon is decorative
 * and hidden from assistive technology. `asLabel` renders the same as an outlined compact label.
 */
export function StatusIconText({ status, text, asLabel }: StatusIconTextProps) {
  if (asLabel) {
    return (
      <Label variant="outline" isCompact icon={<StatusIcon status={status} />}>
        {text}
      </Label>
    );
  }
  return (
    <Flex
      display={{ default: 'inlineFlex' }}
      gap={{ default: 'gapXs' }}
      alignItems={{ default: 'alignItemsBaseline' }}
      flexWrap={{ default: 'nowrap' }}
    >
      {ICONS[status] && (
        <FlexItem>
          <StatusIcon status={status} />
        </FlexItem>
      )}
      <FlexItem>{text}</FlexItem>
    </Flex>
  );
}
