import { useEffect } from "react";
import { IconClose, IconChevron } from "../icons";

export function Lightbox({
  images,
  index,
  onIndex,
  onClose,
  title,
}: {
  images: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  title: string;
}) {
  const prev = () => onIndex((index - 1 + images.length) % images.length);
  const next = () => onIndex((index + 1) % images.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, images.length]);

  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lb-close" onClick={onClose} aria-label="Close"><IconClose /></button>
      <div className="lb-counter">{index + 1} / {images.length}</div>

      {images.length > 1 && (
        <button className="lb-nav lb-prev" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Previous">
          <IconChevron style={{ transform: "rotate(90deg)" }} />
        </button>
      )}

      <img
        className="lb-img"
        src={images[index]}
        alt={`${title} screenshot ${index + 1}`}
        referrerPolicy="no-referrer"
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
        <button className="lb-nav lb-next" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Next">
          <IconChevron style={{ transform: "rotate(-90deg)" }} />
        </button>
      )}
    </div>
  );
}
