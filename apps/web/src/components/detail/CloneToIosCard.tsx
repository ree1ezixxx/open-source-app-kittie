import { useState } from "react";
import { buildSetupScript, cloneIos, type CloneResult } from "../../lib/api/clone";
import { DetailCard } from "../DetailCard";

/**
 * "Clone to iOS" — turns a trending app into a buildable SwiftUI scaffold.
 * Generates an AI blueprint + full xcodegen project; delivers a one-run
 * self-extracting setup script plus the exact agent (CLI/MCP) commands.
 */
export function CloneToIosCard({ appId }: { appId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<CloneResult | null>(null);
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState<string>("");

  async function generate() {
    setState("loading");
    setError("");
    try {
      setResult(await cloneIos(appId));
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setState("error");
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([buildSetupScript(result)], { type: "text/x-shellscript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `setup-${result.projectName}.sh`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copy(label: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1400);
  }

  const action =
    state === "done" ? (
      <button className="btn" onClick={generate}>
        Regenerate
      </button>
    ) : (
      <button className="btn btn-accent" onClick={generate} disabled={state === "loading"}>
        {state === "loading" ? "Designing…" : "Clone to iOS"}
      </button>
    );

  const b = result?.blueprint;

  return (
    <DetailCard title="Clone to iOS" action={action}>
      {state === "idle" && (
        <p style={{ color: "var(--text-2)", fontSize: 13, margin: 0 }}>
          Generate a buildable SwiftUI app that clones this app's core UX — an AI-designed
          blueprint rendered to a complete xcodegen project you can build in Xcode.
        </p>
      )}
      {state === "error" && (
        <p style={{ color: "#ff6b6b", fontSize: 13, margin: 0 }}>Couldn't generate clone: {error}</p>
      )}
      {b && state === "done" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: b.accentHex,
                flex: "0 0 auto",
                boxShadow: `0 4px 14px -4px ${b.accentHex}`,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{b.appName}</div>
              <div style={{ color: "var(--text-2)", fontSize: 13 }}>{b.tagline}</div>
            </div>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-2)" }}>
              {result?.aiGenerated ? "AI-designed" : "template"}
              {result?.cached ? " · cached" : ""}
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {b.tabs.map((t) => (
              <span
                key={t.title}
                style={{
                  fontSize: 12,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                }}
              >
                {t.title} · {t.kind}
              </span>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button className="btn btn-accent" onClick={download}>
              Download setup script
            </button>
            <button className="btn" onClick={() => copy("cli", `pluto clone-ios ${appId}`)}>
              {copied === "cli" ? "Copied!" : "Copy CLI command"}
            </button>
          </div>

          <div style={{ fontSize: 12, color: "var(--text-2)" }}>
            {result?.files.length} files · {b.primaryEntity} app · bundle{" "}
            <code style={{ fontSize: 11 }}>{b.bundleId}</code>
            <br />
            Run the script (or <code style={{ fontSize: 11 }}>pluto clone-ios {appId}</code>), then{" "}
            <code style={{ fontSize: 11 }}>xcodegen generate &amp;&amp; open {result?.projectName}.xcodeproj</code>.
            Agents can call the <code style={{ fontSize: 11 }}>clone_ios_app</code> MCP tool.
          </div>
        </div>
      )}
    </DetailCard>
  );
}
