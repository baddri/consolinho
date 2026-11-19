import { Alert, AlertActionCloseButton, AlertGroup } from '@patternfly/react-core';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ToastContext, type ToastApi } from './toastContext';

/** Auto-dismiss delay; PatternFly pauses it while the toast is hovered or focused. */
export const TOAST_TIMEOUT_MS = 8000;

type ToastVariant = keyof ToastApi;

interface Toast {
  id: number;
  variant: ToastVariant;
  title: string;
  body: string | undefined;
}

/** Source of toast keys. Module-level: ids only need to be unique among the toasts on screen. */
let nextToastId = 0;

/**
 * Hosts the app's toast notifications (PatternFly `AlertGroup isToast`) and provides {@link useToast}. The group is
 * a polite live region, so screen readers announce new toasts. Toasts close after {@link TOAST_TIMEOUT_MS} or via
 * their close button. Mounted once in `AppProviders`.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const api = useMemo<ToastApi>(() => {
    const show = (variant: ToastVariant) => (title: string, body?: string) => {
      const id = nextToastId++;
      setToasts((current) => [...current, { id, variant, title, body }]);
    };
    return { success: show('success'), info: show('info'), warning: show('warning'), danger: show('danger') };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <AlertGroup isToast isLiveRegion>
        {toasts.map((toast) => (
          <Alert
            key={toast.id}
            variant={toast.variant}
            title={toast.title}
            timeout={TOAST_TIMEOUT_MS}
            onTimeout={() => remove(toast.id)}
            actionClose={
              // Explicit label: PF's default repeats the variant label ("Close Danger alert: alert: …").
              <AlertActionCloseButton
                aria-label={`Close notification: ${toast.title}`}
                onClose={() => remove(toast.id)}
              />
            }
          >
            {toast.body}
          </Alert>
        ))}
      </AlertGroup>
    </ToastContext.Provider>
  );
}
