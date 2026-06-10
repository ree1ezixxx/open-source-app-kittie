import gplay from "google-play-scraper";

/**
 * Play Store search autocomplete hints for a seed term (google-play-scraper `.suggest`).
 * Returns the real "as-you-type" suggestions surfaced in Play Store search.
 */
export async function suggestGoogleKeyword(
  seed: string,
  country = "US",
  limit = 20,
): Promise<string[]> {
  const hints = (await gplay.suggest({
    term: seed,
    country: country.toLowerCase(),
  } as Parameters<typeof gplay.suggest>[0])) as string[];

  return hints.map((term) => term.trim()).filter(Boolean).slice(0, limit);
}
