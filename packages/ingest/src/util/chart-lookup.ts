import { fetchAppleCharts } from "../apple/charts.js";
import { fetchGoogleCharts } from "../google/metadata.js";

export interface ChartRankEntry {
  chartRank: number;
  chartCategory: string;
  chartCountry: string;
}

/** Fresh US chart ranks keyed by `store:storeAppId`. Apps not on a chart are absent. */
export async function fetchChartRankLookup(country = "us"): Promise<Map<string, ChartRankEntry>> {
  const [appleCharts, googleCharts] = await Promise.all([
    fetchAppleCharts(country, 100),
    fetchGoogleCharts(country, 50),
  ]);

  const lookup = new Map<string, ChartRankEntry>();

  for (const entry of appleCharts) {
    lookup.set(`apple:${entry.storeAppId}`, {
      chartRank: entry.chartRank,
      chartCategory: entry.chartCategory,
      chartCountry: entry.chartCountry,
    });
  }

  for (const entry of googleCharts) {
    lookup.set(`google:${entry.storeAppId}`, {
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
