import { useState } from "react";
import type { Store } from "@kittie/types";
import { IconApple, IconGooglePlay, IconFilter } from "../icons";
import { FilterGroup, SubLabel } from "./FilterGroup";
import { Pills, TogglePill } from "./Pills";
import { RangeFilter } from "./RangeFilter";
import {
  activeCount,
  TIME_WINDOWS,
  type ExploreFilters,
} from "../lib/exploreFilters";

type TimeMode = "released" | "updated";

export function ExploreFilterRail({
  filters: f,
  categories,
  onPatch,
  onClear,
}: {
  filters: ExploreFilters;
  categories: string[];
  onPatch: (patch: Partial<ExploreFilters>) => void;
  onClear: () => void;
}) {
  const [timeMode, setTimeMode] = useState<TimeMode>(
    f.upd != null && f.rel == null ? "updated" : "released",
  );
  const n = activeCount(f);

  const timeValue = (timeMode === "released" ? f.rel : f.upd) ?? 0;
  const setTimeValue = (v: number) =>
    onPatch(timeMode === "released" ? { rel: v || undefined } : { upd: v || undefined });

  const toggleCat = (cat: string) =>
    onPatch({ cats: f.cats.includes(cat) ? f.cats.filter((c) => c !== cat) : [...f.cats, cat] });

  const metricsActive =
    f.ratingMin != null || f.ratingMax != null ||
    f.reviewsMin != null || f.reviewsMax != null ||
    f.dlMin != null || f.dlMax != null ||
    f.revMin != null || f.revMax != null;

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
        <FilterGroup
          label="Time"
          defaultOpen
          active={f.rel != null || f.upd != null}
          summary={[f.rel != null && `Released ≤${f.rel}d`, f.upd != null && `Updated ≤${f.upd}d`].filter(Boolean).join(" · ")}
        >
          <div className="seg-mini">
            <button className={timeMode === "released" ? "on" : ""} onClick={() => setTimeMode("released")}>
              Released
            </button>
            <button className={timeMode === "updated" ? "on" : ""} onClick={() => setTimeMode("updated")}>
              Updated
            </button>
          </div>
          <Pills<number>
            value={timeValue}
            onSelect={setTimeValue}
            options={[
              { id: 0, label: "All" },
              ...TIME_WINDOWS.map((d) => ({ id: d, label: `${d}d` })),
            ]}
          />
        </FilterGroup>

        <FilterGroup label="Source" defaultOpen active={!!f.source} summary={f.source === "apple" ? "App Store" : f.source === "google" ? "Google Play" : undefined}>
          <Pills<Store | "all">
            value={f.source ?? "all"}
            onSelect={(v) => onPatch({ source: v === "all" ? undefined : v })}
            options={[
              { id: "all", label: "All" },
              { id: "apple", label: "App Store", icon: <IconApple /> },
              { id: "google", label: "Google Play", icon: <IconGooglePlay /> },
            ]}
          />
        </FilterGroup>

        <FilterGroup label="Category" active={f.cats.length > 0} summary={f.cats.length ? `${f.cats.length} selected` : undefined}>
          {categories.length === 0 ? (
            <div className="filter-hint">Loading categories…</div>
          ) : (
            <div className="pill-wrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`fpill ${f.cats.includes(cat) ? "on" : ""}`}
                  onClick={() => toggleCat(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </FilterGroup>

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

        <FilterGroup label="Metrics" active={metricsActive} summary={metricsActive ? "Set" : undefined}>
          <SubLabel>Rating</SubLabel>
          <RangeFilter
            min={f.ratingMin}
            max={f.ratingMax}
            onChange={({ min, max }) => onPatch({ ratingMin: min, ratingMax: max })}
            quick={[
              { label: "4+ ★", min: 4 },
              { label: "4.5+ ★", min: 4.5 },
              { label: "≤ 3 ★", max: 3 },
            ]}
            suffix="★"
          />
          <SubLabel>Reviews</SubLabel>
          <RangeFilter
            min={f.reviewsMin}
            max={f.reviewsMax}
            onChange={({ min, max }) => onPatch({ reviewsMin: min, reviewsMax: max })}
            quick={[
              { label: "100+", min: 100 },
              { label: "1K+", min: 1000 },
              { label: "10K+", min: 10000 },
            ]}
          />
          <SubLabel>Downloads / mo</SubLabel>
          <RangeFilter
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
          <SubLabel>Revenue / mo</SubLabel>
          <RangeFilter
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

        <FilterGroup label="Marketing signals" active={f.meta || f.aads || f.creators} summary={[f.meta && "Meta", f.aads && "Apple", f.creators && "Creators"].filter(Boolean).join(" · ")}>
          <div className="pill-wrap">
            <TogglePill on={f.meta} onToggle={() => onPatch({ meta: !f.meta })}>Meta Ads</TogglePill>
            <TogglePill on={f.aads} onToggle={() => onPatch({ aads: !f.aads })}>Apple Ads</TogglePill>
            <TogglePill on={f.creators} onToggle={() => onPatch({ creators: !f.creators })}>Creators</TogglePill>
          </div>
        </FilterGroup>

        <FilterGroup label="Contacts" active={f.web || f.email} summary={[f.web && "Website", f.email && "Email"].filter(Boolean).join(" · ")}>
          <div className="pill-wrap">
            <TogglePill on={f.web} onToggle={() => onPatch({ web: !f.web })}>Has website</TogglePill>
            <TogglePill on={f.email} onToggle={() => onPatch({ email: !f.email })}>Has email</TogglePill>
          </div>
        </FilterGroup>

        <FilterGroup label="Growth" active={f.gtype !== "all"} summary={f.gtype !== "all" ? (f.gtype === "positive" ? "Growing" : "Declining") : undefined}>
          <SubLabel>Direction</SubLabel>
          <Pills
            value={f.gtype}
            onSelect={(v) => onPatch({ gtype: v })}
            options={[
              { id: "all", label: "All" },
              { id: "positive", label: "Growing" },
              { id: "negative", label: "Declining" },
            ]}
          />
          <SubLabel>Window</SubLabel>
          <Pills
            value={f.period}
            onSelect={(v) => onPatch({ period: v })}
            options={[
              { id: "7d", label: "7d" },
              { id: "14d", label: "14d" },
              { id: "30d", label: "30d" },
              { id: "60d", label: "60d" },
              { id: "90d", label: "90d" },
            ]}
          />
        </FilterGroup>
      </div>
    </aside>
  );
}
