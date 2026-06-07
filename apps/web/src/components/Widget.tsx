import type { ReactNode } from "react";

/** Dashboard card with a header + optional action (Highlights: New Big Hits / Top Gainers …). */
export function Widget({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="widget">
      <header className="widget-head">
        <h3 className="widget-title">{title}</h3>
        {action}
      </header>
      <div className="widget-body">{children}</div>
    </section>
  );
}
