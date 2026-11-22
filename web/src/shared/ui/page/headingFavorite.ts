import { createContext, type ReactNode } from 'react';

/** Props of the favourite star rendered by {@link PageHeading}. */
export interface HeadingFavoriteProps {
  /** Suggested favourite name: the heading title when it is plain text. */
  defaultName?: string;
}

/** Renders the favourite star for a heading. */
export type HeadingFavoriteRenderer = (props: HeadingFavoriteProps) => ReactNode;

/**
 * Renders the favourite star (OCP `FavoriteButton`) that every `PageHeading` shows before its actions. Injected by
 * the app shell, because favourites are per-user state owned by a feature and shared code knows no features; without
 * a provider (unit tests, pages outside the shell) headings show no star. Provide a stable (module-level) function.
 */
export const HeadingFavoriteContext = createContext<HeadingFavoriteRenderer | null>(null);
