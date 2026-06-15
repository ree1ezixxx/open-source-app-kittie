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

/** Legacy iTunes RSS genre IDs — the modern marketing-tools API has no per-genre charts. */
const APPLE_GENRES: Array<[string, number]> = [
  ["Books", 6018], ["Business", 6000], ["Developer Tools", 6026], ["Education", 6017],
  ["Entertainment", 6016], ["Finance", 6015], ["Food & Drink", 6023], ["Games", 6014],
  ["Graphics & Design", 6027], ["Health & Fitness", 6013], ["Lifestyle", 6012],
  ["Medical", 6020], ["Music", 6011], ["Navigation", 6010], ["News", 6009],
  ["Photo & Video", 6008], ["Productivity", 6007], ["Reference", 6006], ["Shopping", 6024],
  ["Social Networking", 6005], ["Sports", 6004], ["Travel", 6003], ["Utilities", 6002],
  ["Weather", 6001],
];

const GENRE_FEEDS = [
  { chartCategory: "top-free", path: "topfreeapplications" },
  { chartCategory: "top-grossing", path: "topgrossingapplications" },
] as const;

interface LegacyChartFeed {
  feed?: {
    entry?: Array<{
      id?: { attributes?: { "im:id"?: string } };
      "im:name"?: { label?: string };
      "im:artist"?: { label?: string };
      "im:image"?: Array<{ label?: string }>;
    }>;
  };
}

/**
 * Per-genre US charts via the legacy iTunes RSS — the only free source of
 * category-level rank positions. ~48 paced requests; a failing feed skips.
 */
export async function fetchAppleGenreCharts(
  country = "us",
  limit = 100,
): Promise<AppleChartEntry[]> {
  const entries: AppleChartEntry[] = [];
  const seen = new Set<string>();

  for (const [genreName, genreId] of APPLE_GENRES) {
    for (const feed of GENRE_FEEDS) {
      const url = `https://itunes.apple.com/${country}/rss/${feed.path}/limit=${limit}/genre=${genreId}/json`;
      try {
        const response = await fetch(url, { redirect: "follow" });
        if (!response.ok) continue;
        const data = (await response.json()) as LegacyChartFeed;
        (data.feed?.entry ?? []).forEach((item, index) => {
          const storeAppId = item.id?.attributes?.["im:id"];
          if (!storeAppId || seen.has(`${feed.chartCategory}:${storeAppId}`)) return;
          seen.add(`${feed.chartCategory}:${storeAppId}`);
          entries.push({
            storeAppId,
            title: item["im:name"]?.label ?? "",
            developer: item["im:artist"]?.label ?? "",
            iconUrl: item["im:image"]?.at(-1)?.label ?? null,
            category: genreName,
            chartCategory: `${feed.chartCategory}:${genreName}`,
            chartRank: index + 1,
            chartCountry: country.toUpperCase(),
          });
        });
      } catch {
        // one genre feed failing must not abort the sweep
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return entries;
}

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
