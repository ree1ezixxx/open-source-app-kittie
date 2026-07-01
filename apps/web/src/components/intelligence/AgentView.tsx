import { useState } from "react";
import { IconCheck, IconTerminal } from "../../icons";
import type { DataSource } from "../../lib/intelligence/types";

/**
 * The agent-readable block every intelligence surface exposes (PRD §12): the
 * model's own `agentSummary` digest plus the full raw structured payload,
 * collapsed by default, with copy-to-clipboard. Makes each page extractable by a
 * coding agent, not just legible to a human.
 */
export function AgentView({
  summary,
  data,
  source,
  label = "Agent view",
}: {
  summary: string;
  data: unknown;
  /** When "mock", the block says so — a preview payload is never sold as live. */
  source?: DataSource;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (insecure context) — no-op */
    }
  }

  return (
    <section className="agentview" aria-label="Agent-readable output">
      <button className="agentview-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <IconTerminal />
        <span className="agentview-label">{label}</span>
        <span className="agentview-hint">{open ? "Hide" : "Summary + raw JSON"}</span>
      </button>
      {open && (
        <div className="agentview-body">
          <p className="agentview-summary">{summary}</p>
          <div className="agentview-rawhead">
            <span>
              Raw structured output{source === "mock" ? " · preview fixture" : ""}
            </span>
            <button className="agentview-copy" onClick={copy}>
              {copied ? (
                <>
                  <IconCheck /> Copied
                </>
              ) : (
                "Copy JSON"
              )}
            </button>
          </div>
          <pre className="agentview-json">
            <code>{json}</code>
          </pre>
        </div>
      )}
    </section>
  );
}
