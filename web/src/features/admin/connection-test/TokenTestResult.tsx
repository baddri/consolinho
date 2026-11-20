import { Alert, Content, ExpandableSection } from '@patternfly/react-core';
import type { ConnectionTestResult } from '@/shared/api';
import { TEST_STEP_LABELS } from '../credentials/LastTestLabel';
import { CapabilityHeadlineLabel, ConnectionTestResultView, overallTitle } from './ConnectionTestResultView';

/**
 * Compact result of "Test new token" in the rotate dialog (CRED-5): the overall outcome, the failed step's message
 * (verbatim) or the capability headline, and the full {@link ConnectionTestResultView} behind "Show full result".
 */
export function TokenTestResult({ result }: { result: ConnectionTestResult }) {
  const failed = result.steps.find((step) => step.status === 'failed');
  const headline = result.capabilities?.headline;
  return (
    <Alert variant={result.succeeded ? 'success' : 'danger'} isInline title={overallTitle(result)}>
      {failed !== undefined && <Content component="p">{`${TEST_STEP_LABELS[failed.step]}: ${failed.message}`}</Content>}
      {headline !== undefined && (
        <Content component="p">
          Capabilities: <CapabilityHeadlineLabel headline={headline} />
        </Content>
      )}
      <ExpandableSection toggleTextCollapsed="Show full result" toggleTextExpanded="Hide full result">
        <ConnectionTestResultView result={result} />
      </ExpandableSection>
    </Alert>
  );
}
