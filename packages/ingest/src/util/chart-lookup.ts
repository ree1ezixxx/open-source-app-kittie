import { fetchAppleGenreCharts } from "../apple/charts.js";
import { fetchGoogleCharts } from "../google/metadata.js";

export interface ChartRankEntry {
  chartRank: number;
  chartCategory: string;
  chartCountry: string;
}

/** Fresh US chart ranks keyed by `store:storeAppId`. Apps not on a chart are absent. */
export async function fetchChartRankLookup(country = "us"): Promise<Map<string, ChartRankEntry>> {
  const [appleCharts, googleCharts] = await Promise.all([
    // Covers all 3 Apple chart types (free|paid|grossing) at overall + per-genre.
    // Emitted in priority order (scarce per-genre paid/grossing first) so the
    // app-level collapse below keeps the membership the grid most needs.
    fetchAppleGenreCharts(country, 100),
    fetchGoogleCharts(country, 50),
  ]);

  const lookup = new Map<string, ChartRankEntry>();
  const setIfAbsent = (key: string, entry: ChartRankEntry) => {
    if (!lookup.has(key)) lookup.set(key, entry);
  };

  // One membership per app/day (snapshot is unique on app+date): the first entry
  // in fetchAppleGenreCharts's priority order wins.
  for (const entry of appleCharts) {
    setIfAbsent(`apple:${entry.storeAppId}`, {
      chartRank: entry.chartRank,
      chartCategory: entry.chartCategory,
      chartCountry: entry.chartCountry,
    });
  }

  for (const entry of googleCharts) {
    setIfAbsent(`google:${entry.storeAppId}`, {
      chartRank: entry.chartRank,
      chartCategory: entry.chartCategory,
      chartCountry: entry.chartCountry,
    });
  }

  return lookup;
}

export function chartRankForApp(
  lookup: Map<string, ChartRankEntry>,
  store: string,
  storeAppId: string,
): ChartRankEntry | null {
  return lookup.get(`${store}:${storeAppId}`) ?? null;
}
