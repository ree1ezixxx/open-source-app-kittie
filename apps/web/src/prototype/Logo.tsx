import { useState } from "react";

// Real App Store icon when available; gradient letter-mark as offline-safe fallback.
export function Logo({
  name,
  hue,
  icon,
  size = 46,
}: {
  name: string;
  hue: number;
  icon?: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);

  if (icon && !broken) {
    return (
      <img
        className="pp-logo pp-logo-img"
        src={icon}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        style={{ width: size, height: size }}
      />
    );
  }

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const bg = `linear-gradient(140deg, hsl(${hue} 78% 56%), hsl(${(hue + 36) % 360} 70% 44%))`;
  return (
    <div
      className="pp-logo"
      style={{ background: bg, width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
