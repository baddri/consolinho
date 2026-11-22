import { Button, Flex, FlexItem, NavExpandable, NavItem, Truncate } from '@patternfly/react-core';
import { Link, useLocation } from 'react-router';
import styles from './FavoritesNavSection.module.css';
import { useFavorites, type Favorite } from './useFavorites';

/** One starred page: its name, and a filled star that un-stars it without navigating (OCP `FavoriteNavItems`). */
function FavoriteNavItem({
  favorite,
  isActive,
  onRemove,
}: {
  favorite: Favorite;
  isActive: boolean;
  onRemove: () => void;
}) {
  return (
    <NavItem groupId="favorites" isActive={isActive}>
      <Link to={favorite.url} className="pf-v6-u-py-0 pf-v6-u-pr-0">
        <Flex
          className="pf-v6-u-w-100"
          justifyContent={{ default: 'justifyContentSpaceBetween' }}
          alignItems={{ default: 'alignItemsCenter' }}
          flexWrap={{ default: 'nowrap' }}
        >
          <FlexItem className="pf-v6-u-m-0">
            <Truncate content={favorite.name} />
          </FlexItem>
          <FlexItem className="pf-v6-u-mr-xs">
            <Button
              variant="plain"
              isFavorite
              isFavorited
              aria-label={`Unfavorite ${favorite.name}`}
              onClick={(event) => {
                // The star sits inside the link (as in OCP); removing must not navigate.
                event.preventDefault();
                event.stopPropagation();
                onRemove();
              }}
            />
          </FlexItem>
        </Flex>
      </Link>
    </NavItem>
  );
}

/**
 * The sidebar's "Favorites" section (OCP `FavoriteNavItems`), second after Home: the user's starred pages, or
 * "No favorites added". Like OCP it is expanded and marked active only while the current page is a favourite.
 */
export function FavoritesNavSection() {
  const { pathname } = useLocation();
  const { favorites, remove } = useFavorites();
  const isActive = favorites?.some((favorite) => favorite.url === pathname) ?? false;

  return (
    <NavExpandable title="Favorites" groupId="favorites" isActive={isActive} isExpanded={isActive}>
      {favorites?.length === 0 && <li className={styles.empty}>No favorites added</li>}
      {favorites?.map((favorite) => (
        <FavoriteNavItem
          key={favorite.url}
          favorite={favorite}
          isActive={favorite.url === pathname}
          onRemove={() => remove(favorite.url)}
        />
      ))}
    </NavExpandable>
  );
}
