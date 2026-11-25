import { useState } from 'react';
import { NamespaceModel, ProjectModel, useK8sDiscovery } from '@/shared/k8s';
import { ActionButton } from '@/shared/ui';
import { useResourceAccess } from '../actions/useResourceAccess';
import { CreateNamespaceModal } from './CreateNamespaceModal';

/**
 * The Namespaces list's "Create Namespace" heading button (OCP `namespace.tsx` `createNamespaceModal`, NSC-1), the
 * descriptor's `ListActions`. Only where Projects aren't served (on OpenShift users create Projects); nothing while
 * discovery is pending. Gated as Create Project (NSC-2, SAFE5-2) on `create namespaces`: a read-only user, a
 * read-only grant or a cluster RBAC denial keeps it visible but disabled with the reason in a tooltip; aria-disabled
 * without a tooltip while the answer is pending.
 */
export function CreateNamespaceButton({ cluster }: { cluster: string }) {
  const discovery = useK8sDiscovery(cluster);
  if (discovery.isPending || discovery.isServed(ProjectModel)) return null;
  return <GatedCreateNamespaceButton cluster={cluster} />;
}

/** The access-gated button and its modal, mounted only where namespaces are created directly. */
function GatedCreateNamespaceButton({ cluster }: { cluster: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const access = useResourceAccess(cluster, { verb: 'create', model: NamespaceModel });
  return (
    <>
      <ActionButton
        variant="primary"
        disabledReason={access.disabledReason}
        isAriaDisabled={access.isChecking}
        onClick={() => setIsOpen(true)}
      >
        Create Namespace
      </ActionButton>
      {isOpen && <CreateNamespaceModal cluster={cluster} onClose={() => setIsOpen(false)} />}
    </>
  );
}
