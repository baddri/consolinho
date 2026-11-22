/**
 * Presentational building blocks shared by all pages (FRONTEND.md "Folder structure", spec §5 UX notes,
 * ADR-0014 §6, ADR-0015 §6-7). No feature knowledge.
 */
export {
  ActionButton,
  disabledActionProps,
  type ActionButtonProps,
  type DisabledActionProps,
} from './ActionButton';
export {
  ConfirmModal,
  InlineLabelTitle,
  type ConfirmModalProps,
  type InlineLabelTitleProps,
} from './ConfirmModal';
export {
  ConsoleDataView,
  type ConsoleDataViewProps,
  type DataViewFilterValue,
} from './data-view/ConsoleDataView';
export { DataViewLabelFilter, type DataViewLabelFilterProps } from './data-view/DataViewLabelFilter';
export { DataViewTextFilter, type DataViewTextFilterProps } from './data-view/DataViewTextFilter';
export { FilterTextInput, type FilterTextInputProps } from './data-view/FilterTextInput';
export type { DataViewColumn, DataViewColumnType } from './data-view/types';
export {
  DetailsColumn,
  DetailsGrid,
  DetailsItem,
  type DetailsColumnProps,
  type DetailsItemProps,
} from './page/DetailsGrid';
export {
  EnvironmentLabel,
  environmentLabel,
  type EnvironmentLabelProps,
  type EnvironmentLabelStyle,
} from './EnvironmentLabel';
export { DetailsSubsection, type DetailsSubsectionProps } from './page/DetailsSubsection';
export { ErrorState, type ErrorStateProps } from './ErrorState';
export { formatAbsoluteTime, formatRelativeTime } from './formatRelativeTime';
export { KindBadge, kindAbbr, type KindBadgeProps } from './kind-badge/KindBadge';
export { kindLabelColor } from './kind-badge/kindLabelColor';
export { LabelList, type LabelListProps } from './LabelList';
export { NotFoundPage } from './NotFoundPage';
export { PageBody, type PageBodyProps } from './page/PageBody';
export {
  HeadingFavoriteContext,
  type HeadingFavoriteProps,
  type HeadingFavoriteRenderer,
} from './page/headingFavorite';
export { PageHeading, type BreadcrumbCrumb, type PageHeadingProps } from './page/PageHeading';
export { PageTabs, type PageTab, type PageTabsProps } from './page/PageTabs';
export { PlaceholderPage, type PlaceholderPageProps } from './PlaceholderPage';
export { RelativeTime, type RelativeTimeProps } from './RelativeTime';
export { ResourceLabels, type ResourceLabelsProps } from './ResourceLabels';
export { SectionHeading, type SectionHeadingProps } from './page/SectionHeading';
export { Status, statusKindOf, type StatusProps } from './Status';
export { StatusIconText, type StatusIconTextProps, type StatusKind } from './StatusIconText';
export { Timestamp, type TimestampProps } from './Timestamp';
export { durationText, timestampText, utcTimestampText } from './formatTimestamp';
export { useTimestampTick } from './timestampTick';
export { TOAST_TIMEOUT_MS, ToastProvider } from './ToastProvider';
export { TypeaheadSelect, type TypeaheadItem, type TypeaheadSelectProps } from './TypeaheadSelect';
export type { ShowToast, ToastApi } from './toastContext';
export { useNow } from './useNow';
export { useToast } from './useToast';
