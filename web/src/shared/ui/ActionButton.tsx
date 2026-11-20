import { Button, Tooltip, type ButtonProps, type TooltipProps } from '@patternfly/react-core';

/** Props for {@link ActionButton}: every PatternFly `Button` prop plus an optional reason the action is unavailable. */
export type ActionButtonProps = ButtonProps & {
  /**
   * When set, the button is disabled and this text is shown in a tooltip (e.g. "Your account is read-only").
   * An empty string counts as no reason: a disabled control must always say why.
   */
  disabledReason?: string;
};

/**
 * A `Button` that stays visible and focusable when the user may not use it, and says why (ADR-0014 §6).
 *
 * With a `disabledReason` it uses `isAriaDisabled` — not `isDisabled`, which removes the button from the tab order
 * and suppresses the tooltip — so PatternFly swallows clicks while keyboard and screen-reader users still reach the
 * button and hear the reason.
 */
export function ActionButton({ disabledReason, ...buttonProps }: ActionButtonProps) {
  if (disabledReason === undefined || disabledReason === '') {
    return <Button {...buttonProps} />;
  }
  return (
    <Tooltip content={disabledReason}>
      <Button {...buttonProps} isAriaDisabled />
    </Tooltip>
  );
}

/** Props {@link disabledActionProps} produces; spread onto a `DropdownItem` or an `ActionsColumn` item. */
export interface DisabledActionProps {
  isAriaDisabled?: boolean;
  tooltipProps?: TooltipProps;
}

/**
 * The `DropdownItem` / `ActionsColumn` counterpart of {@link ActionButton}: with a reason, the menu item is
 * aria-disabled and explains itself in a tooltip; without one (or with an empty one), nothing is added.
 *
 * @example
 * <DropdownItem onClick={onDelete} {...disabledActionProps(readOnlyReason)}>Delete</DropdownItem>
 * const rowActions: IAction[] = [{ title: 'Deactivate', onClick, ...disabledActionProps(reason) }];
 */
export function disabledActionProps(reason?: string): DisabledActionProps {
  return reason === undefined || reason === ''
    ? {}
    : { isAriaDisabled: true, tooltipProps: { content: reason } };
}
