import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Content,
  ContentVariants,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  List,
  ListItem,
  PageSection,
  Tab,
  Tabs,
  TabTitleText,
  Title,
} from '@patternfly/react-core';
import { CloseButton } from '@patternfly/react-component-groups';
import { css } from '@patternfly/react-styles';
import { Fragment, useState } from 'react';
import { resolveSchemaPath, type OpenApiSchema } from '@/shared/k8s';
import styles from './ExploreTypeSidebar.module.css';

/** Props for {@link ExploreTypeSidebar}. */
export interface ExploreTypeSidebarProps {
  /** The kind's schema (`useOpenApiSchema`); the sidebar resolves fields from its document. */
  schema: OpenApiSchema;
  /** The kind's label ("Deployment"): the sidebar title and the breadcrumb root. */
  kindLabel: string;
  /** The title bar's Close button (OCP `toggleSidebar`). */
  onClose: () => void;
}

/** OCP `CamelCaseWrap`: lets long camelCase field names break before each capital. */
function CamelCaseWrap({ value }: { value: string }) {
  return value.split(/(?=[A-Z])/).map((part, i) => (
    // Parts of one name never reorder, so the index is a stable key.
    <Fragment key={i}>
      {i > 0 && <wbr />}
      {part}
    </Fragment>
  ));
}

interface ExploreTypeProps {
  schema: OpenApiSchema;
  kindLabel: string;
  /** Field names below the kind's root; `[]` is the kind itself. */
  path: readonly string[];
  onPathChange: (path: string[]) => void;
}

/**
 * OCP `ExploreType` (`public/components/sidebars/explore-type-sidebar.tsx`): breadcrumbs once drilled down (root = kind),
 * the current field's description, then its fields as a plain bordered list: name, type ("– required" when the
 * parent requires it), description, allowed values and "View details" when the field has fields of its own.
 */
function ExploreType({ schema, kindLabel, path, onPathChange }: ExploreTypeProps) {
  const field = resolveSchemaPath(schema.doc, schema.rootName, path);
  const properties = Object.entries(field?.properties ?? {});
  const required = new Set(field?.required);
  const breadcrumbs = path.length > 0 ? [kindLabel, ...path] : [];

  return (
    <>
      {breadcrumbs.length > 0 && (
        <Breadcrumb className="pf-v6-u-text-break-word">
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <BreadcrumbItem
                // A crumb's position is its identity: the same name can occur at two depths.
                key={i}
                isActive={isLast}
                render={
                  isLast
                    ? undefined
                    : ({ className }) => (
                        <button
                          type="button"
                          className={className}
                          onClick={() => onPathChange(path.slice(0, i))}
                        >
                          {crumb}
                        </button>
                      )
                }
              >
                {isLast ? crumb : undefined}
              </BreadcrumbItem>
            );
          })}
        </Breadcrumb>
      )}
      <Content>
        {field?.description && <p className={styles.preWrap}>{field.description}</p>}
        {properties.length === 0 ? (
          <EmptyState variant="sm" className="pf-v6-u-pt-xl-on-md">
            <EmptyStateBody>No Properties found</EmptyStateBody>
          </EmptyState>
        ) : (
          <List isPlain isBordered>
            {properties.map(([name, ref]) => (
              <ListItem key={name} data-test="resource-sidebar-item">
                <Title headingLevel="h5" className="pf-v6-u-mb-sm pf-v6-u-text-break-word">
                  <CamelCaseWrap value={name} />
                  &nbsp;
                  <Content component={ContentVariants.small}>
                    <span className="pf-v6-u-text-break-word">{ref.type}</span>
                    {required.has(name) && <> &ndash; required</>}
                  </Content>
                </Title>
                {ref.description && <p className={styles.preWrap}>{ref.description}</p>}
                {ref.enum && (
                  <p className={styles.preWrap}>
                    <strong>Allowed values: </strong>
                    <span className="pf-v6-u-text-break-word">{ref.enum.map(String).join(', ')}</span>
                  </p>
                )}
                {ref.drillable && (
                  <Button type="button" variant="link" isInline onClick={() => onPathChange([...path, name])}>
                    View details
                  </Button>
                )}
              </ListItem>
            ))}
          </List>
        )}
      </Content>
    </>
  );
}

/**
 * The YAML editor's schema sidebar (OAPI-3), OCP `ResourceSidebar` + `ExploreType` (`public/components/sidebars/`):
 * a bordered column beside the editor (hidden below the `lg` breakpoint, like OCP) with the kind label, Close and the
 * "Schema" tab (OCP's Samples/Snippets tabs don't apply: we have no samples). The drill-down path is local state; each
 * step remounts the scroll container, so a drill-down starts at the top like OCP's `sidebarScrollTop`.
 */
export function ExploreTypeSidebar({ schema, kindLabel, onClose }: ExploreTypeSidebarProps) {
  const [path, setPath] = useState<string[]>([]);
  return (
    <div
      key={path.join('/')}
      className={css(styles.sidebar, 'pf-v6-u-display-none pf-v6-u-display-block-on-lg')}
      data-test="resource-sidebar"
    >
      <PageSection hasBodyWrapper={false} className={styles.sidebarBody} aria-label={`${kindLabel} schema`}>
        <Flex flexWrap={{ default: 'nowrap' }}>
          <FlexItem grow={{ default: 'grow' }}>
            <Title headingLevel="h2" className="pf-v6-u-text-break-word">
              {kindLabel}
            </Title>
          </FlexItem>
          <CloseButton aria-label="Close" onClick={onClose} />
        </Flex>
        <div>
          <Tabs className="pf-v6-u-mb-md" defaultActiveKey="Schema" aria-label="Sidebar">
            <Tab eventKey="Schema" title={<TabTitleText>Schema</TabTitleText>}>
              <ExploreType schema={schema} kindLabel={kindLabel} path={path} onPathChange={setPath} />
            </Tab>
          </Tabs>
        </div>
      </PageSection>
    </div>
  );
}
