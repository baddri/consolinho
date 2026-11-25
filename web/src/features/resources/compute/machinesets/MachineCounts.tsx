import {
  Card,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListTerm,
  Tooltip,
} from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { desiredMachines, machineCountText, machineSetCounts, type MachineSetResource } from './machineSet';
import styles from './MachineCounts.module.css';

/** One count cell: OCP puts term and value straight into a `Card` inside the `co-detail-table` description list. */
function CountCard({ term, tooltip, count }: { term: string; tooltip?: string; count: number }) {
  const value: ReactNode = machineCountText(count);
  return (
    <Card>
      <DescriptionListTerm>{term}</DescriptionListTerm>
      <DescriptionListDescription>
        {tooltip ? (
          <Tooltip content={tooltip}>
            <span>{value}</span>
          </Tooltip>
        ) : (
          value
        )}
      </DescriptionListDescription>
    </Card>
  );
}

/**
 * OCP `MachineCounts` (`machine-set.tsx`), above the MachineSet details grid: Desired, Current, Ready and Available
 * count as a wrapping row of cards (OCP `co-detail-table`), the last three with OCP's explanatory tooltips. Desired
 * count stays plain text: MachineSets are read-only here (MS-3, spec Q7 "no scaling"), where OCP offers an edit link.
 */
export function MachineCounts({ obj }: { obj: MachineSetResource }) {
  const { current, ready, available } = machineSetCounts(obj);
  return (
    <div className={styles.group}>
      <DescriptionList className={styles.counts} aria-label="Machine counts">
        <CountCard term="Desired count" count={desiredMachines(obj)} />
        <CountCard
          term="Current count"
          tooltip="The most recently observed number of replicas."
          count={current}
        />
        <CountCard
          term="Ready count"
          tooltip="The number of ready replicas for this MachineSet. A machine is considered ready when the node has been created and is ready."
          count={ready}
        />
        <CountCard
          term="Available count"
          tooltip="The number of available replicas (ready for at least minReadySeconds) for this MachineSet."
          count={available}
        />
      </DescriptionList>
    </div>
  );
}
