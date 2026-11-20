import { CodeBlock, CodeBlockCode } from '@patternfly/react-core';
import { useMemo } from 'react';
import { stringify } from 'yaml';
import type { K8sResource } from '@/shared/k8s';
import { useResourceDetails } from '../details/detailsContext';

/** The object as YAML without `metadata.managedFields` (server bookkeeping that would bury the object). */
export function toYaml(obj: K8sResource): string {
  const metadata = { ...obj.metadata };
  delete metadata.managedFields;
  return stringify({ ...obj, metadata });
}

/**
 * YAML tab, interim read-only view (UI-6 lite): the live object as YAML in a PF `CodeBlock`. T-0077 replaces it with
 * the Monaco editor; it stays its own lazy route module so Monaco never lands in the details chunk.
 */
export function ResourceYamlView() {
  const { obj } = useResourceDetails();
  const yaml = useMemo(() => toYaml(obj), [obj]);
  return (
    <CodeBlock aria-label="YAML">
      <CodeBlockCode>{yaml}</CodeBlockCode>
    </CodeBlock>
  );
}
