import { Grid, GridItem, Icon, List, ListItem, Title } from '@patternfly/react-core';
import { CheckCircleIcon, TimesCircleIcon } from '@patternfly/react-icons';
import type { CapabilityCategory, CapabilityCheckResult } from '@/shared/api';

/** The groups of the grid, in display order. */
const GROUPS: readonly { category: CapabilityCategory; title: string }[] = [
  { category: 'read', title: 'Read' },
  { category: 'write', title: 'Write' },
];

/** Props for {@link CapabilityGrid}. */
export interface CapabilityGridProps {
  /** The checks as received; rendered in this order, whatever their ids (the check set may grow, ADR-0011). */
  checks: readonly CapabilityCheckResult[];
}

/**
 * What the credential may do cluster-wide (TEST-3): the checks grouped into Read and Write columns by `category`,
 * each showing the server's `label` with an allowed check or a denied cross whose accessible text is "allowed" /
 * "not allowed". Renders only what it receives, so a new check id needs no code change.
 */
export function CapabilityGrid({ checks }: CapabilityGridProps) {
  return (
    <Grid hasGutter md={6}>
      {GROUPS.map(({ category, title }) => {
        const inGroup = checks.filter((check) => check.category === category);
        if (inGroup.length === 0) return null;
        return (
          <GridItem key={category}>
            <section aria-label={`${title} capabilities`}>
              <Title headingLevel="h4" size="md">
                {title}
              </Title>
              <List isPlain>
                {inGroup.map((check) => (
                  <ListItem key={check.id} icon={<AllowedIcon allowed={check.allowed} />}>
                    {check.label}
                  </ListItem>
                ))}
              </List>
            </section>
          </GridItem>
        );
      })}
    </Grid>
  );
}

/** Green check (allowed) or red cross (not allowed), named for assistive technology. */
function AllowedIcon({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <Icon isInline status="success" role="img" aria-label="allowed">
      <CheckCircleIcon />
    </Icon>
  ) : (
    <Icon isInline status="danger" role="img" aria-label="not allowed">
      <TimesCircleIcon />
    </Icon>
  );
}
