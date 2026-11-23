import {
  Alert,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  ExpandableSection,
  Icon,
  Label,
  Stack,
  StackItem,
  Title,
  type LabelProps,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import type { CapabilityLevel, ConnectionTestResult, NamespaceRules } from '@/shared/api';
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
 * and one collapsed section per inspected namespace ({@link NamespaceRulesSections}, NST-4).
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
      {namespaceRules.length > 0 && (
        <StackItem>
          <NamespaceRulesSections entries={namespaceRules} />
        </StackItem>
      )}
    </Stack>
  );
}

/**
 * One collapsed "Rules in namespace <ns>" section per inspected namespace, in the server's order (= the order the admin
 * entered them, NST-4): a reviewed namespace shows its {@link NamespaceRulesTable}; a failed one gets a warning icon
 * and "could not be reviewed" on its toggle and the server's message as a plain inline warning inside, so one namespace failing never reads as a failed test. With more than one namespace the
 * sections are grouped under a "Namespace rules" heading like "Capabilities"; the "reviewed in n of m" headline is the
 * server's step, not computed here.
 */
function NamespaceRulesSections({ entries }: { entries: readonly NamespaceRules[] }) {
  return (
    <Stack hasGutter>
      {entries.length > 1 && (
        <Title headingLevel="h3" size="md">
          Namespace rules
        </Title>
      )}
      {entries.map((entry) => (
        entry.error === null ? (
          <ExpandableSection key={entry.namespace} toggleText={`Rules in namespace ${entry.namespace}`}>
            <NamespaceRulesTable rules={entry} />
          </ExpandableSection>
        ) : (
          // A failed namespace says so while collapsed (icon + text, OCP status pattern), not only once expanded.
          <ExpandableSection
            key={entry.namespace}
            toggleContent={
              <>
                <Icon status="warning" isInline>
                  <ExclamationTriangleIcon />
                </Icon>{' '}
                {`Rules in namespace ${entry.namespace}: could not be reviewed`}
              </>
            }
          >
            <Alert variant="warning" isInline isPlain title={entry.error} />
          </ExpandableSection>
        )
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
