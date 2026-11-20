import { useStoredValue } from '@/shared/hooks';

const STORAGE_KEY = 'fleetconsole.showDefaultProjects';

const parseFlag = (raw: string): boolean | undefined =>
  raw === 'true' ? true : raw === 'false' ? false : undefined;
const serializeFlag = (value: boolean): string => String(value);

/**
 * NS-4: a project is a "default project" when it is `default`, `openshift`, or starts with `openshift-` / `kube-` —
 * platform namespaces most users never work in.
 */
export function isDefaultProject(name: string): boolean {
  return (
    name === 'default' || name === 'openshift' || name.startsWith('openshift-') || name.startsWith('kube-')
  );
}

/**
 * The project selector's "Show default projects" toggle (NS-4), remembered per browser in
 * `localStorage['fleetconsole.showDefaultProjects']`; off by default.
 */
export function useShowDefaultProjects(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useStoredValue(STORAGE_KEY, parseFlag, serializeFlag);
  return [show ?? false, setShow];
}
