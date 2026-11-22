import {
  Alert,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  ExpandableSection,
  Label,
  Stack,
  StackItem,
  Title,
  type LabelProps,
} from '@patternfly/react-core';
import type { CapabilityLevel, ConnectionTestResult } from '@/shared/api';
import { CAPABILITY_LABELS } from '../credentials/LastTestLabel';
import { CapabilityGrid } from './CapabilityGrid';
import { NamespaceRulesTable } from './NamespaceRulesTable';
import { TestStepList } from './TestStepList';

/** Colour of each capability headline: the more power, the louder (TEST-3). */
const HEADLINE_COLOR: Record<CapabilityLevel, NonNullable<LabelProps['color']>> = {
  clusterAdmin: 'red',
  clusterWideEdit: 'orange',
  clusterWideView: 'blue',
  limited: 'grey',
};

/** "412 ms" / "2.3 s". */
export function formatDuration(durationMs: number): string {
  return durationMs < 1000 ? `${durationMs} ms` : `${(durationMs / 1000).toFixed(1)} s`;
}

/** The capability headline as a coloured label, e.g. a red "Cluster admin". */
export function CapabilityHeadlineLabel({ headline }: { headline: CapabilityLevel }) {
  return (
    <Label color={HEADLINE_COLOR[headline]} isCompact>
      {CAPABILITY_LABELS[headline]}
    </Label>
  );
}

/** Title of the overall outcome alert, also used by the compact token-test result. */
export function overallTitle(result: Pick<ConnectionTestResult, 'succeeded' | 'durationMs'>): string {
  return `Connection test ${result.succeeded ? 'passed' : 'failed'} in ${formatDuration(result.durationMs)}`;
}

/** Props for {@link ConnectionTestResultView}. */
export interface ConnectionTestResultViewProps {
  result: ConnectionTestResult;
}

/**
 * Full result of one connection test (TEST-2..4), rendering only what the server sent: the overall outcome with its
 * duration, the steps in order ({@link TestStepList}), the facts (Kubernetes version, identity, OpenShift version),
 * the capability headline and grid ({@link CapabilityGrid}), the server's hints as inline alerts with their severity,
 * and the rules of each inspected namespace ({@link NamespaceRulesTable}) in an expandable section — or, for a
 * namespace that could not be reviewed, the server's message as a plain inline warning (NST-3).
 * Missing parts (a failed test has no capabilities) are simply left out.
 */
export function ConnectionTestResultView({ result }: ConnectionTestResultViewProps) {
  const { capabilities, namespaceRules } = result;
  return (
    <Stack hasGutter>
      <StackItem>
        <Alert variant={result.succeeded ? 'success' : 'danger'} isInline title={overallTitle(result)} />
      </StackItem>
      <StackItem>
        <TestStepList steps={result.steps} />
      </StackItem>
      <StackItem>
        <TestFacts result={result} />
      </StackItem>
      {result.hints.map((hint) => (
        <StackItem key={`${hint.severity}:${hint.message}`}>
          <Alert variant={hint.severity} isInline isPlain title={hint.message} />
        </StackItem>
      ))}
      {capabilities !== null && (
        <StackItem>
          <Title headingLevel="h3" size="md">
            Capabilities <CapabilityHeadlineLabel headline={capabilities.headline} />
          </Title>
          <CapabilityGrid checks={capabilities.checks} />
        </StackItem>
      )}
      {namespaceRules.map((entry) => (
        <StackItem key={entry.namespace}>
          {entry.error === null ? (
            <ExpandableSection toggleText={`Rules in namespace ${entry.namespace}`}>
              <NamespaceRulesTable rules={entry} />
            </ExpandableSection>
          ) : (
            <Alert variant="warning" isInline isPlain title={`Rules in namespace ${entry.namespace} could not be reviewed`}>
              {entry.error}
            </Alert>
          )}
        </StackItem>
      ))}
    </Stack>
  );
}

/** The facts a test learned about the cluster and the token's identity; unknown values show "Unknown". */
function TestFacts({ result }: ConnectionTestResultViewProps) {
  const { kubernetesVersion, identity, openShiftVersion } = result;
  return (
    <DescriptionList isHorizontal isCompact aria-label="Cluster facts">
      <DescriptionListGroup>
        <DescriptionListTerm>Kubernetes version</DescriptionListTerm>
        <DescriptionListDescription>{kubernetesVersion ?? 'Unknown'}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Identity</DescriptionListTerm>
        <DescriptionListDescription>
          {identity === null
            ? 'Unknown'
            : `${identity.username}${identity.source === 'tokenSubject' ? ' (from token)' : ''}`}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>OpenShift version</DescriptionListTerm>
        <DescriptionListDescription>
          {openShiftVersion === null ? 'Unknown' : openShiftVersion.version}
          {openShiftVersion?.updateProgressing === true && (
            <>
              {' '}
              <Label isCompact status="info">
                Update in progress
              </Label>
            </>
          )}
        </DescriptionListDescription>
      </DescriptionListGroup>
    </DescriptionList>
  );
}
