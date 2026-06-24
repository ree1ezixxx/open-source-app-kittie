import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "kittie-theme";

function read(): Theme {
  const saved = localStorage.getItem(KEY);
  // Canonical UI is LIGHT-first (the App Teardown design); dark stays available via toggle.
  return saved === "dark" ? "dark" : "light";
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}
