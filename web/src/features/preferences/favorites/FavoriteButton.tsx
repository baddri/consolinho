import { Button, Tooltip } from '@patternfly/react-core';
import { useState } from 'react';
import { useLocation } from 'react-router';
import type { HeadingFavoriteProps } from '@/shared/ui';
import { AddFavoriteModal, sanitizeFavoriteName } from './AddFavoriteModal';
import styles from './FavoriteButton.module.css';
import { MAX_FAVORITE_COUNT, useFavorites } from './useFavorites';

/** `/c/<cluster>/…` → `<cluster>`; favourites outside a cluster have none. */
function clusterOf(pathname: string): string | undefined {
  return /^\/c\/([^/]+)/.exec(pathname)?.[1];
}

/**
 * Suggested name: the heading title (else the last URL segment, like OCP) plus the cluster, because the same page
 * on another cluster is a different favourite and the nav entry must tell them apart.
 */
function suggestedName(pathname: string, defaultName: string | undefined): string {
  const base = defaultName ?? pathname.split('/').filter(Boolean).at(-1) ?? '';
  const cluster = clusterOf(pathname);
  return sanitizeFavoriteName(cluster ? `${base} ${cluster}` : base);
}

/**
 * The heading star (OCP `FavoriteButton`, provided to every `PageHeading` by the app shell): stars the current page
 * (pathname, so the cluster is part of it) after asking for a name, or un-stars it at once. Disabled with an
 * explanatory tooltip once {@link MAX_FAVORITE_COUNT} pages are starred.
 */
export function FavoriteButton({ defaultName }: HeadingFavoriteProps) {
  const { pathname } = useLocation();
  const { favorites, add, remove } = useFavorites();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isStarred = favorites?.some((favorite) => favorite.url === pathname) ?? false;
  const isDisabled = !isStarred && (favorites?.length ?? 0) >= MAX_FAVORITE_COUNT;
  const tooltip = isDisabled
    ? `Maximum number of favorites (${MAX_FAVORITE_COUNT}) reached. To add another favorite, remove an existing page from your favorites.`
    : isStarred
      ? 'Remove from favorites'
      : 'Add to favorites';

  return (
    <>
      <Tooltip content={tooltip} position="top" aria="none">
        <Button
          className={styles.xlIconButton}
          variant="plain"
          isFavorite
          isFavorited={isStarred}
          aria-label={tooltip}
          aria-pressed={isStarred}
          isAriaDisabled={isDisabled}
          onClick={() => (isStarred ? remove(pathname) : setIsModalOpen(true))}
        />
      </Tooltip>
      {isModalOpen && (
        <AddFavoriteModal
          defaultName={suggestedName(pathname, defaultName)}
          takenNames={(favorites ?? []).map((favorite) => favorite.name)}
          onSave={(name) => {
            add({ name, url: pathname });
            setIsModalOpen(false);
          }}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
}
