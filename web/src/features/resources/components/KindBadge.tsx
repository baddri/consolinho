import type { K8sModel } from '@/shared/k8s';
import { KindBadge as SharedKindBadge } from '@/shared/ui';

/** Props for {@link KindBadge}. */
export interface KindBadgeProps {
  model: Pick<K8sModel, 'abbr' | 'kind'>;
  /** `lg` before a details-page title. */
  size?: 'md' | 'lg';
}

/** The shared OCP kind badge (`co-m-resource-icon`, `UX.md` §5) for a registry model: its kind colour and `abbr`. */
export function KindBadge({ model, size }: KindBadgeProps) {
  return <SharedKindBadge kind={model.kind} abbr={model.abbr} size={size} />;
}
