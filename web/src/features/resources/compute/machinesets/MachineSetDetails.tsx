import { RhUiSearchIcon } from '@patternfly/react-icons';
import { Link } from 'react-router';
import { useActiveCluster } from '@/features/cluster-context';
import { labelSelectorString, MachineModel, MachineSetModel } from '@/shared/k8s';
import { DASH, DetailsItem } from '@/shared/ui';
import { resourcePath } from '../../paths';
import { machineRole } from '../machines/machine';
import {
  desiredMachines,
  machineCountText,
  machineSetCounts,
  machineSetInstanceType,
  machineSetPlacement,
  type MachineSetResource,
} from './machineSet';

/**
 * The MachineSet's selector as OCP `Selector` with `kind={machineReference}`: a link to the Machines list of its
 * namespace filtered by it (`?label=`), with the search icon and ", "-joined terms; "No selector" without one.
 */
function MachineSelectorLink({ obj }: { obj: MachineSetResource }) {
  const cluster = useActiveCluster();
  const text = labelSelectorString(obj.spec?.selector);
  const { namespace } = obj.metadata;
  if (text === '') return <div className="pf-v6-u-text-color-subtle">No selector</div>;
  if (cluster === undefined || namespace === undefined) return <>{text}</>;
  const search = new URLSearchParams({ label: text }).toString();
  return (
    <Link to={resourcePath(cluster, MachineModel, { namespace, search })}>
      <RhUiSearchIcon className="pf-v6-u-mr-xs" />
      {text.replace(/,/g, ', ')}
    </Link>
  );
}

/**
 * MachineSet rows of the metadata column after Annotations (OCP `MachineSetDetails` passes them as
 * `ResourceSummary` children): Selector, Instance type, then Machine role, Region and Availability zone when known.
 */
export function MachineSetSummaryRows({ obj }: { obj: MachineSetResource }) {
  const role = machineRole(obj);
  const { region, zone } = machineSetPlacement(obj);
  return (
    <>
      <DetailsItem label="Selector" path="spec.selector">
        <MachineSelectorLink obj={obj} />
      </DetailsItem>
      <DetailsItem label="Instance type">{machineSetInstanceType(obj) ?? DASH}</DetailsItem>
      {role && <DetailsItem label="Machine role">{role}</DetailsItem>}
      {region && <DetailsItem label="Region">{region}</DetailsItem>}
      {zone && <DetailsItem label="Availability zone">{zone}</DetailsItem>}
    </>
  );
}

/** "`ready` of `desired` machines" (OCP `MachinesCell`), linking to the MachineSet's Machines tab. */
export function MachinesCell({ obj }: { obj: MachineSetResource }) {
  const cluster = useActiveCluster();
  const desired = desiredMachines(obj);
  const title = `${String(machineSetCounts(obj).ready)} of ${machineCountText(desired)}`;
  const { namespace, name } = obj.metadata;
  if (cluster === undefined || namespace === undefined || name === undefined) return <>{title}</>;
  return <Link to={resourcePath(cluster, MachineSetModel, { namespace, name, tab: 'machines' })}>{title}</Link>;
}
