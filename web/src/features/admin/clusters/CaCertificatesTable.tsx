import { Alert, Content, Label, Stack, StackItem, Title, Truncate } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { CaCertificate, CertificateExpiryStatus, ClusterDetail } from '@/shared/api';
import { RelativeTime } from '@/shared/ui';

/** How one validity state is labelled. */
interface ExpiryLabel {
  text: string;
  color: 'green' | 'orange' | 'red';
  status?: 'warning' | 'danger';
}

/** Label of each certificate validity state (CLU-2); certificates are flagged 30 days before they expire. */
const EXPIRY_LABELS: Record<CertificateExpiryStatus, ExpiryLabel> = {
  ok: { text: 'Valid', color: 'green' },
  expiringSoon: { text: 'Expires soon', status: 'warning', color: 'orange' },
  expired: { text: 'Expired', status: 'danger', color: 'red' },
};

/** Characters of the 95-character fingerprint shown before truncation; the full value is in the tooltip. */
const FINGERPRINT_CHARS = 23;

/** One certificate of the bundle. */
function CertificateRow({ certificate }: { certificate: CaCertificate }) {
  const expiry = EXPIRY_LABELS[certificate.expiryStatus];
  return (
    <Tr>
      <Td dataLabel="Subject">{certificate.subject}</Td>
      <Td dataLabel="Issuer">{certificate.issuer}</Td>
      <Td dataLabel="Valid until">
        <RelativeTime value={certificate.notAfter} />
      </Td>
      <Td dataLabel="Expiry">
        <Label isCompact color={expiry.color} status={expiry.status}>
          {expiry.text}
        </Label>
      </Td>
      <Td dataLabel="SHA-256 fingerprint" className="pf-v6-u-font-family-monospace">
        <Truncate content={certificate.sha256Fingerprint} maxCharsDisplayed={FINGERPRINT_CHARS} />
      </Td>
    </Tr>
  );
}

/** Props for {@link CaCertificatesTable}. */
export interface CaCertificatesTableProps {
  /** The cluster whose CA bundle (`caCertificates`) and skip-TLS flag are shown. */
  cluster: Pick<ClusterDetail, 'name' | 'caCertificates' | 'skipTlsVerify'>;
}

/**
 * "CA certificates" section of the cluster Details tab (CLU-2): the certificates of the PEM bundle in plain words —
 * subject, issuer, expiry relative to now with an "Expires soon" / "Expired" label, and the SHA-256 fingerprint
 * (monospace, truncated, full value in a tooltip). Skip-TLS clusters get a warning alert; without a bundle the
 * system trust store applies.
 */
export function CaCertificatesTable({ cluster }: CaCertificatesTableProps) {
  const { caCertificates, skipTlsVerify } = cluster;
  return (
    <Stack hasGutter>
      <StackItem>
        <Title headingLevel="h2" size="lg">
          CA certificates
        </Title>
      </StackItem>
      {skipTlsVerify && (
        <StackItem>
          <Alert variant="warning" isInline isPlain title="TLS verification is disabled for this cluster." />
        </StackItem>
      )}
      {caCertificates.length > 0 ? (
        <StackItem>
          <Table aria-label={`CA certificates of ${cluster.name}`} variant="compact">
            <Thead>
              <Tr>
                <Th>Subject</Th>
                <Th>Issuer</Th>
                <Th>Valid until</Th>
                <Th>Expiry</Th>
                <Th>SHA-256 fingerprint</Th>
              </Tr>
            </Thead>
            <Tbody>
              {caCertificates.map((certificate) => (
                <CertificateRow key={certificate.sha256Fingerprint} certificate={certificate} />
              ))}
            </Tbody>
          </Table>
        </StackItem>
      ) : (
        !skipTlsVerify && (
          <StackItem>
            <Content component="p">No CA bundle — the system trust store is used.</Content>
          </StackItem>
        )
      )}
    </Stack>
  );
}
