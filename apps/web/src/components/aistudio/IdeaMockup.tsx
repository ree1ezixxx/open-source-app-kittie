import { useMemo } from "react";
import type { AppIdea } from "../../lib/api/ideas";
import { buildMockupHtml } from "../../lib/ideaMockup";

/**
 * Per-idea app mockup rendered as a LIVE <iframe srcdoc> (parity with
 * appkittie's iframe mockups). The HTML is generated deterministically from the
 * idea's own blueprint (see lib/ideaMockup) — distinct, fully-styled, app-like,
 * and quota-free. The device renders at logical 390px and is scaled to a fixed
 * display width; the container clips to the top of the screen, like truth.
 */

const DEVICE_W = 390;
const DISPLAY_W = 240; // on-screen px width of the phone
const SCALE = DISPLAY_W / DEVICE_W;

export function IdeaMockup({ idea, height = 252 }: { idea: AppIdea; height?: number }) {
  // Key on the whole idea: it reads title/category/blueprint, which can be
  // backfilled under the same id — narrowing to [idea.id] would stick stale HTML.
  const html = useMemo(() => buildMockupHtml(idea), [idea]);

  return (
    <div className="idea-mockup" style={{ height }} aria-hidden>
      <div className="idea-frame-wrap" style={{ width: DISPLAY_W, height }}>
        <iframe
          className="idea-frame"
          title=""
          tabIndex={-1}
          aria-hidden
          loading="lazy"
          sandbox=""
          srcDoc={html}
          style={{ width: DEVICE_W, height: 844, transform: `scale(${SCALE})`, transformOrigin: "top left" }}
        />
      </div>
    </div>
  );
}
