import { useState } from "react";
import type { Store } from "@kittie/types";
import type { CategoryFacet } from "../lib/api";
import { IconApple, IconGooglePlay, IconFilter, IconChevron } from "../icons";
import { FilterGroup, SubLabel } from "./FilterGroup";
import { FilterSelectPopover } from "./FilterSelectPopover";
import { Pills, TogglePill } from "./Pills";
import { RangeFilter } from "./RangeFilter";
import {
  activeCount,
  TIME_WINDOWS,
  type ExploreFilters,
} from "../lib/exploreFilters";

export type CategoryMode = "include" | "exclude";

/** Category emoji map — mirrors the live rail's emoji+name chips. */
const CATEGORY_EMOJI: Record<string, string> = {
  Business: "💼",
  Communication: "💬",
  Education: "🎓",
  Entertainment: "🎬",
  Finance: "💰",
  "Food & Drink": "🍔",
  "Health & Fitness": "💪",
  Lifestyle: "✨",
  Music: "🎵",
  Navigation: "🧭",
  News: "📰",
  "News & Magazines": "🗞️",
  Personalization: "🎨",
  "Photo & Video": "📸",
  Productivity: "⚡",
  Reference: "📚",
  Shopping: "🛍️",
  Social: "👥",
  "Social Networking": "🌐",
  Sports: "⚽",
  Tools: "🔧",
  Travel: "✈️",
  Utilities: "🧰",
  "Video Players & Editors": "🎥",
  Games: "🎮",
  Medical: "🩺",
  Weather: "🌤️",
  Books: "📖",
};

export const catEmoji = (cat: string): string => CATEGORY_EMOJI[cat] ?? "📱";

/** Static ISO language list for the App Language multi-select (codes match
    apps.languages, compared case-insensitively server-side). */
const LANGUAGES: { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "sv", name: "Swedish" },
  { code: "no", name: "Norwegian" },
  { code: "da", name: "Danish" },
  { code: "fi", name: "Finnish" },
  { code: "pl", name: "Polish" },
  { code: "tr", name: "Turkish" },
  { code: "ru", name: "Russian" },
  { code: "uk", name: "Ukrainian" },
  { code: "ar", name: "Arabic" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "th", name: "Thai" },
  { code: "vi", name: "Vietnamese" },
  { code: "id", name: "Indonesian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
];

const isPresetWindow = (v: number) => v === 0 || (TIME_WINDOWS as readonly number[]).includes(v);

/** "All 7 14 30 60 90 Custom" pill row; Custom reveals a numeric days input. */
function TimeWindowRow({
  label,
  value,
  onValue,
}: {
  label: string;
  value: number; // 0 = All
  onValue: (days: number) => void;
}) {
  const [customOpen, setCustomOpen] = useState(!isPresetWindow(value));
  const customActive = customOpen || !isPresetWindow(value);

  return (
    <>
      <SubLabel>{label}</SubLabel>
      <div className="pill-row">
        <button
          className={`fpill ${value === 0 && !customOpen ? "on" : ""}`}
          onClick={() => {
            setCustomOpen(false);
            onValue(0);
          }}
        >
          All
        </button>
        {TIME_WINDOWS.map((d) => (
          <button
            key={d}
            className={`fpill ${value === d && !customOpen ? "on" : ""}`}
            onClick={() => {
              setCustomOpen(false);
              onValue(d);
            }}
          >
            {d}
          </button>
        ))}
        <button
          className={`fpill ghost ${customActive ? "on" : ""}`}
          onClick={() => {
            if (customActive) {
              setCustomOpen(false);
              if (!isPresetWindow(value)) onValue(0);
            } else {
              setCustomOpen(true);
            }
          }}
        >
          Custom
        </button>
      </div>
      {customActive && (
        <div className="frange-inputs">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="Days"
            aria-label={`${label} (days)`}
            value={value || ""}
            onChange={(e) => onValue(e.target.value ? Math.max(0, Number(e.target.value)) : 0)}
          />
          <span className="frange-affix">days ago</span>
        </div>
      )}
    </>
  );
}

export function ExploreFilterRail({
  filters: f,
  categories,
  catMode,
  onCatMode,
  langs,
  onLangs,
  onPatch,
  onClear,
}: {
  filters: ExploreFilters;
  categories: CategoryFacet[];
  catMode: CategoryMode;
  onCatMode: (mode: CategoryMode) => void;
  langs: string[];
  onLangs: (langs: string[]) => void;
  onPatch: (patch: Partial<ExploreFilters>) => void;
  onClear: () => void;
}) {
  const n = activeCount(f) + (langs.length ? 1 : 0);

  const toggleCat = (cat: string) =>
    onPatch({ cats: f.cats.includes(cat) ? f.cats.filter((c) => c !== cat) : [...f.cats, cat] });

  const toggleLang = (code: string) =>
    onLangs(langs.includes(code) ? langs.filter((l) => l !== code) : [...langs, code]);

  // Source toggles: both on = no source filter. Toggling the only-on store back
  // off (or the off one on) returns to "both", which maps to source=undefined.
  const appleOn = f.source !== "google";
  const googleOn = f.source !== "apple";
  const toggleStore = (store: Store) =>
    onPatch({ source: f.source == null ? (store === "apple" ? "google" : "apple") : undefined });

  const signalsActive = f.meta || f.aads || f.creators || f.web || f.email;
  // Contacts sub-section collapses by default (truth parity); open it if a contact filter is on.
  const [contactsOpen, setContactsOpen] = useState(f.web || f.email);

  return (
    <aside className="filter-rail">
      <div className="filter-rail-head">
        <span className="filter-rail-title">
          <IconFilter />
          Filters
          {n > 0 && <span className="filter-rail-count">{n}</span>}
        </span>
        {n > 0 && (
          <button className="link-btn" onClick={onClear}>
            Clear all
          </button>
        )}
      </div>

      <div className="filter-rail-body">
        {/* 1 — Time */}
        <FilterGroup
          label="Time"
          defaultOpen
          active={f.rel != null || f.upd != null}
          summary={[f.rel != null && `Released ≤${f.rel}d`, f.upd != null && `Updated ≤${f.upd}d`].filter(Boolean).join(" · ")}
        >
          <TimeWindowRow
            label="Released (days ago)"
            value={f.rel ?? 0}
            onValue={(v) => onPatch({ rel: v || undefined })}
          />
          <TimeWindowRow
            label="Updated (days ago)"
            value={f.upd ?? 0}
            onValue={(v) => onPatch({ upd: v || undefined })}
          />
        </FilterGroup>

        {/* 2 — Source */}
        <FilterGroup
          label="Source"
          defaultOpen
          active={!!f.source}
          summary={f.source === "apple" ? "Apple Store" : f.source === "google" ? "Google Play" : undefined}
        >
          <div className="pill-wrap">
            <TogglePill on={appleOn} onToggle={() => toggleStore("apple")} icon={<IconApple />}>
              Apple Store
            </TogglePill>
            <TogglePill on={googleOn} onToggle={() => toggleStore("google")} icon={<IconGooglePlay />}>
              Google Play
            </TogglePill>
          </div>
        </FilterGroup>

        {/* 3 — Category */}
        <FilterGroup
          label="Category"
          active={f.cats.length > 0}
          summary={f.cats.length ? `${f.cats.length} ${catMode === "exclude" ? "excluded" : "included"}` : undefined}
        >
          <FilterSelectPopover
            label="Select categories"
            searchable
            searchPlaceholder="Search categories…"
            items={categories.map((c) => ({
              id: c.name,
              label: `${catEmoji(c.name)} ${c.name}`,
              stores: c.stores,
            }))}
            selected={f.cats}
            onToggle={toggleCat}
            emptyHint="Loading categories…"
            header={
              <div className="fselect-header">
                <div className="seg-mini">
                  <button
                    type="button"
                    className={catMode === "include" ? "on" : ""}
                    onClick={() => onCatMode("include")}
                  >
                    Include
                  </button>
                  <button
                    type="button"
                    className={catMode === "exclude" ? "on" : ""}
                    onClick={() => onCatMode("exclude")}
                  >
                    Exclude
                  </button>
                </div>
              </div>
            }
          />
          {f.cats.length > 0 && (
            <div className="filter-hint">
              {f.cats.length} {catMode === "exclude" ? "excluded" : "included"}
            </div>
          )}
        </FilterGroup>

        {/* 4 — App Language */}
        <FilterGroup
          label="App Language"
          active={langs.length > 0}
          summary={langs.length ? `${langs.length} selected` : undefined}
        >
          <FilterSelectPopover
            label="Select languages"
            items={LANGUAGES.map((l) => ({ id: l.code, label: l.name }))}
            selected={langs}
            onToggle={toggleLang}
          />
        </FilterGroup>

        {/* 5 — Marketing Signals */}
        <FilterGroup
          label="Marketing Signals"
          active={signalsActive}
          summary={[f.meta && "Meta", f.aads && "Apple", f.creators && "Creators", f.web && "Web", f.email && "Email"]
            .filter(Boolean)
            .join(" · ")}
        >
          <SubLabel>Include</SubLabel>
          <div className="pill-wrap">
            <TogglePill on={f.meta} onToggle={() => onPatch({ meta: !f.meta })}>Meta Ads</TogglePill>
            <TogglePill on={f.aads} onToggle={() => onPatch({ aads: !f.aads })}>Apple Ads</TogglePill>
            <TogglePill on={f.creators} onToggle={() => onPatch({ creators: !f.creators })}>Creators</TogglePill>
          </div>
          <button
            type="button"
            className={`fsub-toggle ${contactsOpen ? "open" : ""}`}
            onClick={() => setContactsOpen((o) => !o)}
            aria-expanded={contactsOpen}
          >
            Contacts
            <IconChevron className="fsub-toggle-chev" />
          </button>
          {contactsOpen && (
            <div className="pill-wrap">
              <TogglePill on={f.web} onToggle={() => onPatch({ web: !f.web })}>Has website</TogglePill>
              <TogglePill on={f.email} onToggle={() => onPatch({ email: !f.email })}>Has email</TogglePill>
            </div>
          )}
        </FilterGroup>

        {/* 6 — Growth Sort */}
        <FilterGroup
          label="Growth Sort"
          active={f.period !== "7d"}
          summary={f.period !== "7d" ? f.period : undefined}
        >
          <SubLabel>Reviews growth window</SubLabel>
          <div className="seg-mini">
            {(["7d", "14d", "30d", "60d", "90d"] as const).map((p) => (
              <button
                key={p}
                className={f.period === p ? "on" : ""}
                onClick={() =>
                  onPatch(p !== "7d" ? { period: p, sort: "growth" } : { period: p, sort: "revenue" })
                }
              >
                {p}
              </button>
            ))}
          </div>
        </FilterGroup>

        {/* 7 — Price */}
        <FilterGroup label="Price" active={f.price !== "all"} summary={f.price !== "all" ? (f.price === "free" ? "Free" : "Paid") : undefined}>
          <Pills
            value={f.price}
            onSelect={(v) => onPatch({ price: v })}
            options={[
              { id: "all", label: "All" },
              { id: "free", label: "Free" },
              { id: "paid", label: "Paid" },
            ]}
          />
        </FilterGroup>

        {/* 8 — Rating */}
        <FilterGroup
          label="Rating"
          active={f.ratingMin != null || f.ratingMax != null}
          summary={f.ratingMin != null || f.ratingMax != null ? "Set" : undefined}
        >
          <RangeFilter
            alwaysOpen
            min={f.ratingMin}
            max={f.ratingMax}
            onChange={({ min, max }) => onPatch({ ratingMin: min, ratingMax: max })}
            quick={[
              { label: "4+ ★", min: 4 },
              { label: "4.5+ ★", min: 4.5 },
            ]}
            suffix="★"
          />
        </FilterGroup>

        {/* 9 — Downloads */}
        <FilterGroup
          label="Downloads"
          active={f.dlMin != null || f.dlMax != null}
          summary={f.dlMin != null || f.dlMax != null ? "Set" : undefined}
        >
          <RangeFilter
            alwaysOpen
            min={f.dlMin}
            max={f.dlMax}
            onChange={({ min, max }) => onPatch({ dlMin: min, dlMax: max })}
            quick={[
              { label: "1K+", min: 1000 },
              { label: "10K+", min: 10000 },
              { label: "100K+", min: 100000 },
              { label: "1M+", min: 1000000 },
            ]}
          />
        </FilterGroup>

        {/* 10 — Revenue */}
        <FilterGroup
          label="Revenue"
          active={f.revMin != null || f.revMax != null}
          summary={f.revMin != null || f.revMax != null ? "Set" : undefined}
        >
          <RangeFilter
            alwaysOpen
            min={f.revMin}
            max={f.revMax}
            onChange={({ min, max }) => onPatch({ revMin: min, revMax: max })}
            quick={[
              { label: "$1K+", min: 1000 },
              { label: "$10K+", min: 10000 },
              { label: "$100K+", min: 100000 },
              { label: "$1M+", min: 1000000 },
            ]}
            prefix="$"
          />
        </FilterGroup>

        {/* 11 — Reviews */}
        <FilterGroup
          label="Reviews"
          active={f.reviewsMin != null || f.reviewsMax != null}
          summary={f.reviewsMin != null || f.reviewsMax != null ? "Set" : undefined}
        >
          <RangeFilter
            alwaysOpen
            min={f.reviewsMin}
            max={f.reviewsMax}
            onChange={({ min, max }) => onPatch({ reviewsMin: min, reviewsMax: max })}
            quick={[
              { label: "100+", min: 100 },
              { label: "1K+", min: 1000 },
              { label: "10K+", min: 10000 },
              { label: "100K+", min: 100000 },
            ]}
          />
        </FilterGroup>
      </div>
    </aside>
  );
}
