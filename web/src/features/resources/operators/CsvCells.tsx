import { Button, Popover } from '@patternfly/react-core';
import { Link } from 'react-router';
import { useActiveCluster } from '@/features/cluster-context';
import { ClusterServiceVersionModel, NamespaceModel } from '@/shared/k8s';
import { DASH, Status } from '@/shared/ui';
import { ResourceLink } from '../components/ResourceLink';
import { resourcePath } from '../paths';
import {
  csvPhase,
  isCopiedCsv,
  providedApiName,
  providedApis,
  subscriptionForCsv,
  targetNamespaces,
  type CsvResource,
} from './csv';
import { csvLinkClassName, CsvLogo } from './CsvLogo';
import { subscriptionStatusTitle, useCsvSubscriptions } from './SubscriptionStatus';

/** Provided APIs listed in a row before "View N more..." (OCP `CsvProvidedAPIsCell`). */
const MAX_LISTED_APIS = 4;

/** Path of the CSV's details page on the active cluster, `undefined` outside a cluster route. */
function useCsvPath(csv: CsvResource): string | undefined {
  const cluster = useActiveCluster();
  if (cluster === undefined) return undefined;
  return resourcePath(cluster, ClusterServiceVersionModel, {
    namespace: csv.metadata.namespace,
    name: csv.metadata.name,
  });
}

/** Name cell (OCP `CsvNameCell`): the operator's logo, display name and provider, linking to its details. */
export function CsvNameCell({ obj }: { obj: CsvResource }) {
  const path = useCsvPath(obj);
  if (path === undefined) return <CsvLogo csv={obj} />;
  return (
    <Link to={path} className={csvLinkClassName}>
      <CsvLogo csv={obj} />
    </Link>
  );
}

/**
 * Status cell (OCP `CsvStatusCell` → `ClusterServiceVersionStatus`): the phase with its icon (Succeeded, Failed,
 * Installing…) and, below it, the installing Subscription's status as subtle text ({@link subscriptionStatusTitle},
 * from the page's one Subscriptions list); no line while that list loads, without a Subscription or for other states.
 * "-" without a phase.
 */
export function CsvStatusCell({ obj }: { obj: CsvResource }) {
  const subscriptions = useCsvSubscriptions();
  const phase = csvPhase(obj);
  if (!phase) return DASH;
  const subscriptionStatus = subscriptions && subscriptionStatusTitle(subscriptionForCsv(subscriptions, obj));
  return (
    <>
      <Status status={phase} />
      {subscriptionStatus && <div className="pf-v6-u-text-color-subtle">{subscriptionStatus}</div>}
    </>
  );
}

/**
 * Managed Namespaces (OCP `ManagedNamespaces`): a copied CSV names its own namespace with OLM's message; otherwise
 * "All Namespaces", the one target namespace, or "<n> Namespaces" opening a popover of them.
 */
export function ManagedNamespaces({ obj }: { obj: CsvResource }) {
  if (isCopiedCsv(obj) && obj.metadata.namespace) {
    return (
      <>
        <ResourceLink model={NamespaceModel} name={obj.metadata.namespace} />
        {obj.status?.message && <span className="pf-v6-u-text-color-subtle">{obj.status.message}</span>}
      </>
    );
  }
  const namespaces = targetNamespaces(obj);
  const [first] = namespaces;
  if (first === undefined) return <>All Namespaces</>;
  if (namespaces.length === 1) return <ResourceLink model={NamespaceModel} name={first} />;
  return (
    <Popover
      headerContent="Managed Namespaces"
      bodyContent={namespaces.map((namespace) => (
        <ResourceLink key={namespace} model={NamespaceModel} name={namespace} />
      ))}
    >
      <Button variant="link" isInline>
        {`${namespaces.length} Namespaces`}
      </Button>
    </Popover>
  );
}

/** Sort key of {@link ManagedNamespaces} (OCP `formatTargetNamespaces`). */
export function managedNamespacesText(obj: CsvResource): string {
  if (isCopiedCsv(obj)) return obj.metadata.namespace ?? '';
  const namespaces = targetNamespaces(obj);
  if (namespaces.length === 0) return 'All Namespaces';
  return namespaces.length === 1 ? (namespaces[0] ?? '') : `${namespaces.length} Namespaces`;
}

/**
 * Provided APIs cell (OCP `CsvProvidedAPIsCell`): the first four API names, then "View <n> more..." linking to the
 * details page; "-" without any. Names only — operand pages are out of scope (OLM-5).
 */
export function ProvidedApisCell({ obj }: { obj: CsvResource }) {
  const path = useCsvPath(obj);
  const apis = providedApis(obj);
  if (apis.length === 0) return DASH;
  const more = apis.length - MAX_LISTED_APIS;
  return (
    <>
      {apis.slice(0, MAX_LISTED_APIS).map((api) => (
        <div key={`${api.name}/${api.version ?? ''}`} title={api.name}>
          {providedApiName(api)}
        </div>
      ))}
      {more > 0 && path !== undefined && <Link to={path}>{`View ${more} more...`}</Link>}
    </>
  );
}
