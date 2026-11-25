import { useState } from 'react';
import { ProjectRequestModel } from '@/shared/k8s';
import { ActionButton } from '@/shared/ui';
import { useResourceAccess } from '../actions/useResourceAccess';
import { CreateProjectModal } from './CreateProjectModal';

/**
 * The Projects list's "Create Project" heading button (OCP `ProjectsPage` `createButtonText`, PRJ-2), the
 * descriptor's `ListActions`. Gated on `create projectrequests` (SAFE5-2): a read-only user, a read-only grant or a
 * cluster RBAC denial keeps it visible but disabled with the reason in a tooltip; aria-disabled without a tooltip
 * while the answer is pending.
 */
export function CreateProjectButton({ cluster }: { cluster: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const access = useResourceAccess(cluster, { verb: 'create', model: ProjectRequestModel });
  return (
    <>
      <ActionButton
        variant="primary"
        disabledReason={access.disabledReason}
        isAriaDisabled={access.isChecking}
        onClick={() => setIsOpen(true)}
      >
        Create Project
      </ActionButton>
      {isOpen && <CreateProjectModal cluster={cluster} onClose={() => setIsOpen(false)} />}
    </>
  );
}
