import {
  Divider,
  HelperText,
  HelperTextItem,
  Menu,
  MenuContainer,
  MenuContent,
  MenuFooter,
  MenuItem,
  MenuList,
  MenuSearch,
  MenuSearchInput,
  MenuToggle,
  SearchInput,
  Switch,
} from '@patternfly/react-core';
import { useEffect, useRef, useState } from 'react';
import type { ApiError } from '@/shared/api';
import { dnsLabel } from '@/shared/forms/dnsLabel';
import { NoMatchStatus } from './NoMatchStatus';
import { useNamespaceFallback } from './useNamespaceFallback';
import { useProjectOptions, type ProjectOption } from './useProjectOptions';
import { isDefaultProject, useShowDefaultProjects } from './useShowDefaultProjects';

/** Menu item id of "All projects"; `#` can't occur in a namespace name. */
const ALL_ITEM = '#all';

/** Prefix of the "Go to namespace" item id (NSF-2); `#` keeps it apart from the listed names. */
const GO_TO_PREFIX = '#go-to:';

/** Namespace names are DNS labels of at most 63 characters (typed fallback, NS-3). */
const namespaceName = dnsLabel(63, { requiredMessage: 'Enter a name.' });

/** Props of {@link NamespaceSelector}. */
export interface NamespaceSelectorProps {
  cluster: string;
  /** The selected project; `undefined` = all projects. */
  namespace: string | undefined;
  /** Called with the chosen project, `undefined` for "All projects". The caller navigates. */
  onSelect: (namespace: string | undefined) => void;
}

function matchesSearch(option: ProjectOption, needle: string): boolean {
  return [option.name, option.displayName ?? ''].some((field) => field.toLowerCase().includes(needle));
}

/** What the fallback menu (NSF-1/2) offers for the search text `typed`. */
interface FallbackItems {
  /** Configured namespaces plus the selected one, filtered by the search text. */
  names: string[];
  /** The typed name when it is a valid DNS label that isn't an exact item: offered as "Go to …" first. */
  goTo: string | undefined;
}

function fallbackItems(namespaces: string[], selected: string | undefined, typed: string): FallbackItems {
  const all = selected && !namespaces.includes(selected) ? [...namespaces, selected] : namespaces;
  const needle = typed.toLowerCase();
  const names = needle ? all.filter((name) => name.includes(needle)) : all;
  const goTo = typed && !all.includes(typed) && namespaceName.safeParse(typed).success ? typed : undefined;
  return { names, goTo };
}

/** Why the list is unavailable, phrased as an invitation to type a name instead (NS-3). */
function fallbackText(error: ApiError, cluster: string, noun: string): string {
  const lower = noun.toLowerCase();
  const reason =
    error.code === 'Kubernetes.Forbidden'
      ? `You can't list ${lower}s on ${cluster}`
      : (error.detail ?? error.title).replace(/\.$/, '');
  return `${reason}; enter a ${lower} name.`;
}

/**
 * OCP-style project selector (namespace bar; a default `MenuToggle` that `ProjectBar.module.css` flattens like OCP
 * `NamespaceMenuToggle`) for namespaced list and details pages (NS-1..4).
 * Controlled and navigation-free: the caller passes the selected project and maps `onSelect` to a URL. Same
 * structure as {@link ClusterSwitcher}: PF `MenuContainer` + `Menu` (role `listbox`) with a search box focused on open
 * (Enter picks the first match), an "All projects" item, the live list from {@link useProjectOptions} (fetched while
 * open), and a "Show default projects" switch ({@link useShowDefaultProjects}) in the footer. Default projects are
 * hidden unless switched on; the selected one always shows.
 *
 * **Fallback mode** (NSF-1/2, {@link useNamespaceFallback}): when an access review says the token can't list the
 * kind (checked when the menu opens; the list is then never requested) or the list answers 403, the menu offers the namespaces the admin
 * configured for the user's access instead, without "All …", with a `Go to namespace "<typed>"` first item for any
 * other valid name (Enter picks it), and footer helper text in place of the switch. Any other list error keeps NS-3:
 * the menu says why and Enter selects the typed name after a DNS-label check.
 */
export function NamespaceSelector({ cluster, namespace, onSelect }: NamespaceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [typedError, setTypedError] = useState<string>();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [showDefaults, setShowDefaults] = useShowDefaultProjects();
  // Reviewed only once the menu opens: rendering a page sends no access review (T-0370).
  const { isFallback, namespaces } = useNamespaceFallback(cluster, { enabled: isOpen });
  // Only list once the access review allows it: a token that can't list must not send a doomed request (NSF-1).
  const { options, noun, error } = useProjectOptions(cluster, isOpen && isFallback === false);
  const lower = noun.toLowerCase();
  const allLabel = `All ${lower}s`;
  const isFallbackMode = isFallback === true || (error?.code === 'Kubernetes.Forbidden' && !options);

  // Focus the search box once the popper has rendered the menu (as in ClusterSwitcher).
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const needle = searchText.trim().toLowerCase();
  const noMatchText = `No ${lower}s match "${searchText.trim()}"`;
  const visible = (options ?? []).filter(
    (option) => option.name === namespace || showDefaults || !isDefaultProject(option.name),
  );
  const matches = needle ? visible.filter((option) => matchesSearch(option, needle)) : visible;
  const fallback = error && !options && !isFallbackMode ? fallbackText(error, cluster, noun) : undefined;
  const configured = fallbackItems(namespaces, namespace, searchText.trim());
  const fallbackNoMatch =
    isFallbackMode && needle && namespaces.length > 0 && configured.names.length === 0 && !configured.goTo;

  const changeOpen = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSearchText('');
      setTypedError(undefined);
    }
  };

  const choose = (next: string | undefined) => {
    changeOpen(false);
    toggleRef.current?.focus();
    if (next !== namespace) onSelect(next);
  };

  const onSearch = () => {
    if (isFallbackMode) {
      const typed = searchText.trim();
      const first = configured.goTo ?? configured.names[0];
      if (first) choose(first);
      else if (typed) setTypedError(namespaceName.safeParse(typed).error?.issues[0]?.message);
      return;
    }
    if (fallback) {
      const parsed = namespaceName.safeParse(searchText.trim());
      if (parsed.success) choose(parsed.data);
      else setTypedError(parsed.error.issues[0]?.message);
      return;
    }
    const first = matches[0];
    if (needle && first) choose(first.name);
  };

  const items = () => {
    if (isFallbackMode) {
      return (
        <>
          {configured.goTo && (
            <MenuItem key="go-to" itemId={`${GO_TO_PREFIX}${configured.goTo}`}>
              {`Go to ${lower} "${configured.goTo}"`}
            </MenuItem>
          )}
          {configured.names.map((name) => (
            <MenuItem key={name} itemId={name}>
              {name}
            </MenuItem>
          ))}
          {fallbackNoMatch && <MenuItem isDisabled>{noMatchText}</MenuItem>}
        </>
      );
    }
    if (fallback) {
      // The list is unavailable; still offer the current project so it can be re-selected.
      return namespace && <MenuItem itemId={namespace}>{namespace}</MenuItem>;
    }
    if (!options) return <MenuItem isDisabled>{`Loading ${lower}s…`}</MenuItem>;
    if (matches.length === 0) {
      return <MenuItem isDisabled>{noMatchText}</MenuItem>;
    }
    return matches.map((option) => (
      <MenuItem key={option.name} itemId={option.name} description={option.displayName}>
        {option.name}
      </MenuItem>
    ));
  };

  const menu = (
    <Menu
      ref={menuRef}
      role="listbox"
      selected={namespace ?? ALL_ITEM}
      // PatternFly types item ids as `any`; accept `unknown` and narrow.
      onSelect={(_event, itemId: unknown) => {
        if (typeof itemId !== 'string') return;
        if (itemId === ALL_ITEM) choose(undefined);
        else choose(itemId.startsWith(GO_TO_PREFIX) ? itemId.slice(GO_TO_PREFIX.length) : itemId);
      }}
      isScrollable
    >
      <MenuSearch>
        <MenuSearchInput>
          <SearchInput
            ref={searchRef}
            aria-label={fallback ? `${noun} name` : `Search ${lower}s`}
            placeholder={fallback ? `${noun} name` : `Search ${lower}s`}
            value={searchText}
            onChange={(_event, value) => {
              setSearchText(value);
              setTypedError(undefined);
            }}
            onClear={() => setSearchText('')}
            onSearch={onSearch}
          />
        </MenuSearchInput>
        <HelperText isLiveRegion>
          {fallback && <HelperTextItem>{fallback}</HelperTextItem>}
          {typedError && <HelperTextItem variant="error">{typedError}</HelperTextItem>}
        </HelperText>
        <NoMatchStatus
          text={
            fallbackNoMatch || (options && !fallback && !isFallbackMode && needle && matches.length === 0)
              ? noMatchText
              : undefined
          }
        />
      </MenuSearch>
      <Divider />
      <MenuContent maxMenuHeight="50vh">
        <MenuList aria-label={`${noun}s`}>
          {!needle && !isFallbackMode && <MenuItem itemId={ALL_ITEM}>{allLabel}</MenuItem>}
          {items()}
        </MenuList>
      </MenuContent>
      <MenuFooter>
        {isFallbackMode ? (
          <HelperText>
            <HelperTextItem>{`You can't list ${lower}s on this cluster. Showing the ${lower}s configured for your access.`}</HelperTextItem>
          </HelperText>
        ) : (
          <Switch
            id={`show-default-projects-${cluster}`}
            label={`Show default ${lower}s`}
            isChecked={showDefaults}
            onChange={(_event, checked) => setShowDefaults(checked)}
          />
        )}
      </MenuFooter>
    </Menu>
  );

  return (
    <MenuContainer
      isOpen={isOpen}
      onOpenChange={changeOpen}
      menu={menu}
      menuRef={menuRef}
      toggleRef={toggleRef}
      toggle={
        <MenuToggle
          ref={toggleRef}
          onClick={() => changeOpen(!isOpen)}
          isExpanded={isOpen}
        >
          {`${noun}: ${namespace ?? (isFallbackMode ? `Select a ${lower}` : allLabel)}`}
        </MenuToggle>
      }
    />
  );
}
