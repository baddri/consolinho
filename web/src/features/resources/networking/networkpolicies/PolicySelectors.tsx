import { RhUiSearchIcon } from '@patternfly/react-icons';
import { Link } from 'react-router';
import { useActiveCluster } from '@/features/cluster-context';
import { PodModel, type K8sModel, type LabelSelector } from '@/shared/k8s';
import { ALL_NAMESPACES } from '../../paths';
import { PodSelectorLink, labelSelectorString } from '../../registry/columns';
import { searchPath } from '../../search/searchPath';

/** Props for {@link PolicyPodSelector}. */
export interface PolicyPodSelectorProps {
  /** The policy's namespace: the selected pods live there. */
  namespace: string | undefined;
  selector: LabelSelector | undefined;
}

/** Whether a selector selects everything (no labels, no expressions). */
export function isEmptySelector(selector: LabelSelector | undefined): boolean {
  return labelSelectorString(selector) === '';
}

/**
 * The pods a policy targets (`spec.podSelector`), as networking-plugin `NetworkPolicyRow` /
 * `NetworkPolicyDetailsRowPodSelector`: the selector as a Pods link, or, for the empty selector, "All pods within <ns>"
 * linking to Search for Pods in that namespace (plain text outside a cluster).
 */
export function PolicyPodSelector({ namespace, selector }: PolicyPodSelectorProps) {
  const cluster = useActiveCluster();
  if (!isEmptySelector(selector)) return <PodSelectorLink namespace={namespace} selector={selector} />;
  const text = `All pods within ${namespace ?? ''}`;
  if (cluster === undefined || namespace === undefined) return <>{text}</>;
  return <Link to={searchPath(cluster, { namespace, kinds: [PodModel] })}>{text}</Link>;
}

/** Props for {@link AllNamespacesSelectorLink}. */
export interface AllNamespacesSelectorLinkProps {
  /** The kind the selector picks: Namespace for a `namespaceSelector`, Pod for a peer's pod selector under one. */
  model: Pick<K8sModel, 'group' | 'version' | 'kind'>;
  selector: LabelSelector;
}

/**
 * OCP `Selector` without a namespace: a link, with the search icon, to Search (all namespaces) for `model` objects
 * with those labels — a peer's `namespaceSelector` (`kind="Namespace"`), or the pod selector beneath one, whose pods
 * may live in any namespace. Plain text outside a cluster; the caller renders empty selectors ("Any namespace").
 */
export function AllNamespacesSelectorLink({ model, selector }: AllNamespacesSelectorLinkProps) {
  const cluster = useActiveCluster();
  const text = labelSelectorString(selector);
  if (cluster === undefined) return <>{text}</>;
  return (
    <Link to={searchPath(cluster, { namespace: ALL_NAMESPACES, kinds: [model], labels: [text] })}>
      <RhUiSearchIcon className="pf-v6-u-mr-xs" />
      {text.replace(/,/g, ', ')}
    </Link>
  );
}
