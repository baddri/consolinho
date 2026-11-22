import { useCallback, useMemo } from 'react';
import { useCurrentUser } from '@/features/auth';
import { useStoredValue } from '@/shared/hooks';

/** A starred page: OCP `FavoritesType` entry. `url` is the SPA pathname, so it includes the `/c/<cluster>` segment. */
export interface Favorite {
  name: string;
  url: string;
}

/** OCP `MAX_FAVORITE_COUNT`: the star is disabled once this many pages are starred. */
export const MAX_FAVORITE_COUNT = 10;

/** Parses the stored JSON array, keeping only well-formed entries; anything malformed means "no favourites". */
function parseFavorites(raw: string): Favorite[] | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return undefined;
    return value.flatMap((item: unknown): Favorite[] => {
      if (typeof item !== 'object' || item === null) return [];
      const { name, url } = item as Record<string, unknown>;
      return typeof name === 'string' && typeof url === 'string' ? [{ name, url }] : [];
    });
  } catch {
    return undefined;
  }
}

const serializeFavorites = (favorites: Favorite[]): string => JSON.stringify(favorites);

/** Result of {@link useFavorites}. */
export interface FavoritesState {
  /** Starred pages in the order they were added; `undefined` until the user is known. */
  favorites: Favorite[] | undefined;
  add: (favorite: Favorite) => void;
  remove: (url: string) => void;
}

/**
 * The user's starred pages (OCP `console.favorites` user setting), remembered per user in
 * `localStorage['fleetconsole.favorites.<username>']` and shared live by the heading star and the Favorites nav
 * section. Browser-local like the recent clusters; no backend involved.
 */
export function useFavorites(): FavoritesState {
  const { data: user } = useCurrentUser();
  const [stored, setStored] = useStoredValue(
    user ? `fleetconsole.favorites.${user.username}` : undefined,
    parseFavorites,
    serializeFavorites,
  );
  const favorites = useMemo(() => (user ? (stored ?? []) : undefined), [user, stored]);

  const add = useCallback(
    (favorite: Favorite) =>
      setStored([...(favorites ?? []).filter((other) => other.url !== favorite.url), favorite]),
    [favorites, setStored],
  );
  const remove = useCallback(
    (url: string) => setStored((favorites ?? []).filter((favorite) => favorite.url !== url)),
    [favorites, setStored],
  );
  return { favorites, add, remove };
}
