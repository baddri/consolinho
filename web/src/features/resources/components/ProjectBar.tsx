import { Divider, PageSection } from '@patternfly/react-core';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { NamespaceSelector, useLastNamespace } from '@/features/cluster-context';
import { ALL_NAMESPACES, resourcePath } from '../paths';
import type { ResourceDescriptor } from '../registry/types';
import { TopBar } from '@/shared/ui';
import styles from './ProjectBar.module.css';

/** Props for {@link ProjectBar}: where selecting a project goes is either a kind's list or a page's own path. */
export type ProjectBarProps = {
  cluster: string;
  /** A namespace or {@link ALL_NAMESPACES}. */
  namespace: string | undefined;
} & (
  | {
      /** Selecting a project opens this kind's list in it. */
      descriptor: ResourceDescriptor;
      pathFor?: never;
    }
  | {
      /**
       * Path of the page for the selected project (`undefined` = all projects), given the current query string to
       * keep — e.g. the Search page (`search/ns/<ns>`).
       */
      pathFor: (namespace: string | undefined, search: string) => string;
      descriptor?: never;
    }
);

/**
 * OCP namespace bar (`namespace-bar.tsx`, `UX.md` §2): the first row of a namespaced list or details page, above the
 * `PageHeading`, with a divider below; flush-left 16px toggle text and no vertical padding, like OCP. Rendered through
 * {@link TopBar} into the shell's fixed top section, so it stays put while the page content scrolls. Selecting a project (NS-1/NS-2) navigates to the same kind's list in it (or
 * all projects), or to `pathFor`'s path for pages that aren't a kind's list (Search), keeping the query string; the shown project is remembered for the cluster.
 */
export function ProjectBar(props: ProjectBarProps) {
  const { cluster, namespace } = props;
  const navigate = useNavigate();
  const { search } = useLocation();
  const [, rememberNamespace] = useLastNamespace(cluster);
  const selected = namespace === ALL_NAMESPACES ? undefined : namespace;

  useEffect(() => rememberNamespace(selected), [rememberNamespace, selected]);

  return (
    <TopBar>
      <PageSection className={styles.bar}>
        {/* OCP `.co-namespace-selector` wrapper (`_dropdown.scss`): caps the toggle's width. */}
        <div className={styles.selector}>
          <NamespaceSelector
            cluster={cluster}
            namespace={selected}
            onSelect={(next) =>
              void navigate(
                props.pathFor !== undefined
                  ? props.pathFor(next, search)
                  : resourcePath(cluster, props.descriptor.model, {
                      namespace: next ?? ALL_NAMESPACES,
                      search,
                    }),
              )
            }
          />
        </div>
      </PageSection>
      <Divider />
    </TopBar>
  );
}
