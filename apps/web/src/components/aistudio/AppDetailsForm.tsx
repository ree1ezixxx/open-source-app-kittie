import { useRef, type ChangeEvent, type ReactNode } from "react";
import { fileToDataUrl } from "./util";
import { IconUpload } from "./icons";
import { IconClose } from "../../icons";

/** Full App Details intake — feeds the copy engine (headlines/labels). */
export type AppDetails = {
  name: string;
  subtitle: string;
  developer: string;
  category: string;
  description: string;
  prompt: string;
  targetAudience: string;
  appStoreKeywords: string; // raw comma-separated
  brandKeywords: string; // raw comma-separated — the words that go on the screenshots
  iconUrl: string; // app icon as a data URL (uploaded or imported) — shown on slides
};

export const EMPTY_DETAILS: AppDetails = {
  name: "",
  subtitle: "",
  developer: "",
  category: "",
  description: "",
  prompt: "",
  targetAudience: "",
  appStoreKeywords: "",
  brandKeywords: "",
  iconUrl: "",
};

/** Split a raw comma list into trimmed, non-empty terms. */
export function splitTerms(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="studio-field">
      <label>
        {label}
        {hint && <span className="studio-field-hint"> {hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function AppDetailsForm({
  details,
  onChange,
}: {
  details: AppDetails;
  onChange: (patch: Partial<AppDetails>) => void;
}) {
  const set =
    (k: keyof AppDetails) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ [k]: e.target.value } as Partial<AppDetails>);

  const iconRef = useRef<HTMLInputElement>(null);
  async function onIcon(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      onChange({ iconUrl: await fileToDataUrl(file) });
    } catch {
      /* ignore unreadable file */
    }
  }

  return (
    <div className="studio-details">
      <div className="studio-field">
        <label>App icon</label>
        <div className="app-icon-upload">
          {details.iconUrl ? (
            <div className="app-icon-preview">
              <img src={details.iconUrl} alt="app icon" />
              <button
                type="button"
                className="app-icon-remove"
                onClick={() => onChange({ iconUrl: "" })}
                aria-label="Remove icon"
              >
                <IconClose />
              </button>
            </div>
          ) : (
            <button type="button" className="app-icon-add" onClick={() => iconRef.current?.click()}>
              <IconUpload /> Upload app icon
            </button>
          )}
          <input ref={iconRef} type="file" accept="image/*" hidden onChange={onIcon} />
        </div>
      </div>

      <div className="studio-grid2">
        <Field label="App name *">
          <input className="studio-input" value={details.name} onChange={set("name")} placeholder="e.g. Streak — Sober Companion" />
        </Field>
        <Field label="Subtitle">
          <input className="studio-input" value={details.subtitle} onChange={set("subtitle")} placeholder="One-line value prop" />
        </Field>
        <Field label="Developer">
          <input className="studio-input" value={details.developer} onChange={set("developer")} placeholder="Studio / company" />
        </Field>
        <Field label="Category">
          <input className="studio-input" value={details.category} onChange={set("category")} placeholder="e.g. Health & Fitness" />
        </Field>
      </div>

      <Field label="App description" hint="— used to write the on-screen copy">
        <textarea
          className="studio-textarea"
          value={details.description}
          onChange={set("description")}
          placeholder="What the app does, who it's for, and the feeling the screenshots should sell."
        />
      </Field>

      <div className="studio-grid2">
        <Field label="Prompt" hint="— optional extra guidance">
          <textarea
            className="studio-textarea"
            value={details.prompt}
            onChange={set("prompt")}
            placeholder="e.g. Emphasise privacy and calm. Avoid hype."
          />
        </Field>
        <Field label="Target audience">
          <input className="studio-input" value={details.targetAudience} onChange={set("targetAudience")} placeholder="Who is this for?" />
        </Field>
      </div>

      <div className="studio-grid2">
        <Field label="App Store keywords" hint="— comma-separated">
          <input className="studio-input" value={details.appStoreKeywords} onChange={set("appStoreKeywords")} placeholder="habit, streak, focus" />
        </Field>
        <Field label="Brand keywords" hint="— go on the screenshots">
          <input className="studio-input" value={details.brandKeywords} onChange={set("brandKeywords")} placeholder="Stay on track, Daily wins, Private by design" />
        </Field>
      </div>
    </div>
  );
}
