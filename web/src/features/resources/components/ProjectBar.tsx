import { Divider, PageSection } from '@patternfly/react-core';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { NamespaceSelector, useLastNamespace } from '@/features/cluster-context';
import { ALL_NAMESPACES, resourcePath } from '../paths';
import type { ResourceDescriptor } from '../registry/types';
import styles from './ProjectBar.module.css';

/** Props for {@link ProjectBar}. */
export interface ProjectBarProps {
  descriptor: ResourceDescriptor;
  cluster: string;
  /** A namespace or {@link ALL_NAMESPACES}. */
  namespace: string | undefined;
}

/**
 * OCP namespace bar (`namespace-bar.tsx`, `UX.md` §2): the first row of a namespaced list or details page, above the
 * `PageHeading`, with a divider below; flush-left 16px toggle text and no vertical padding, like OCP. Selecting a project (NS-1/NS-2) navigates to the same kind's list in it (or
 * all projects), keeping the query string; the shown project is remembered for the cluster.
 */
export function ProjectBar({ descriptor, cluster, namespace }: ProjectBarProps) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const [, rememberNamespace] = useLastNamespace(cluster);
  const selected = namespace === ALL_NAMESPACES ? undefined : namespace;

  useEffect(() => rememberNamespace(selected), [rememberNamespace, selected]);

  return (
    <>
      <PageSection className={styles.bar}>
        <NamespaceSelector
          cluster={cluster}
          namespace={selected}
          onSelect={(next) =>
            void navigate(
              resourcePath(cluster, descriptor.model, { namespace: next ?? ALL_NAMESPACES, search }),
            )
          }
        />
      </PageSection>
      <Divider />
    </>
  );
}
