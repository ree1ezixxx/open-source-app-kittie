import { IconHeart } from "../icons";
import { useFavorites, type FavoriteSnapshot, type FavoriteType } from "../lib/favorites";

/**
 * Heart toggle wired to the local favorites store. Drop onto any app/ad/creator/idea row.
 * `snapshot` is the small display payload the Favorites page renders from without refetching.
 */
export function FavoriteToggle({
  type,
  id,
  snapshot,
  size = 16,
}: {
  type: FavoriteType;
  id: string;
  snapshot: FavoriteSnapshot;
  size?: number;
}) {
  const { has, toggle } = useFavorites(type);
  const on = has(id);
  return (
    <button
      type="button"
      className={`fav-toggle ${on ? "on" : ""}`}
      aria-pressed={on}
      title={on ? "Remove from favorites" : "Add to favorites"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggle(id, snapshot);
      }}
    >
      <IconHeart style={{ width: size, height: size }} />
    </button>
  );
}
