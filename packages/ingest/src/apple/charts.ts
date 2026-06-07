export interface AppleChartEntry {
  storeAppId: string;
  title: string;
  developer: string;
  iconUrl: string | null;
  category: string | null;
  chartCategory: string;
  chartRank: number;
  chartCountry: string;
}

interface AppleChartFeed {
  feed?: {
    results?: Array<{
      id: string;
      name: string;
      artistName: string;
      artworkUrl100?: string;
      genres?: Array<{ name: string }>;
    }>;
  };
}

const APPLE_CHART_FEEDS = [
  { chartCategory: "top-free", path: "top-free" },
  { chartCategory: "top-paid", path: "top-paid" },
] as const;

export async function fetchAppleCharts(
  country = "us",
  limit = 100,
): Promise<AppleChartEntry[]> {
  const entries: AppleChartEntry[] = [];
  const seen = new Set<string>();

  for (const feed of APPLE_CHART_FEEDS) {
    const url = `https://rss.applemarketingtools.com/api/v2/${country}/apps/${feed.path}/${limit}/apps.json`;
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      console.warn(`Apple chart fetch skipped (${feed.path}): ${response.status}`);
      continue;
    }

    const data = (await response.json()) as AppleChartFeed;
    const results = data.feed?.results ?? [];

    results.forEach((item, index) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);

      entries.push({
        storeAppId: item.id,
        title: item.name,
        developer: item.artistName,
        iconUrl: item.artworkUrl100 ?? null,
        category: item.genres?.[0]?.name ?? null,
        chartCategory: feed.chartCategory,
        chartRank: index + 1,
        chartCountry: country.toUpperCase(),
      });
    });
  }

  return entries;
}
