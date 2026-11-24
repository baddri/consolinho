import { ExternalLinkButton } from '@patternfly/react-component-groups';
import { Icon, Tooltip } from '@patternfly/react-core';
import { RhUiInformationFillIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { ReactNode } from 'react';
import {
  NamespaceModel,
  PodModel,
  type K8sResource,
  type LabelSelector,
  type NetworkPolicy,
} from '@/shared/k8s';
import { DetailsItem, DetailsSubsection } from '@/shared/ui';
import { PodSelectorLink } from '../../registry/columns';
import { AllNamespacesSelectorLink, PolicyPodSelector, isEmptySelector } from './PolicySelectors';
import {
  affectsDirection,
  isDenyAll,
  peerRows,
  policyRules,
  type PeerView,
  type PolicyDirection,
} from './policyRules';

/** A NetworkPolicy on its details page (`metadata` always present). */
type NetworkPolicyObject = NetworkPolicy & K8sResource;

/** Upstream docs page of networking-plugin `getNetworkPolicyDocURL` (OKD, so no product branding). */
export const NETWORK_POLICY_DOCS_URL =
  'https://docs.okd.io/latest/networking/network_security/network_policy/about-network-policy.html';

/** The policy types in effect: `spec.policyTypes`, or the ones the API implies without it. */
function policyTypes(np: NetworkPolicy): string {
  const types = (['ingress', 'egress'] as const).filter((direction) => affectsDirection(np, direction));
  return types.map((direction) => (direction === 'ingress' ? 'Ingress' : 'Egress')).join(', ');
}

/**
 * Right column of the NetworkPolicy details: the pods the policy targets and the directions it governs (not in
 * networking-plugin, whose details have the metadata column only; the task contract adds them for the at-a-glance read).
 */
export function NetworkPolicyDetails({ obj }: { obj: NetworkPolicyObject }) {
  return (
    <>
      <DetailsItem label="Pod selector" path="spec.podSelector">
        <PolicyPodSelector namespace={obj.metadata.namespace} selector={obj.spec?.podSelector} />
      </DetailsItem>
      <DetailsItem label="Policy types" path="spec.policyTypes">
        {policyTypes(obj)}
      </DetailsItem>
    </>
  );
}

/** networking-plugin `MutedText`: the subtle caption over a selector in a rule cell. */
function Caption({ children }: { children: ReactNode }) {
  return <div className="pf-v6-u-text-color-subtle">{children}</div>;
}

/** networking-plugin `NetworkPolicyDetailsRowIPBlocks`: the CIDR, and "(with exceptions)" with the list in a tooltip. */
function IpBlock({ peer }: { peer: Extract<PeerView, { kind: 'ipBlock' }> }) {
  return (
    <div>
      {peer.cidr}
      {peer.except.length > 0 && (
        <Tooltip content={<div>Exceptions: {peer.except.join(', ')}</div>}>
          <span>
            {' (with exceptions) '}
            <Icon status="info" isInline>
              <RhUiInformationFillIcon />
            </Icon>
          </span>
        </Tooltip>
      )}
    </div>
  );
}

/** A peer's pod selector: "Any pod" when empty, else the Pods link (Search in all namespaces when it spans them, as OCP). */
function PeerPods({
  peer,
  namespace,
}: {
  peer: Extract<PeerView, { kind: 'pods' }>;
  namespace: string | undefined;
}) {
  return (
    <div>
      <Caption>Pod selector</Caption>
      <div>
        {isEmptySelector(peer.podSelector) ? (
          <span>Any pod</span>
        ) : // Under a namespaceSelector the pods may be in any namespace: Search all of them, as OCP.
        peer.namespaceSelector ? (
          <AllNamespacesSelectorLink model={PodModel} selector={peer.podSelector} />
        ) : (
          <PodSelectorLink namespace={namespace} selector={peer.podSelector} />
        )}
      </div>
    </div>
  );
}

/** A peer's namespace selector: "Any namespace" when empty, else the Namespace Search link. */
function PeerNamespaces({ selector }: { selector: LabelSelector }) {
  return (
    <div>
      <Caption>NS selector</Caption>
      {isEmptySelector(selector) ? (
        <span>Any namespace</span>
      ) : (
        <AllNamespacesSelectorLink model={NamespaceModel} selector={selector} />
      )}
    </div>
  );
}

/**
 * networking-plugin `NetworkPolicyDetailsRowSelector`: the peer(s) of one row — "Any peer" without any; otherwise the
 * namespace selector (or the policy's namespace for a plain pod selector), the pod selector, or the merged IP blocks.
 */
function PeerCell({ row, namespace }: { row: PeerView[]; namespace: string | undefined }) {
  const [first] = row;
  if (first === undefined) return <div>Any peer</div>;
  if (first.kind === 'ipBlock') {
    return (
      <div>
        <Caption>IP blocks</Caption>
        {row.map((peer, index) =>
          // `peerRows` keeps IP blocks together, so every entry of this row is one.
          peer.kind === 'ipBlock' ? <IpBlock key={`${peer.cidr}-${String(index)}`} peer={peer} /> : null,
        )}
      </div>
    );
  }
  if (first.kind === 'namespaces') return <PeerNamespaces selector={first.namespaceSelector} />;
  return (
    <>
      {first.namespaceSelector ? (
        <PeerNamespaces selector={first.namespaceSelector} />
      ) : (
        <div>
          <Caption>Namespace</Caption>
          <div>{namespace}</div>
        </div>
      )}
      <PeerPods peer={first} namespace={namespace} />
    </>
  );
}

/** Copy of each direction's section, verbatim from networking-plugin `NetworkPolicyDetailsIngress` / `…Egress`. */
const SECTION_COPY: Record<
  PolicyDirection,
  {
    title: string;
    explanation: string;
    denied: (namespace: string) => string;
    columns: [string, string, string];
  }
> = {
  ingress: {
    title: 'Ingress rules',
    explanation:
      'Pods accept all traffic by default. They can be isolated via NetworkPolicies which specify an allowlist of ingress rules. When a Pod is selected by a NetworkPolicy, it will reject all traffic not explicitly allowed via a NetworkPolicy.',
    denied: (namespace) => `All incoming traffic is denied to Pods in ${namespace}`,
    columns: ['Target pods', 'From', 'To ports'],
  },
  egress: {
    title: 'Egress rules',
    explanation:
      'All outgoing traffic is allowed by default. Egress rules can be used to restrict outgoing traffic if the cluster network provider allows it. When using the OpenShift SDN cluster network provider, egress network policy is not supported.',
    denied: (namespace) => `All outgoing traffic is denied from Pods in ${namespace}`,
    columns: ['From pods', 'To', 'To ports'],
  },
};

/**
 * One direction's rules (networking-plugin `NetworkPolicyDetailsIngress` / `…Egress`): the explanation with the docs
 * link, then the deny-all sentence or a row per peer row of each rule — the policy's target pods, the peers, the ports.
 */
function RulesSection({ np, direction }: { np: NetworkPolicyObject; direction: PolicyDirection }) {
  const copy = SECTION_COPY[direction];
  const namespace = np.metadata.namespace;
  const [targetTitle, peerTitle, portsTitle] = copy.columns;
  return (
    <DetailsSubsection title={copy.title}>
      {/* OCP `co-m-pane__explanation`. */}
      <p className="pf-v6-u-text-color-subtle pf-v6-u-mb-lg">
        {copy.explanation} See more details in:{' '}
        <ExternalLinkButton
          variant="link"
          isInline
          href={NETWORK_POLICY_DOCS_URL}
          className="pf-v6-u-display-inline"
          iconProps={{ className: 'pf-v6-u-ml-xs' }}
        >
          NetworkPolicies documentation
        </ExternalLinkButton>
        {direction === 'egress' && '.'}
      </p>
      {isDenyAll(np, direction) ? (
        <p>{copy.denied(namespace ?? '')}</p>
      ) : (
        <Table aria-label={copy.title} variant="compact">
          <Thead>
            <Tr>
              <Th width={35}>{targetTitle}</Th>
              <Th width={35}>{peerTitle}</Th>
              <Th width={30}>{portsTitle}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {policyRules(np, direction).flatMap((rule, ruleIndex) =>
              peerRows(rule.peers).map((row, rowIndex) => (
                // Rules and peers have no identity of their own: the same selector may repeat.
                <Tr key={`${String(ruleIndex)}_${String(rowIndex)}`}>
                  <Td dataLabel={targetTitle}>
                    <Caption>Pod selector</Caption>
                    <PolicyPodSelector namespace={namespace} selector={np.spec?.podSelector} />
                  </Td>
                  <Td dataLabel={peerTitle}>
                    <PeerCell row={row} namespace={namespace} />
                  </Td>
                  <Td dataLabel={portsTitle}>
                    {rule.ports.length === 0 ? (
                      <div>Any port</div>
                    ) : (
                      rule.ports.map((port) => <p key={port}>{port}</p>)
                    )}
                  </Td>
                </Tr>
              )),
            )}
          </Tbody>
        </Table>
      )}
    </DetailsSubsection>
  );
}

/**
 * Sections under the NetworkPolicy details (networking-plugin `NetworkPolicyDetails`): Ingress rules when the policy
 * governs ingress, then Egress rules (always, as OCP).
 */
export function NetworkPolicySections({ obj }: { obj: NetworkPolicyObject }) {
  return (
    <>
      {affectsDirection(obj, 'ingress') && <RulesSection np={obj} direction="ingress" />}
      <RulesSection np={obj} direction="egress" />
    </>
  );
}
