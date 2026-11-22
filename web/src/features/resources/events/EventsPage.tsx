import {
  Label,
  LabelGroup,
  MenuToggle,
  PageSection,
  Select,
  SelectList,
  SelectOption,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { apiVersionOf, EventModel, useK8sList } from '@/shared/k8s';
import { FilterTextInput, KindBadge, PageBody, PageHeading } from '@/shared/ui';
import { ProjectBar } from '../components/ProjectBar';
import { ALL_NAMESPACES } from '../paths';
import { resourceDescriptors } from '../registry/registry';
import type { ResourceDescriptor } from '../registry/types';
import { EventKindSelect, type EventKindOption } from './EventKindSelect';
import { eventKindKey, type EventFilters, type EventResource, type EventTypeFilter } from './eventStream';
import { EventStreamView } from './EventStreamView';

const EVENT_TYPES: Record<EventTypeFilter, string> = {
  all: 'All types',
  normal: 'Normal',
  warning: 'Warning',
};

function isEventType(value: unknown): value is EventTypeFilter {
  return typeof value === 'string' && Object.hasOwn(EVENT_TYPES, value);
}

/** The "All types" select (OCP `ConsoleSelect` of event types). */
function EventTypeSelect({ value, onChange }: { value: EventTypeFilter; onChange: (value: EventTypeFilter) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Select
      isOpen={isOpen}
      selected={value}
      onSelect={(_event, selection) => {
        if (isEventType(selection)) onChange(selection);
        setIsOpen(false);
      }}
      onOpenChange={setIsOpen}
      toggle={(toggleRef) => (
        <MenuToggle ref={toggleRef} isExpanded={isOpen} onClick={() => setIsOpen(!isOpen)} aria-label="Event type">
          {EVENT_TYPES[value]}
        </MenuToggle>
      )}
    >
      <SelectList>
        {(Object.keys(EVENT_TYPES) as EventTypeFilter[]).map((type) => (
          <SelectOption key={type} value={type}>
            {EVENT_TYPES[type]}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  );
}

/**
 * The "Resources" options: every registered kind plus the kinds the watched events are about (Jobs, Nodes, …), by
 * kind name. OCP offers every API resource of the cluster; we have no full discovery list, and kinds without events
 * would only filter to nothing. Reads the stream's shared list query, so no extra request.
 */
function useKindOptions(cluster: string, namespace: string | undefined): EventKindOption[] {
  const events = useK8sList<EventResource>(cluster, EventModel, { namespace });
  const data = events.data;
  return useMemo(() => {
    const options = new Map<string, EventKindOption>();
    for (const { model } of resourceDescriptors()) {
      if (model === EventModel) continue;
      const key = eventKindKey(apiVersionOf(model), model.kind);
      options.set(key, { key, kind: model.kind, abbr: model.abbr });
    }
    for (const { involvedObject } of data ?? []) {
      if (!involvedObject.kind) continue;
      const key = eventKindKey(involvedObject.apiVersion, involvedObject.kind);
      if (!options.has(key)) options.set(key, { key, kind: involvedObject.kind });
    }
    return [...options.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));
  }, [data]);
}

/** Props for {@link EventsPage}. */
export interface EventsPageProps {
  descriptor: ResourceDescriptor;
  cluster: string;
  /** A namespace or {@link ALL_NAMESPACES}. */
  namespace: string | undefined;
}

/**
 * The Events list page as OCP's event stream (`public/components/events.tsx` `EventsList`, `UX.md` §6a): project bar,
 * "Events" heading, a toolbar of "Resources" (kinds), "All types" and "Filter Events by name or message", the selected
 * kinds as a closable "Resource" label group, then the {@link EventStreamView}. Filters live in component state, as in
 * OCP; the text filter is deferred so typing stays responsive over hundreds of cards.
 */
export function EventsPage({ descriptor, cluster, namespace }: EventsPageProps) {
  const watchNamespace = namespace === ALL_NAMESPACES ? undefined : namespace;
  const [type, setType] = useState<EventTypeFilter>('all');
  const [kinds, setKinds] = useState<readonly string[]>([]);
  const [text, setText] = useState('');
  const deferredText = useDeferredValue(text);
  const filters = useMemo<EventFilters>(() => ({ type, kinds, text: deferredText }), [type, kinds, deferredText]);
  const kindOptions = useKindOptions(cluster, watchNamespace);
  const toggleKind = useCallback(
    (key: string) =>
      setKinds((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key])),
    [],
  );
  const optionFor = (key: string) => kindOptions.find((option) => option.key === key);

  return (
    <>
      <ProjectBar descriptor={descriptor} cluster={cluster} namespace={namespace} />
      <PageHeading title="Events" />
      <PageSection>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <EventKindSelect options={kindOptions} selected={kinds} onToggle={toggleKind} />
            </ToolbarItem>
            <ToolbarItem>
              <EventTypeSelect value={type} onChange={setType} />
            </ToolbarItem>
            <ToolbarItem className="pf-v6-u-w-100 pf-v6-u-w-50-on-sm pf-v6-u-w-25-on-xl">
              <FilterTextInput
                placeholder="Filter Events by name or message..."
                value={text}
                onChange={setText}
                isShortcutActive
                // OCP focuses this filter on the Events page (`events.tsx` `EventsList` autoFocus).
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </ToolbarItem>
          </ToolbarContent>
          {kinds.length > 0 && (
            <ToolbarContent>
              <LabelGroup
                categoryName="Resource"
                defaultIsOpen={false}
                // PatternFly replaces `${remaining}` itself (OCP passes the same literal).
                collapsedText="${remaining} more"
                expandedText="Show less"
                isClosable
                closeBtnAriaLabel="Clear resource filter"
                onClick={() => setKinds([])}
              >
                {kinds.map((key) => {
                  const option = optionFor(key);
                  const kind = option?.kind ?? key.slice(key.indexOf('~') + 1);
                  return (
                    <Label variant="outline" key={key} onClose={() => toggleKind(key)}>
                      <KindBadge kind={kind} abbr={option?.abbr} />
                      {kind}
                    </Label>
                  );
                })}
              </LabelGroup>
            </ToolbarContent>
          )}
        </Toolbar>
      </PageSection>
      <PageBody>
        <EventStreamView cluster={cluster} namespace={watchNamespace} filters={filters} />
      </PageBody>
    </>
  );
}
