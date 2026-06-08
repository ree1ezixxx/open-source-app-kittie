// Lane B — related-keyword ideas table (the generator output).
import { useMemo, useState } from "react";
import type { Store } from "@kittie/types";
import { IconSpark } from "../../icons";
import { OpportunityBadge } from "./KeywordBits";
import type { KeywordDifficulty } from "../../lib/api/keywords";

type SortKey = "opportunity" | "popularity" | "difficulty";
type Filter = "all" | "opp" | "lowdiff";

const keyOf = (k: { store: Store; keyword: string }) => `${k.store}:${k.keyword.toLowerCase()}`;

export function IdeasTable({
  seed,
  ideas,
  trackedKeys,
  onTrack,
}: {
  seed: string;
  ideas: KeywordDifficulty[];
  trackedKeys: Set<string>;
  onTrack: (kd: KeywordDifficulty) => void;
}) {
  const [sort, setSort] = useState<SortKey>("opportunity");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    let list = ideas;
    if (filter === "opp") list = list.filter((k) => k.opportunityScore >= 45);
    else if (filter === "lowdiff") list = list.filter((k) => k.difficulty <= 30);
    return [...list].sort((a, b) => {
      if (sort === "popularity") return b.popularity - a.popularity;
      if (sort === "difficulty") return a.difficulty - b.difficulty;
      return b.opportunityScore - a.opportunityScore;
    });
  }, [ideas, sort, filter]);

  const counts = useMemo(
    () => ({
      all: ideas.length,
      opp: ideas.filter((k) => k.opportunityScore >= 45).length,
      lowdiff: ideas.filter((k) => k.difficulty <= 30).length,
    }),
    [ideas],
  );

  return (
    <div className="kw-ideas">
      <div className="section-head" style={{ margin: "30px 0 10px" }}>
        <div className="section-label" style={{ margin: 0 }}>
          Related ideas for “{seed}”
        </div>
        <span className="section-count">{ideas.length} found</span>
      </div>

      {ideas.length === 0 ? (
        <div className="aso-empty">
          <IconSpark />
          <div className="t">No related ideas surfaced</div>
          <div className="s">This seed was too specific for the store to expand. Try a broader term.</div>
        </div>
      ) : (
        <>
          <div className="kw-ideas-filters">
            {([
              ["all", "Ideas"],
              ["opp", "Opportunities"],
              ["lowdiff", "Low difficulty"],
            ] as [Filter, string][]).map(([id, label]) => (
              <button
                key={id}
                className={`kw-ideas-filter ${filter === id ? "on" : ""}`}
                onClick={() => setFilter(id)}
              >
                {label} <span className="n">{counts[id]}</span>
              </button>
            ))}
          </div>

          <table className="kw-ideas-table">
            <thead>
              <tr>
                <th>Keyword</th>
                <Sortable label="Opp" col="opportunity" sort={sort} setSort={setSort} />
                <Sortable label="Pop" col="popularity" sort={sort} setSort={setSort} />
                <Sortable label="Diff" col="difficulty" sort={sort} setSort={setSort} />
                <th className="num">Apps</th>
                <th aria-label="action" />
              </tr>
            </thead>
            <tbody>
              {rows.map((kd) => {
                const tracked = trackedKeys.has(keyOf(kd));
                return (
                  <tr key={keyOf(kd)}>
                    <td className="kw-ideas-name">{kd.keyword}</td>
                    <td><OpportunityBadge score={kd.opportunityScore} /></td>
                    <td className="num">{kd.popularity}</td>
                    <td className={`num ${kd.difficulty <= 30 ? "good" : kd.difficulty >= 70 ? "bad" : ""}`}>{kd.difficulty}</td>
                    <td className="num dim">{kd.competingAppCount}</td>
                    <td className="kw-ideas-action">
                      {tracked ? (
                        <span className="kw-ideas-tracked">Tracked</span>
                      ) : (
                        <button className="kw-ideas-track" onClick={() => onTrack(kd)}>Track</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function Sortable({
  label,
  col,
  sort,
  setSort,
}: {
  label: string;
  col: SortKey;
  sort: SortKey;
  setSort: (s: SortKey) => void;
}) {
  return (
    <th className={`num sortable ${sort === col ? "on" : ""}`} onClick={() => setSort(col)}>
      {label}
      <span className="sort-caret">{sort === col ? "▾" : ""}</span>
    </th>
  );
}
