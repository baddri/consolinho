import { useContext } from 'react';
import { ToastContext, type ToastApi } from './toastContext';

/**
 * Shows toast notifications — success feedback after mutations ("Granted alice ReadOnly on prod-eu-1") and failures
 * of one-click actions (ADR-0015 §6). Must be used below `ToastProvider`. The returned object is stable.
 */
export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (value === null) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return value;
}
