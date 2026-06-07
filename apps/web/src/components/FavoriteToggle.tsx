import { IconHeart } from "../icons";
import { useFavorites, type FavKind } from "../lib/favorites";

/** Heart toggle wired to the local favorites store. Drop onto any app/ad/creator/idea row. */
export function FavoriteToggle({
  id,
  kind = "app",
  size = 16,
}: {
  id: string;
  kind?: FavKind;
  size?: number;
}) {
  const { has, toggle } = useFavorites(kind);
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
        toggle(id);
      }}
    >
      <IconHeart style={{ width: size, height: size }} />
    </button>
  );
}
