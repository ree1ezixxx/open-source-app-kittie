import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageShell } from "../components/PageShell";
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
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
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
        navigate(`/dashboard/builder/${json.data.id}`);
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
                <div key={p.id} className="builder-recent-card" role="button" tabIndex={0} onClick={() => navigate(`/dashboard/builder/${p.id}`)}>
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
  const [activeTab, setActiveTab] = useState(0);
  const [activeFile, setActiveFile] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
        <button className="builder-back" onClick={() => navigate("/dashboard/builder")}>← Back to Builder</button>
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
          <button className="builder-back" onClick={() => navigate("/dashboard/builder")}>← All apps</button>
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
            {project.messages.map((m) => (
              <div key={m.id} className={`builder-msg ${m.role}`}>
                {m.content}
              </div>
            ))}
            {sending && <div className="builder-msg assistant pending">Thinking…</div>}
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
              placeholder='Iterate: "add a stats tab", "make the accent purple", "rename it to Pulse"…'
              rows={2}
              disabled={sending}
            />
            <button onClick={() => void send()} disabled={sending || draft.trim().length < 2}>
              Send
            </button>
          </div>
        </div>

        <div className="builder-stage">
          {view === "preview" && (
            <PhonePreview blueprint={b} activeTab={activeTab} onSelectTab={setActiveTab} />
          )}
          {view === "code" && (
            <div className="builder-code">
              <div className="builder-filetree">
                {project.files.map((f, i) => (
                  <button key={f.path} className={i === activeFile ? "active" : ""} onClick={() => setActiveFile(i)}>
                    {f.path}
                  </button>
                ))}
              </div>
              <pre className="builder-filebody">
                <code>{project.files[activeFile]?.contents ?? ""}</code>
              </pre>
            </div>
          )}
          {view === "export" && <ExportPanel project={project} />}
        </div>
      </div>
    </PageShell>
  );
}

/* ---- phone preview: a faithful web render of the blueprint -------------- */

function PhonePreview({
  blueprint: b,
  activeTab,
  onSelectTab,
}: {
  blueprint: Blueprint;
  activeTab: number;
  onSelectTab: (i: number) => void;
}) {
  const [detail, setDetail] = useState<BlueprintItem | null>(null);
  const tab = b.tabs[Math.min(activeTab, b.tabs.length - 1)];
  if (!tab) return null;
  const accent = b.accentHex;
  if (detail) {
    return (
      <div className="phone-frame">
        <div className="phone-notch" />
        <div className="phone-screen">
          <div className="phone-header phone-header-detail">
            <button className="phone-back" onClick={() => setDetail(null)}>‹ Back</button>
            <span>{detail.title}</span>
          </div>
          <div className="phone-body">
            <div className="phone-detail-hero" style={{ background: accent }}>
              <span>{detail.detail || detail.title}</span>
            </div>
            <div className="phone-headline">{detail.title}</div>
            {detail.subtitle && <div className="phone-dim">{detail.subtitle}</div>}
            <div className="phone-row" style={{ background: "#17171e", borderRadius: 12, padding: "10px 12px" }}>
              <div className="phone-row-main">
                <div className="phone-dim">{b.primaryEntity}</div>
              </div>
              <div className="phone-row-detail" style={{ color: accent }}>{detail.detail || "—"}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="phone-frame">
      <div className="phone-notch" />
      <div className="phone-screen">
        <div className="phone-header">{tab.title}</div>
        <div className="phone-body">
          {tab.kind !== "profile" && (
            <div className="phone-headline-block">
              <div className="phone-headline">{tab.headline}</div>
              {tab.subhead && <div className="phone-subhead">{tab.subhead}</div>}
            </div>
          )}
          {tab.kind === "feed" &&
            tab.items.map((it, i) => (
              <div key={i} className="phone-card phone-tappable" onClick={() => setDetail(it)}>
                <div className="phone-card-hero" style={{ background: accent }}>
                  <span>{it.detail}</span>
                </div>
                <div className="phone-card-title">{it.title}</div>
                {it.subtitle && <div className="phone-dim">{it.subtitle}</div>}
              </div>
            ))}
          {tab.kind === "grid" && (
            <div className="phone-grid">
              {tab.items.map((it, i) => (
                <div key={i} className="phone-tile phone-tappable" onClick={() => setDetail(it)}>
                  <div className="phone-tile-hero" style={{ background: `${accent}55` }}>
                    <span style={{ color: accent }}>{it.detail}</span>
                  </div>
                  <div className="phone-tile-title">{it.title}</div>
                </div>
              ))}
            </div>
          )}
          {(tab.kind === "list" || tab.kind === "profile") && (
            <div className={tab.kind === "profile" ? "phone-profile-card" : undefined}>
              {tab.kind === "profile" && (
                <div className="phone-profile-top">
                  <div className="phone-avatar" style={{ background: `${accent}66` }} />
                  <div className="phone-headline">{tab.headline}</div>
                  {tab.subhead && <div className="phone-dim">{tab.subhead}</div>}
                </div>
              )}
              {tab.items.map((it, i) => (
                <div key={i} className="phone-row phone-tappable" onClick={() => setDetail(it)}>
                  <div className="phone-row-icon" style={{ background: `${accent}44` }} />
                  <div className="phone-row-main">
                    <div className="phone-row-title">{it.title}</div>
                    {it.subtitle && <div className="phone-dim">{it.subtitle}</div>}
                  </div>
                  {it.detail && (
                    <div className="phone-row-detail" style={{ color: accent }}>
                      {it.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {tab.kind === "form" && (
            <div className="phone-form">
              <div className="phone-input">Title</div>
              <div className="phone-input tall">Notes</div>
              <div className="phone-button" style={{ background: accent }}>
                Add
              </div>
              {tab.items.map((it, i) => (
                <div key={i} className="phone-row">
                  <div className="phone-row-icon" style={{ background: `${accent}44` }} />
                  <div className="phone-row-main">
                    <div className="phone-row-title">{it.title}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="phone-tabbar">
          {b.tabs.map((t, i) => (
            <button
              key={i}
              className="phone-tab"
              style={{ color: i === activeTab ? accent : undefined }}
              onClick={() => onSelectTab(i)}
            >
              <span className="phone-tab-dot" style={{ background: i === activeTab ? accent : "currentColor" }} />
              {t.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---- export -------------------------------------------------------------- */

function ExportPanel({ project }: { project: ProjectDetail }) {
  const [copied, setCopied] = useState(false);

  const download = () => {
    window.location.href = `/api/v1/builder/projects/${project.id}/zip`;
  };

  return (
    <div className="builder-export">
      <h3>Run it on your phone</h3>
      <ol>
        <li>Download the project zip and unzip it.</li>
        <li>
          <code>unzip {project.projectName}.zip</code>
        </li>
        <li>
          <code>cd {project.projectName} && npx expo install && npx expo start</code>
        </li>
        <li>Scan the QR code with <strong>Expo Go</strong> on your iPhone.</li>
      </ol>
      <div className="builder-export-actions">
        <button className="builder-go" onClick={download}>
          Download .zip
        </button>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(
              project.files.map((f) => `--- ${f.path} ---\n${f.contents}`).join("\n\n"),
            );
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied!" : "Copy all files"}
        </button>
      </div>
      <p className="builder-dim">
        {project.files.length} files · bundle id <code>{project.blueprint.bundleId}</code>
      </p>
    </div>
  );
}
