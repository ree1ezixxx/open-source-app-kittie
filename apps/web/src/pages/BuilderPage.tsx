import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { PageShell } from "../components/PageShell";
import { PhonePreview, type LivePreview, type LogEntry } from "../components/PhonePreview";
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
  logTail: LogEntry[];
}

/* Live run events (SSE) — mirrors packages/api/src/lib/run-events.ts */
interface RunEvent {
  type:
    | "phase_started"
    | "phase_completed"
    | "log"
    | "file_changed"
    | "error_detected"
    | "repair_attempt"
    | "preview_ready"
    | "run_failed"
    | "run_success";
  ts: number;
  phase?: string;
  path?: string;
  line?: string;
  error?: string;
  message?: string;
  category?: string;
  attempt?: number;
  max?: number;
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
  const [updating, setUpdating] = useState(false);
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

  /** Called when a revise run signals preview_ready. Metro watches files (no
   *  CI=1) so the running dev server already has the new code — we just confirm
   *  the port is still healthy, then bump reloadKey to re-fetch the iframe.
   *  Shows a brief "Updating preview…" state across the reload so the swap reads
   *  as intentional rather than a flicker. */
  const refreshAfterRevise = useCallback(() => {
    setUpdating(true);
    let tries = 0;
    const tick = () => {
      fetch(`/api/v1/builder/projects/${projectId}/preview/status`)
        .then((r) => r.json())
        .then((r) => {
          const v: PreviewView | null = r.data ?? null;
          if (v) setSession(v);
          if ((v?.status === "ready" && v.url) || tries >= 6) {
            setReloadKey((k) => k + 1);
            setUpdating(false);
          } else {
            tries += 1;
            setTimeout(tick, 600);
          }
        })
        .catch(() => {
          setReloadKey((k) => k + 1);
          setUpdating(false);
        });
    };
    tick();
  }, [projectId]);

  return { session, busy, updating, reloadKey, start, stop, reload, refreshAfterRevise };
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
    updating: lp.updating,
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
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [codeTab, setCodeTab] = useState<"files" | "logs">("files");
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

  /** Re-pull the project (persisted assistant message, updated blueprint). */
  const refetchProject = useCallback(async () => {
    const r = await fetch(`/api/v1/builder/projects/${projectId}`);
    if (!r.ok) return;
    const json = await r.json();
    const data = json.data as ProjectDetail;
    setProject(data);
    setActiveTab(0);
    // Animate the newest assistant run card on arrival.
    const lastAssistant = [...data.messages].reverse().find((m) => m.role === "assistant" && m.run);
    if (lastAssistant) setFreshRunId(lastAssistant.id);
  }, [projectId]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (content.length < 2 || sending || !project) return;
    setSending(true);
    setDraft("");
    setLiveRunId(null);
    setFreshRunId(null);
    // optimistic user bubble
    setProject((p) =>
      p ? { ...p, messages: [...p.messages, { id: `tmp-${Date.now()}`, role: "user", content }] } : p,
    );
    try {
      // The POST now resolves fast (202 { runId }) — the heavy pipeline runs in
      // the background. We immediately subscribe to the SSE stream keyed on runId
      // and render phases live into the pending run card; when the run ends we
      // refetch the project to pull the persisted assistant message + blueprint.
      const res = await fetch(`/api/v1/builder/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "message failed");
      if (json.runId) setLiveRunId(json.runId);
      // sending stays true until the run ends; PendingLiveRun signals completion.
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
      setSending(false);
    }
  }, [draft, sending, project, projectId]);

  /** When the live run ends, refetch + clear the in-flight state. */
  const onRunEnded = useCallback(() => {
    void refetchProject();
    setSending(false);
    setLiveRunId(null);
  }, [refetchProject]);

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
            {liveRunId ? (
              <PendingLiveRun
                runId={liveRunId}
                engine={project.aiEngine}
                onEnded={onRunEnded}
                onPreviewReady={
                  previewMode === "live" ? () => livePreview.refreshAfterRevise() : undefined
                }
              />
            ) : (
              sending && <PendingRun engine={project.aiEngine} />
            )}
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
                <button className={codeTab === "files" ? "active" : ""} onClick={() => setCodeTab("files")}>
                  Files
                </button>
                <button className={codeTab === "logs" ? "active" : ""} onClick={() => setCodeTab("logs")}>
                  Logs
                </button>
                {codeTab === "files" && (
                  <>
                    <span className="builder-code-targets-sep" />
                    <button className={codeTarget === "swift" ? "active" : ""} onClick={() => { setCodeTarget("swift"); setActiveFile(0); }}>
                       SwiftUI · Xcode
                    </button>
                    <button className={codeTarget === "expo" ? "active" : ""} onClick={() => { setCodeTarget("expo"); setActiveFile(0); }}>
                      Expo · React Native
                    </button>
                  </>
                )}
              </div>
              {codeTab === "files" ? (
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
              ) : (
                <LogsPanel projectId={projectId} session={livePreview.session} />
              )}
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

/** Indeterminate working state while the POST is in flight — no fake phase
 *  ticker. Real phases are revealed from the SSE replay once runId is known. */
function PendingRun({ engine }: { engine?: string }) {
  return (
    <div className="builder-run">
      <div className="builder-run-head">
        <span className="builder-run-brand">Kittie</span>
        <span className="builder-run-engine">{engine ?? "auto"}</span>
      </div>
      <div className="builder-run-step live">
        <span className="builder-spinner" />
        Working…
      </div>
    </div>
  );
}

/* A single timeline line surfaced live from the SSE stream. */
interface LiveLine {
  kind: "phase" | "error" | "repair" | "qa";
  text: string;
}

/** Consume the run-event SSE stream (replay + live) for an in-flight run and
 *  surface phases, build errors and repair attempts in order, with the server's
 *  own timing. Reports completion (success/failure) via `onEnded`. Closes itself
 *  when the run ends. */
function useRunEvents(
  runId: string | null,
  onEnded?: () => void,
  onPreviewReady?: () => void,
): { lines: LiveLine[]; failed: string | null; ended: boolean } {
  const [lines, setLines] = useState<LiveLine[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!runId) {
      setLines([]);
      setFailed(null);
      setEnded(false);
      return;
    }
    setLines([]);
    setFailed(null);
    setEnded(false);
    const es = new EventSource(`/api/v1/builder/runs/${runId}/events`);
    const push = (line: LiveLine) =>
      setLines((p) => (p.some((l) => l.kind === line.kind && l.text === line.text) ? p : [...p, line]));

    es.addEventListener("phase_completed", (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as RunEvent;
        if (ev.phase) push({ kind: "phase", text: ev.phase });
      } catch {
        /* ignore malformed */
      }
    });
    es.addEventListener("error_detected", (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as RunEvent;
        push({ kind: "error", text: ev.message ?? ev.line ?? "Build error detected" });
      } catch {
        push({ kind: "error", text: "Build error detected" });
      }
    });
    es.addEventListener("repair_attempt", (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as RunEvent;
        push({ kind: "repair", text: `Fixing build issue, attempt ${ev.attempt ?? "?"}/${ev.max ?? 5}` });
      } catch {
        /* ignore malformed */
      }
    });
    es.addEventListener("log", (e) => {
      // Surface Visual QA log lines (e.g. "Visual QA: 87/100") in the run card;
      // ignore other internal logs to keep the timeline focused.
      try {
        const ev = JSON.parse((e as MessageEvent).data) as RunEvent;
        const line = typeof ev.line === "string" ? ev.line : "";
        if (line.startsWith("Visual QA")) push({ kind: "qa", text: line });
      } catch {
        /* ignore malformed */
      }
    });
    es.addEventListener("preview_ready", () => {
      // The workspace was rewritten and a live preview is running; Metro
      // (watch mode) re-bundles on the next fetch, so reloading the iframe
      // pulls the revised app in. Fired before run_success closes the stream.
      onPreviewReady?.();
    });
    es.addEventListener("run_success", () => {
      setEnded(true);
      onEnded?.();
      es.close();
    });
    es.addEventListener("run_failed", (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as RunEvent;
        setFailed(ev.error ?? "run failed");
      } catch {
        setFailed("run failed");
      }
      setEnded(true);
      onEnded?.();
      es.close();
    });
    es.onerror = () => es.close();
    return () => es.close();
    // onEnded intentionally excluded: stable via useCallback, re-subscribing on
    // identity churn would drop the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return { lines, failed, ended };
}

/** In-flight run card: renders the real phase/error/repair timeline live from
 *  the SSE stream while the background pipeline runs. */
function PendingLiveRun({
  runId,
  engine,
  onEnded,
  onPreviewReady,
}: {
  runId: string;
  engine?: string;
  onEnded: () => void;
  onPreviewReady?: () => void;
}) {
  const { lines, failed, ended } = useRunEvents(runId, onEnded, onPreviewReady);
  return (
    <div className={`builder-run${failed ? " failed" : ""}`}>
      <div className="builder-run-head">
        <span className="builder-run-brand">Kittie</span>
        <span className="builder-run-engine">{engine ?? "auto"}</span>
      </div>
      {lines.map((l, i) => (
        <div key={`${l.kind}-${i}`} className={`builder-run-step ${l.kind}`}>
          <span className={`builder-run-check ${l.kind}`}>
            {l.kind === "error" ? "✗" : l.kind === "repair" ? "⟳" : l.kind === "qa" ? "◎" : "✓"}
          </span>
          <span>{l.text}</span>
        </div>
      ))}
      {!ended && (
        <div className="builder-run-step live">
          <span className="builder-spinner" />
          Working…
        </div>
      )}
      {failed && <div className="builder-run-summary failed">{failed}</div>}
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

/* ---- logs tab ------------------------------------------------------------ */

/** Live preview log stream. Reuses the already-fetched session for an instant
 *  paint, then polls the status endpoint every 2s while the tab is visible so
 *  logs keep flowing even after the session goes 'ready' (when useLivePreview
 *  stops its own polling). Auto-scrolls to the newest line. */
function LogsPanel({ projectId, session }: { projectId: string; session: PreviewView | null }) {
  const [logs, setLogs] = useState<LogEntry[]>(session?.logTail ?? []);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session?.logTail) setLogs(session.logTail);
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      fetch(`/api/v1/builder/projects/${projectId}/preview/status`)
        .then((r) => r.json())
        .then((r) => {
          if (cancelled) return;
          const v: PreviewView | null = r.data ?? null;
          if (v?.logTail) setLogs(v.logTail);
        })
        .catch(() => {});
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [projectId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <div className="builder-logs empty">
        <p className="builder-dim">
          No preview logs yet. Start a live preview (Preview → Live → Run) to stream the dev-server output here.
        </p>
      </div>
    );
  }

  return (
    <pre className="builder-logs">
      {logs.map((l, i) => (
        <div key={i} className={`builder-log-line log-${l.level}`}>
          <span className="builder-log-src">{l.source}</span>
          <span className="builder-log-msg">{l.line}</span>
        </div>
      ))}
      <div ref={endRef} />
    </pre>
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
