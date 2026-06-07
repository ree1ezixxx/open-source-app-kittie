import type { ReactNode } from "react";

/** Two-pane left-list / right-detail layout (App Tracking, Keyword Explorer, AI Studio). */
export function MasterDetail({
  list,
  detail,
}: {
  list: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="master-detail">
      <aside className="md-list">{list}</aside>
      <div className="md-detail">{detail}</div>
    </div>
  );
}
