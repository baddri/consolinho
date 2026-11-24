import { Flex, FlexItem } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { Link } from 'react-router';
import type { AccessCandidate, EffectiveClusterAccess } from '@/shared/api';
import { AccessModeLabel } from '../grants/AccessModeLabel';
import { SubjectKindLabel } from '../grants/SubjectKindLabel';
import { groupDetailPath } from '../groups/groupPaths';
import { userDetailPath } from '../users/userColumns';
import { EMPTY, outcomeText } from './effectiveAccessText';

/** Subject cell: "User"/"Group" label, then a link to the user or group page. */
function SubjectCell({ candidate }: { candidate: AccessCandidate }) {
  const to =
    candidate.subjectKind === 'user' ? userDetailPath(candidate.subjectName) : groupDetailPath(candidate.subjectName);
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <SubjectKindLabel kind={candidate.subjectKind} />
      </FlexItem>
      <FlexItem>
        <Link to={to}>{candidate.subjectName}</Link>
      </FlexItem>
    </Flex>
  );
}

/** Props for {@link CandidatesTable}. */
export interface CandidatesTableProps {
  row: EffectiveClusterAccess;
}

/**
 * Every grant matching the user on one cluster (EFF-2), winner first in API order: subject, priority (groups only),
 * access mode, credential and the contract §5 outcome copy ({@link outcomeText}), one line each.
 */
export function CandidatesTable({ row }: CandidatesTableProps) {
  return (
    <Table aria-label={`Matching grants on ${row.clusterName}`} variant="compact">
      <Thead>
        <Tr>
          <Th>Subject</Th>
          <Th>Priority</Th>
          <Th>Access mode</Th>
          <Th>Credential</Th>
          <Th>Outcome</Th>
        </Tr>
      </Thead>
      <Tbody>
        {row.candidates.map((candidate) => (
          <Tr key={candidate.grantId}>
            <Td dataLabel="Subject">
              <SubjectCell candidate={candidate} />
            </Td>
            <Td dataLabel="Priority">{candidate.priority ?? EMPTY}</Td>
            <Td dataLabel="Access mode">
              <AccessModeLabel accessMode={candidate.accessMode} environment={row.clusterEnvironment} />
            </Td>
            <Td dataLabel="Credential">{candidate.credentialName}</Td>
            <Td dataLabel="Outcome">
              {outcomeText(candidate, row).map((line) => (
                <div key={line}>{line}</div>
              ))}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
