import { useState } from "react";

/**
 * App icon with graceful degradation: lettermark while there's no URL and
 * whenever the image fails to load — never a blank grey box.
 */
export function AppIcon({
  url,
  title,
  className = "app-icon",
}: {
  url: string | null | undefined;
  title: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return <div className={`${className} placeholder`}>{title.charAt(0).toUpperCase()}</div>;
  }

  return (
    <img
      className={className}
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
