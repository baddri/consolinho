import { useStoredValue } from '@/shared/hooks';

/** The two views of a synced Form/YAML editor (OCP `EditorType`). */
export type EditorType = 'form' | 'yaml';

/** OCP's user-preference key `devconsole.editDeploymentForm.editor.lastView`, in our storage namespace. */
const STORAGE_KEY = 'fleetconsole.editDeploymentForm.editor.lastView';

const parse = (raw: string): EditorType | undefined => (raw === 'form' || raw === 'yaml' ? raw : undefined);
const serialize = (type: EditorType): string => type;

/**
 * The Edit Deployment page's current view, remembered across visits and reloads like OCP's `useEditorType` (FORM-1).
 * Defaults to the form view; an unknown stored value counts as none.
 */
export function useEditorType(): [EditorType, (type: EditorType) => void] {
  const [stored, setStored] = useStoredValue(STORAGE_KEY, parse, serialize);
  return [stored ?? 'form', setStored];
}
