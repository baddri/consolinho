import { Flex, FlexItem, Icon, Label } from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  HourglassHalfIcon,
  InfoCircleIcon,
} from '@patternfly/react-icons';
import type { ComponentType } from 'react';

/** Feature-free status vocabulary; each feature maps its own enum to it in one adapter. */
export type StatusKind = 'success' | 'danger' | 'warning' | 'info' | 'pending' | 'neutral';

/** Props for {@link StatusIconText}. */
export interface StatusIconTextProps {
  status: StatusKind;
  text: string;
  /** Outlined compact `Label` with the icon — only for a details-page title (`UX.md` §3). */
  asLabel?: boolean;
}

const ICONS: Record<StatusKind, ComponentType | null> = {
  success: CheckCircleIcon,
  danger: ExclamationCircleIcon,
  warning: ExclamationTriangleIcon,
  info: InfoCircleIcon,
  pending: HourglassHalfIcon,
  neutral: null,
};

/** `Icon status` takes the PF status tokens (`--pf-t--global--icon--color--status--*`); pending/neutral stay default. */
const ICON_STATUS: Partial<Record<StatusKind, 'success' | 'danger' | 'warning' | 'info'>> = {
  success: 'success',
  danger: 'danger',
  warning: 'warning',
  info: 'info',
};

/** The coloured, AT-hidden status icon, or `null` for `neutral`. */
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
      alignItems={{ default: 'alignItemsCenter' }}
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
