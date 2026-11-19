import { createContext } from 'react';

/** Shows a toast; `body` is optional detail under the title. */
export type ShowToast = (title: string, body?: string) => void;

/** Value of {@link useToast}: one function per PatternFly alert variant. */
export interface ToastApi {
  success: ShowToast;
  info: ShowToast;
  warning: ShowToast;
  danger: ShowToast;
}

export const ToastContext = createContext<ToastApi | null>(null);
