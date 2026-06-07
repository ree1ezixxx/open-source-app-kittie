import type { ReactNode } from "react";
import { EmptyState } from "../components/EmptyState";
import { PageShell } from "../components/PageShell";
import { IconSpark } from "../icons";
import type { Theme } from "../lib/theme";

/**
 * Temporary page for routes owned by another lane. The shell registers every route
 * so the nav is complete; each lane swaps its placeholder for the real page.
 */
export function PlaceholderPage({
  title,
  sub,
  lane,
  icon,
  theme,
  onToggleTheme,
}: {
  title: string;
  sub?: string;
  lane: string;
  icon?: ReactNode;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  return (
    <PageShell title={title} sub={sub} icon={icon || <IconSpark />} theme={theme} onToggleTheme={onToggleTheme}>
      <EmptyState
        icon={<IconSpark />}
        title={`${title} — in progress`}
        sub={`This surface is being built in ${lane}.`}
      />
    </PageShell>
  );
}
