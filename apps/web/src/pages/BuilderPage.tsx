import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { PhonePreview, type LivePreview } from "../components/PhonePreview";
import { IconSparkles } from "../icons";
import type { Theme } from "../lib/theme";
import "../styles/builder.css";

/* ============================================================
   App Builder — the Rork loop: prompt -> generated Expo app ->
   live phone preview -> iterate via chat -> export.

   /dashboard/builder        landing (prompt box + recent projects)
   /dashboard/builder/:id    workspace (chat | phone preview | code)
   ============================================================ */

interface BlueprintItem {
  title: string;
  subtitle: string;
  detail: string;
}
interface BlueprintTab {
  title: string;
  symbol: string;
  kind: "feed" | "list" | "grid" | "form" | "profile";
  headline: string;
  subhead: string;
  items: BlueprintItem[];
}
interface Blueprint {
  appName: string;
  bundleId: string;
  tagline: string;
  accentHex: string;
  primaryEntity: string;
  tabs: BlueprintTab[];
}
interface GeneratedFile {
  path: string;
  contents: string;
}
interface AgentRun {
  engine: string;
  plan: string;
  todos: { label: string; done: boolean }[];
  steps: { label: string }[];
  changedFiles: string[];
}
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  run?: AgentRun;
}
interface ProjectSummary {
  id: string;
  name: string;
  prompt: string;
  engine: string;
  updatedAt: string;
}
interface ProjectDetail extends ProjectSummary {
  blueprint: Blueprint;
  projectName: string;
  files: GeneratedFile[];
  buildCommands: string[];
  messages: ChatMessage[];
  aiConfigured?: boolean;
  aiEngine?: string;
  swiftProjectName?: string;
  swiftFiles?: GeneratedFile[];
}

type PreviewStatus = "installing" | "starting" | "ready" | "failed" | "stopped";
interface PreviewView {
  projectId: string;
  port: number;
  pid: number;
  status: PreviewStatus;
  url: string;
  startedAt: number;
  lastHealthAt: number;
  error?: string;
  logTail: string[];
}

/** Route prefix this Builder instance lives under (dashboard vs /studio). */
function useBuilderBase(): string {
  return useLocation().pathname.startsWith("/studio") ? "/studio" : "/dashboard/builder";
}

const SUGGESTIONS = [
  "A habit tracker with streaks and a journal",
  "A recipe app for quick weeknight dinners",
  "A workout planner for home lifters",
  "A minimalist mood journal with insights",
];

export function BuilderPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const { id } = useParams();
  return id ? (
    <BuilderWorkspace key={id} projectId={id} theme={theme} onToggleTheme={onToggleTheme} />
  ) : (
    <BuilderLanding theme={theme} onToggleTheme={onToggleTheme} />
  );
}

/* ---- landing ----------------------------------------------------------- */

function BuilderLanding({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<ProjectSummary[]>([]);
  const navigate = useNavigate();
  const base = useBuilderBase();

  useEffect(() => {
    fetch("/api/v1/builder/projects")
      .then((r) => r.json())
      .then((r) => setRecent(r.data ?? []))
      .catch(() => setRecent([]));
  }, []);

  const create = useCallback(
    async (p: string) => {
      const text = p.trim();
      if (text.length < 3 || creating) return;
      setCreating(true);
      setError(null);
      try {
        const res = await fetch("/api/v1/builder/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: text }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message ?? "generation failed");
        navigate(`${base}/${json.data.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "generation failed");
        setCreating(false);
      }
    },
    [creating, navigate],
  );

  return (
    <PageShell
      icon={<IconSparkles />}
      title="Builder"
      sub="Describe an app. Get a running Expo project. Iterate by chat."
      theme={theme}
      onToggleTheme={onToggleTheme}
      bodyClass="flush"
    >
      <div className="builder-landing">
        <h1 className="builder-hero">What do you want to build?</h1>
        <div className="builder-promptbox">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void create(prompt);
              }
            }}
            placeholder="A habit tracker with streaks, a stats screen and a journal…"
            rows={3}
            disabled={creating}
          />
          <button className="builder-go" onClick={() => void create(prompt)} disabled={creating || prompt.trim().length < 3}>
            {creating ? "Generating…" : "Build it"}
          </button>
        </div>
        {error && <p className="builder-error">{error}</p>}
        <div className="builder-suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => void create(s)} disabled={creating}>
              {s}
            </button>
          ))}
        </div>
        {recent.length > 0 && (
          <div className="builder-recent">
            <h2>Your apps</h2>
            <div className="builder-recent-grid">
              {recent.map((p) => (
                <div key={p.id} className="builder-recent-card" role="button" tabIndex={0} onClick={() => navigate(`${base}/${p.id}`)}>
                  <span className="builder-recent-name">{p.name}</span>
                  <span className="builder-recent-prompt">{p.prompt}</span>
                  <span className={`builder-engine ${p.engine}`}>{p.engine === "gemini" ? "AI" : "offline"}</span>
                  <button
                    className="builder-recent-delete"
                    title="Delete project"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!window.confirm(`Delete ${p.name}? This can't be undone.`)) return;
                      void fetch(`/api/v1/builder/projects/${p.id}`, { method: "DELETE" }).then(() =>
                        setRecent((rs) => rs.filter((r) => r.id !== p.id)),
                      );
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

/* ---- live preview session hook ------------------------------------------ */

/** Drives the server-side Expo preview process: start/stop/poll/reload.
 *  Session lives on the server, so on mount we re-fetch status (survives view
 *  switches) and only poll while a start is in flight (non-terminal status). */
function useLivePreview(projectId: string) {
  const [session, setSession] = useState<PreviewView | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const isTerminal = (s?: PreviewStatus) => s === "ready" || s === "failed" || s === "stopped";

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(() => {
      fetch(`/api/v1/builder/projects/${projectId}/preview/status`)
        .then((r) => r.json())
        .then((r) => {
          const v: PreviewView | null = r.data ?? null;
          setSession(v);
          if (isTerminal(v?.status)) stopPolling();
        })
        .catch(() => {});
    }, 1800);
  }, [projectId, stopPolling]);

  // Re-fetch existing session on mount / project switch.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/builder/projects/${projectId}/preview/status`)
      .then((r) => r.json())
      .then((r) => {
        if (cancelled) return;
        const v: PreviewView | null = r.data ?? null;
        setSession(v);
        if (v && !isTerminal(v.status)) startPolling();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [projectId, startPolling, stopPolling]);

  const start = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/builder/projects/${projectId}/preview/start`, { method: "POST" });
      const json = await res.json();
      setSession(json.data ?? null);
      startPolling();
    } catch {
      /* polling / next status call will surface errors */
    } finally {
      setBusy(false);
    }
  }, [busy, projectId, startPolling]);

  const stop = useCallback(async () => {
    stopPolling();
    try {
      await fetch(`/api/v1/builder/projects/${projectId}/preview/stop`, { method: "POST" });
    } catch {
      /* ignore */
    }
    setSession((s) => (s ? { ...s, status: "stopped" } : { status: "stopped" } as PreviewView));
  }, [projectId, stopPolling]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { session, busy, reloadKey, start, stop, reload };
}

/** Map the live-preview hook state onto the PhonePreview `live` prop. */
function toLivePreview(lp: ReturnType<typeof useLivePreview>): LivePreview {
  const s = lp.session;
  return {
    status: lp.busy && !s ? "starting" : (s?.status ?? "idle"),
    url: s?.url,
    error: s?.error,
    logTail: s?.logTail,
    reloadKey: lp.reloadKey,
    onRetry: () => void lp.start(),
  };
}

/* ---- workspace ---------------------------------------------------------- */

function BuilderWorkspace({
  projectId,
  theme,
  onToggleTheme,
}: {
  projectId: string;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [view, setView] = useState<"preview" | "code" | "export">("preview");
  const [previewMode, setPreviewMode] = useState<"mockup" | "live">("mockup");
  const [activeTab, setActiveTab] = useState(0);
  const [activeFile, setActiveFile] = useState(0);
  const [codeTarget, setCodeTarget] = useState<"swift" | "expo">("swift");
  const [freshRunId, setFreshRunId] = useState<string | null>(null);
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const base = useBuilderBase();
  const livePreview = useLivePreview(projectId);

  useEffect(() => {
    fetch(`/api/v1/builder/projects/${projectId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Project not found" : "load failed");
        return r.json();
      })
      .then((r) => setProject(r.data))
      .catch((e) => setLoadError(e instanceof Error ? e.message : "load failed"));
  }, [projectId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [project?.messages.length]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (content.length < 2 || sending || !project) return;
    setSending(true);
    setDraft("");
    // optimistic user bubble
    setProject((p) =>
      p ? { ...p, messages: [...p.messages, { id: `tmp-${Date.now()}`, role: "user", content }] } : p,
    );
    try {
      const res = await fetch(`/api/v1/builder/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "message failed");
      const d = json.data;
      setProject((p) =>
        p
          ? {
              ...p,
              name: d.blueprint.appName,
              blueprint: d.blueprint,
              files: d.files,
              projectName: d.projectName,
              messages: [...p.messages, d.reply],
            }
          : p,
      );
      setFreshRunId(d.reply.id);
      if (d.changed) setActiveTab(0);
    } catch (e) {
      setProject((p) =>
        p
          ? {
              ...p,
              messages: [
                ...p.messages,
                {
                  id: `err-${Date.now()}`,
                  role: "assistant",
                  content: `Something went wrong: ${e instanceof Error ? e.message : "unknown error"}`,
                },
              ],
            }
          : p,
      );
    } finally {
      setSending(false);
    }
  }, [draft, sending, project, projectId]);

  if (loadError) {
    return (
      <PageShell icon={<IconSparkles />} title="Builder" sub={loadError} theme={theme} onToggleTheme={onToggleTheme}>
        <button className="builder-back" onClick={() => navigate(base)}>← Back to Builder</button>
      </PageShell>
    );
  }
  if (!project) {
    return (
      <PageShell icon={<IconSparkles />} title="Builder" sub="Loading project…" theme={theme} onToggleTheme={onToggleTheme}>
        <div />
      </PageShell>
    );
  }

  const b = project.blueprint;
  const codeFiles = codeTarget === "swift" && project.swiftFiles?.length ? project.swiftFiles : project.files;
  return (
    <PageShell
      icon={<IconSparkles />}
      title={project.name}
      sub={b.tagline}
      theme={theme}
      onToggleTheme={onToggleTheme}
      bodyClass="flush"
      toolbar={
        <div className="builder-toolbar">
          <button className="builder-back" onClick={() => navigate(base)}>← All apps</button>
          <div className="builder-views">
            {(["preview", "code", "export"] as const).map((v) => (
              <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          {project.aiConfigured === false && <span className="builder-offline-pill">offline engine</span>}
        </div>
      }
    >
      <div className="builder-workspace">
        <div className="builder-chat">
          <div className="builder-thread">
            {project.messages.map((m) =>
              m.role === "assistant" && m.run ? (
                <RunCard key={m.id} message={m} animate={m.id === freshRunId} />
              ) : (
                <div key={m.id} className={`builder-msg ${m.role}`}>
                  {mdBold(m.content)}
                </div>
              ),
            )}
            {sending && <PendingRun engine={project.aiEngine} />}
            <div ref={chatEndRef} />
          </div>
          <div className="builder-composer">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Describe a change — copy, colors, tabs, the name…"
              rows={2}
              disabled={sending}
            />
            <div className="builder-composer-row">
              <span className="builder-model-pill" title="Engine handling your messages">
                {project.aiEngine ?? "auto"}
              </span>
              <button
                className="builder-send"
                title="Send"
                onClick={() => void send()}
                disabled={sending || draft.trim().length < 2}
              >
                ↑
              </button>
            </div>
          </div>
        </div>

        <div className="builder-stage">
          {view === "preview" && (
            <div className="builder-preview-wrap">
              <div className="builder-preview-bar">
                <div className="builder-code-targets builder-preview-modes">
                  <button
                    className={previewMode === "mockup" ? "active" : ""}
                    onClick={() => setPreviewMode("mockup")}
                  >
                    Mockup
                  </button>
                  <button
                    className={previewMode === "live" ? "active" : ""}
                    onClick={() => {
                      setPreviewMode("live");
                      const s = livePreview.session?.status;
                      if (!s || s === "stopped" || s === "failed") void livePreview.start();
                    }}
                  >
                    Live
                  </button>
                </div>
                {previewMode === "mockup" ? (
                  <div className="builder-preview-actions">
                    <button
                      title="Restart preview"
                      onClick={() => {
                        setActiveTab(0);
                        setPreviewEpoch((e) => e + 1);
                      }}
                    >
                      ⟳
                    </button>
                    <button className="builder-run-device" onClick={() => setView("export")}>
                      Run on your device
                    </button>
                  </div>
                ) : livePreview.session && livePreview.session.status !== "stopped" && livePreview.session.status !== "failed" ? (
                  <span className="builder-live">
                    <span className="builder-live-dot" /> {livePreview.session.status === "ready" ? "Live" : livePreview.session.status}
                  </span>
                ) : (
                  <button
                    className="builder-go builder-run-btn"
                    onClick={() => void livePreview.start()}
                    disabled={livePreview.busy}
                  >
                    {livePreview.busy ? "Starting…" : "▶ Run"}
                  </button>
                )}
              </div>

              {previewMode === "mockup" ? (
                <PhonePreview key={previewEpoch} blueprint={b} activeTab={activeTab} onSelectTab={setActiveTab} />
              ) : (
                <>
                  <PhonePreview
                    blueprint={b}
                    activeTab={activeTab}
                    onSelectTab={setActiveTab}
                    live={toLivePreview(livePreview)}
                  />
                  {livePreview.session?.status === "ready" && livePreview.session.url && (
                    <div className="builder-live-toolbar">
                      <button onClick={() => livePreview.reload()}>⟳ Reload</button>
                      <button onClick={() => void livePreview.stop()}>■ Stop</button>
                      <a href={livePreview.session.url} target="_blank" rel="noreferrer">
                        ↗ Open
                      </a>
                      <span className="builder-live-url">{livePreview.session.url}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {view === "code" && (
            <div className="builder-code-wrap">
              <div className="builder-code-targets">
                <button className={codeTarget === "swift" ? "active" : ""} onClick={() => { setCodeTarget("swift"); setActiveFile(0); }}>
                   SwiftUI · Xcode
                </button>
                <button className={codeTarget === "expo" ? "active" : ""} onClick={() => { setCodeTarget("expo"); setActiveFile(0); }}>
                  Expo · React Native
                </button>
              </div>
              <div className="builder-code">
                <div className="builder-filetree">
                  {codeFiles.map((f, i) => (
                    <button key={f.path} className={i === activeFile ? "active" : ""} onClick={() => setActiveFile(i)}>
                      {f.path}
                    </button>
                  ))}
                </div>
                <pre className="builder-filebody">
                  <code>{codeFiles[activeFile]?.contents ?? ""}</code>
                </pre>
              </div>
            </div>
          )}
          {view === "export" && <ExportPanel project={project} />}
        </div>
      </div>
    </PageShell>
  );
}

/* ---- agent run transcript: the structured story behind each turn -------- */

/** Minimal markdown: render **bold** spans, leave everything else as text. */
function mdBold(text: string) {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : p));
}

const PENDING_STATUSES = [
  "Reading the blueprint…",
  "Creating a plan…",
  "Applying changes…",
  "Regenerating files…",
  "Validating…",
];

function PendingRun({ engine }: { engine?: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, PENDING_STATUSES.length - 1)), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="builder-run">
      <div className="builder-run-head">
        <span className="builder-run-brand">Kittie</span>
        <span className="builder-run-engine">{engine ?? "auto"}</span>
      </div>
      <div className="builder-run-step live">
        <span className="builder-spinner" />
        {PENDING_STATUSES[step]}
      </div>
    </div>
  );
}

function RunCard({ message: m, animate }: { message: ChatMessage; animate: boolean }) {
  const run = m.run!;
  const [showFiles, setShowFiles] = useState(false);
  const done = run.todos.filter((t) => t.done).length;
  const delay = (i: number) => (animate ? { animationDelay: `${i * 0.25}s` } : { animation: "none" });
  const chips = showFiles ? run.changedFiles : run.changedFiles.slice(0, 3);
  let row = 0;
  return (
    <div className="builder-run">
      <div className="builder-run-head">
        <span className="builder-run-brand">Kittie</span>
        <span className="builder-run-engine">{run.engine}</span>
      </div>
      <div className="builder-run-step" style={delay(row++)}>
        <span className="builder-run-check">✓</span>
        <span>
          Created plan: <em>{run.plan.replace(/\*\*/g, "")}</em>
        </span>
      </div>
      {run.todos.length > 0 && (
        <div className="builder-run-step" style={delay(row++)}>
          <span className="builder-run-check">✓</span>
          <span>
            {done} of {run.todos.length} to-dos completed
          </span>
        </div>
      )}
      {run.steps.map((s) => (
        <div key={s.label} className="builder-run-step" style={delay(row++)}>
          <span className="builder-run-check">✓</span>
          <span>{s.label}</span>
        </div>
      ))}
      <div className="builder-run-summary" style={delay(row++)}>
        {mdBold(m.content)}
      </div>
      {run.changedFiles.length > 0 && (
        <div className="builder-run-files" style={delay(row++)}>
          {chips.map((f) => (
            <span key={f} className="builder-file-chip">
              {f.split("/").pop()}
            </span>
          ))}
          {!showFiles && run.changedFiles.length > 3 && (
            <button className="builder-file-chip more" onClick={() => setShowFiles(true)}>
              +{run.changedFiles.length - 3} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- export -------------------------------------------------------------- */

function ExportPanel({ project }: { project: ProjectDetail }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="builder-export">
      <h3>Native SwiftUI · Xcode</h3>
      <ol>
        <li>Download and unzip the Xcode project.</li>
        <li>
          <code>open {project.swiftProjectName ?? project.name}.xcodeproj</code>
        </li>
        <li>⌘R — runs on any iOS 17+ simulator or device.</li>
      </ol>
      <div className="builder-export-actions">
        <button
          className="builder-go"
          onClick={() => {
            window.location.href = `/api/v1/builder/projects/${project.id}/zip?target=xcode`;
          }}
        >
          Download Xcode project
        </button>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(
              (project.swiftFiles ?? project.files).map((f) => `--- ${f.path} ---\n${f.contents}`).join("\n\n"),
            );
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied!" : "Copy Swift files"}
        </button>
      </div>

      <h3>Expo · React Native</h3>
      <ol>
        <li>Download the Expo project zip and unzip it.</li>
        <li>
          <code>cd {project.projectName} && npx expo install && npx expo start</code>
        </li>
        <li>Scan the QR code with <strong>Expo Go</strong> on your iPhone.</li>
      </ol>
      <div className="builder-export-actions">
        <button
          className="builder-go"
          onClick={() => {
            window.location.href = `/api/v1/builder/projects/${project.id}/zip`;
          }}
        >
          Download Expo project
        </button>
      </div>
      <p className="builder-dim">
        {(project.swiftFiles ?? []).length} Swift files · {project.files.length} Expo files · bundle id{" "}
        <code>{project.blueprint.bundleId}</code>
      </p>
    </div>
  );
}
