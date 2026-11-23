import {
  Divider,
  Flex,
  FlexItem,
  MenuToggle,
  Select,
  SelectGroup,
  SelectList,
  SelectOption,
  type MenuToggleElement,
} from '@patternfly/react-core';
import { useState, type Ref } from 'react';
import type { Pod } from '@/shared/k8s';
import { KindBadge } from '@/shared/ui';
import { containerNames } from './containers';

/** Props for {@link ContainerSelect}. */
export interface ContainerSelectProps {
  pod: Pod;
  /** Selected container name (usually from `useSelectedContainer`). */
  value: string;
  onChange: (name: string) => void;
  /** Offer init containers too, in their own group; default true (Logs). The Terminal can only exec into containers. */
  includeInit?: boolean;
  /** Disables an option, e.g. the Terminal's containers that aren't running (they can't be exec'd into). */
  isOptionDisabled?: (name: string) => boolean;
}

/** OCP `ContainerLabel`: the container kind badge ("C") and the name. */
function ContainerLabel({ name }: { name: string }) {
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} flexWrap={{ default: 'nowrap' }}>
      <KindBadge kind="Container" />
      <FlexItem>{name}</FlexItem>
    </Flex>
  );
}

/** One `SelectOption` per container name: badge and name only, as OCP `ContainerSelectOptions`. */
function ContainerOptions({
  names,
  isOptionDisabled,
}: {
  names: readonly string[];
  isOptionDisabled: ContainerSelectProps['isOptionDisabled'];
}) {
  return names.map((name) => (
    <SelectOption key={name} value={name} isDisabled={isOptionDisabled?.(name) ?? false}>
      <ContainerLabel name={name} />
    </SelectOption>
  ));
}

/**
 * Container picker of the pod Logs and Terminal toolbars (OCP `ContainerSelect`, `pod-logs.tsx`): a PF `Select` with
 * one option per container — kind badge and name; the container status is the toolbar's, not the menu's — and, when
 * the pod has init containers and `includeInit`, "Containers" and "Init containers" groups. Renders nothing for a pod without containers.
 */
export function ContainerSelect({
  pod,
  value,
  onChange,
  includeInit = true,
  isOptionDisabled,
}: ContainerSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containers = containerNames(pod);
  const initContainers = includeInit ? containerNames(pod, true) : [];
  if (containers.length === 0) return null;

  return (
    <Select
      isOpen={isOpen}
      selected={value}
      onSelect={(_event, selected) => {
        if (typeof selected === 'string') onChange(selected);
        setIsOpen(false);
      }}
      onOpenChange={setIsOpen}
      shouldFocusToggleOnSelect
      popperProps={{ appendTo: 'inline' }}
      toggle={(toggleRef: Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => setIsOpen((open) => !open)}
          isExpanded={isOpen}
          aria-label={`Container ${value}`}
        >
          <ContainerLabel name={value} />
        </MenuToggle>
      )}
    >
      {initContainers.length > 0 ? (
        <>
          <SelectGroup label="Containers">
            <SelectList aria-label="Containers">
              <ContainerOptions names={containers} isOptionDisabled={isOptionDisabled} />
            </SelectList>
          </SelectGroup>
          <Divider />
          <SelectGroup label="Init containers">
            <SelectList aria-label="Init containers">
              <ContainerOptions names={initContainers} isOptionDisabled={isOptionDisabled} />
            </SelectList>
          </SelectGroup>
        </>
      ) : (
        <SelectList aria-label="Containers">
          <ContainerOptions names={containers} isOptionDisabled={isOptionDisabled} />
        </SelectList>
      )}
    </Select>
  );
}
