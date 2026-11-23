import { Button } from '@patternfly/react-core';
import { RhUiViewIcon, RhUiViewOffIcon } from '@patternfly/react-icons';
import { useMemo, useState } from 'react';
import type { K8sResource, Secret } from '@/shared/k8s';
import { DetailsItem } from '@/shared/ui';
import { DataSection } from './DataSection';
import { decodeSecretValue, type DataValue } from './dataValues';

type SecretObject = Secret & K8sResource;

/** The Secret's Type in the right column of "Secret details" (OCP `SecretDetails`); nothing when unset. */
export function SecretSummary({ obj }: { obj: Secret }) {
  return obj.type ? <DetailsItem label="Type" path="type">{obj.type}</DetailsItem> : null;
}

/** OCP `SecretDataRevealButton`: a right-aligned link button toggling "Reveal values" / "Hide values". */
function RevealButton({ reveal, onToggle }: { reveal: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="link"
      icon={reveal ? <RhUiViewOffIcon /> : <RhUiViewIcon />}
      onClick={onToggle}
      className="pf-v6-u-pr-0"
    >
      {reveal ? 'Hide values' : 'Reveal values'}
    </Button>
  );
}

/**
 * The Secret's "Data" section (CFG-2/3, OCP `SecretData`): values decoded from base64 and masked until "Reveal
 * values". The reveal is component state tied to the object's uid only (never URL or storage), so it re-masks on
 * remount and when another Secret is shown. No access gating: whoever can read the Secret may reveal it (CFG-5).
 * Non-UTF-8 values show as binary sizes; the toggle shows only when some value is revealable.
 */
export function SecretData({ obj }: { obj: SecretObject }) {
  const [revealedUid, setRevealedUid] = useState<string | undefined>();
  const uid = obj.metadata.uid ?? obj.metadata.name;
  const reveal = revealedUid === uid;
  const data = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(obj.data ?? {}).map(([key, value]): [string, DataValue] => [
          key,
          decodeSecretValue(value),
        ]),
      ),
    [obj.data],
  );
  const revealable = Object.values(data).some((value) => typeof value === 'string' && value !== '');
  return (
    <DataSection
      title="Data"
      data={data}
      masked={!reveal}
      actions={
        revealable ? (
          <RevealButton reveal={reveal} onToggle={() => setRevealedUid(reveal ? undefined : uid)} />
        ) : undefined
      }
    />
  );
}
