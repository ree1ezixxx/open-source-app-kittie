import { useState } from "react";
import type { Store } from "@kittie/types";
import type { CategoryFacet } from "../lib/api";
import { IconApple, IconGooglePlay, IconFilter, IconChevron } from "../icons";
import { DatePickerDialog } from "./DatePickerDialog";
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

// Presence filters are only offered when their source data is actually ingested —
// otherwise the control could never match (honest-data: no dead filters). Flip these
// to `true` once the matching ingest lands (the API EXISTS predicates already work).
// Today: meta_ads / apple_search_ads / creators / apps.support_email are all empty;
// apps.website_url is ~57% populated, so "Has website" stays live.
const HAS_AD_DATA = false; // Meta Ads + Apple Ads (meta_ads / apple_search_ads)
const HAS_CREATOR_DATA = false; // Creators (creators table)
const HAS_EMAIL_DATA = false; // Has email (apps.support_email)
const NO_DATA_TIP = "Not available yet — this signal hasn't been ingested.";

/** Category emoji map — mirrors the live rail's emoji+name chips. */
const CATEGORY_EMOJI: Record<string, string> = {
  Books: "📚",
  "Books & Reference": "📚",
  Business: "💼",
  Communication: "📞",
  Education: "🎓",
  Entertainment: "🎬",
  Finance: "💰",
  "Food & Drink": "🍔",
  "Graphics & Design": "🎨",
  "Health & Fitness": "❤️",
  Lifestyle: "🌿",
  "Magazines & Newspapers": "🗞️",
  Medical: "🏥",
  Music: "🎵",
  "Music & Audio": "🎵",
  Navigation: "🧭",
  News: "📰",
  "News & Magazines": "🗞️",
  "Maps & Navigation": "🧭",
  Personalization: "🎛️",
  Photography: "📸",
  "Photo & Video": "📸",
  Productivity: "📊",
  Reference: "📖",
  Shopping: "🛍️",
  Social: "👥",
  "Social Networking": "💬",
  Sports: "⚽",
  Tools: "🔧",
  Travel: "✈️",
  "Travel & Local": "✈️",
  Utilities: "🔧",
  "Video Players & Editors": "🎥",
  Games: "🎮",
  Weather: "🌤️",
  "Developer Tools": "🛠️",
  Kids: "🧸",
  "Safari Extensions": "🧩",
  "Auto & Vehicles": "🚗",
  Beauty: "✨",
  Comics: "💬",
  Dating: "💘",
  Events: "📅",
  "House & Home": "🏠",
  "Libraries & Demo": "🧪",
  Parenting: "🧸",
};

export const catEmoji = (cat: string): string => CATEGORY_EMOJI[cat] ?? "📱";

/** Language list for the App Language multi-select — mirrors the live rail's
    "Country Language CODE" entries (e.g. "United States English EN"). `code` is the
    filter value (matched case-insensitively against apps.languages server-side). */
const LANGUAGES: { code: string; name: string; country: string; display: string }[] = [
  { code: "en", name: "English", country: "United States", display: "EN" },
  { code: "de", name: "German", country: "Germany", display: "DE" },
  { code: "fr", name: "French", country: "France", display: "FR" },
  { code: "es", name: "Spanish", country: "Spain", display: "ES" },
  { code: "it", name: "Italian", country: "Italy", display: "IT" },
  { code: "pt", name: "Portuguese", country: "Brazil", display: "PT" },
  { code: "nl", name: "Dutch", country: "Netherlands", display: "NL" },
  { code: "sv", name: "Swedish", country: "Sweden", display: "SV" },
  { code: "no", name: "Norwegian", country: "Norway", display: "NO" },
  { code: "da", name: "Danish", country: "Denmark", display: "DA" },
  { code: "fi", name: "Finnish", country: "Finland", display: "FI" },
  { code: "zh-cn", name: "Chinese (Simplified)", country: "China", display: "ZH-CN" },
  { code: "zh-tw", name: "Chinese (Traditional)", country: "Taiwan", display: "ZH-TW" },
  { code: "ja", name: "Japanese", country: "Japan", display: "JA" },
  { code: "ko", name: "Korean", country: "South Korea", display: "KO" },
  { code: "af", name: "Afrikaans", country: "South Africa", display: "AF" },
  { code: "sq", name: "Albanian", country: "Albania", display: "SQ" },
  { code: "ar", name: "Arabic", country: "Saudi Arabia", display: "AR" },
  { code: "az", name: "Azerbaijani", country: "Azerbaijan", display: "AZ" },
  { code: "bn", name: "Bengali", country: "Bangladesh", display: "BN" },
  { code: "bg", name: "Bulgarian", country: "Bulgaria", display: "BG" },
  { code: "ca", name: "Catalan", country: "Andorra", display: "CA" },
  { code: "hr", name: "Croatian", country: "Croatia", display: "HR" },
  { code: "cs", name: "Czech", country: "Czech Republic", display: "CS" },
  { code: "et", name: "Estonian", country: "Estonia", display: "ET" },
  { code: "fa", name: "Persian", country: "Iran", display: "FA" },
  { code: "gu", name: "Gujarati", country: "Gujarat", display: "GU" },
  { code: "he", name: "Hebrew", country: "Israel", display: "HE" },
  { code: "hi", name: "Hindi", country: "India", display: "HI" },
  { code: "hu", name: "Hungarian", country: "Hungary", display: "HU" },
  { code: "id", name: "Indonesian", country: "Indonesia", display: "ID" },
  { code: "kk", name: "Kazakh", country: "Kazakhstan", display: "KK" },
  { code: "kn", name: "Kannada", country: "Karnataka", display: "KN" },
  { code: "lv", name: "Latvian", country: "Latvia", display: "LV" },
  { code: "lt", name: "Lithuanian", country: "Lithuania", display: "LT" },
  { code: "mk", name: "Macedonian", country: "North Macedonia", display: "MK" },
  { code: "ms", name: "Malay", country: "Malaysia", display: "MS" },
  { code: "ml", name: "Malayalam", country: "Kerala", display: "ML" },
  { code: "mr", name: "Marathi", country: "Maharashtra", display: "MR" },
  { code: "ne", name: "Nepali", country: "Nepal", display: "NE" },
  { code: "pa", name: "Punjabi", country: "Punjab", display: "PA" },
  { code: "pl", name: "Polish", country: "Poland", display: "PL" },
  { code: "ro", name: "Romanian", country: "Romania", display: "RO" },
  { code: "ru", name: "Russian", country: "Russia", display: "RU" },
  { code: "sr", name: "Serbian", country: "Serbia", display: "SR" },
  { code: "sk", name: "Slovak", country: "Slovakia", display: "SK" },
  { code: "sl", name: "Slovenian", country: "Slovenia", display: "SL" },
  { code: "sw", name: "Swahili", country: "Kenya", display: "SW" },
  { code: "ta", name: "Tamil", country: "Tamil Nadu", display: "TA" },
  { code: "te", name: "Telugu", country: "Andhra Pradesh", display: "TE" },
  { code: "th", name: "Thai", country: "Thailand", display: "TH" },
  { code: "tr", name: "Turkish", country: "Turkey", display: "TR" },
  { code: "uk", name: "Ukrainian", country: "Ukraine", display: "UK" },
  { code: "vi", name: "Vietnamese", country: "Vietnam", display: "VI" },
];

const isPresetWindow = (v: number) => (TIME_WINDOWS as readonly number[]).includes(v);

/** "All 7 14 30 60 90 Custom" pill row. Custom opens a truth-parity calendar dialog
 *  (After / Before / Range) that emits a `within` (recent) and/or `atLeast` (older) bound. */
function TimeWindowRow({
  label,
  within,
  atLeast,
  onChange,
}: {
  label: string;
  within?: number;
  atLeast?: number;
  onChange: (next: { within?: number; atLeast?: number }) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const isAll = within == null && atLeast == null;
  const presetActive = within != null && atLeast == null && isPresetWindow(within);
  const customActive = atLeast != null || (within != null && !isPresetWindow(within));

  return (
    <>
      <SubLabel>{label}</SubLabel>
      <div className="pill-row" style={{ position: "relative" }}>
        <button className={`fpill ${isAll ? "on" : ""}`} onClick={() => onChange({})}>
          All
        </button>
        {TIME_WINDOWS.map((d) => (
          <button
            key={d}
            className={`fpill ${presetActive && within === d ? "on" : ""}`}
            onClick={() => onChange({ within: d })}
          >
            {d}
          </button>
        ))}
        <button
          className={`fpill ghost ${customActive ? "on" : ""}`}
          onClick={() => setDialogOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={dialogOpen}
        >
          Custom
        </button>
        {dialogOpen && (
          <DatePickerDialog
            within={within}
            atLeast={atLeast}
            onApply={onChange}
            onClose={() => setDialogOpen(false)}
          />
        )}
      </div>
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

  // Source toggles (truth parity): nothing selected = all stores. Selecting a store
  // filters to it; clicking the selected store again clears back to all. Matches the
  // live rail, which shows neither store highlighted by default.
  const appleOn = f.source === "apple";
  const googleOn = f.source === "google";
  const toggleStore = (store: Store) =>
    onPatch({ source: f.source === store ? undefined : store });

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
          active={f.rel != null || f.relBefore != null || f.upd != null || f.updBefore != null}
          summary={[
            (f.rel != null || f.relBefore != null) && "Released",
            (f.upd != null || f.updBefore != null) && "Updated",
          ].filter(Boolean).join(" · ")}
        >
          <TimeWindowRow
            label="Released (days ago)"
            within={f.rel}
            atLeast={f.relBefore}
            onChange={({ within, atLeast }) => onPatch({ rel: within, relBefore: atLeast })}
          />
          <TimeWindowRow
            label="Updated (days ago)"
            within={f.upd}
            atLeast={f.updBefore}
            onChange={({ within, atLeast }) => onPatch({ upd: within, updBefore: atLeast })}
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
            searchable
            searchPlaceholder="Search languages…"
            items={LANGUAGES.map((l) => ({ id: l.code, label: `${l.country} ${l.name} ${l.display}` }))}
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
            <TogglePill on={f.meta} onToggle={() => onPatch({ meta: !f.meta })} disabled={!HAS_AD_DATA} title={HAS_AD_DATA ? undefined : NO_DATA_TIP}>Meta Ads</TogglePill>
            <TogglePill on={f.aads} onToggle={() => onPatch({ aads: !f.aads })} disabled={!HAS_AD_DATA} title={HAS_AD_DATA ? undefined : NO_DATA_TIP}>Apple Ads</TogglePill>
            <TogglePill on={f.creators} onToggle={() => onPatch({ creators: !f.creators })} disabled={!HAS_CREATOR_DATA} title={HAS_CREATOR_DATA ? undefined : NO_DATA_TIP}>Creators</TogglePill>
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
              <TogglePill on={f.email} onToggle={() => onPatch({ email: !f.email })} disabled={!HAS_EMAIL_DATA} title={HAS_EMAIL_DATA ? undefined : NO_DATA_TIP}>Has email</TogglePill>
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
