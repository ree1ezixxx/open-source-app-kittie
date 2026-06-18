/** Apple storefront IDs per market (multi-market keyword analysis). */
const STOREFRONT_IDS: Record<string, number> = {
  US: 143441,
  GB: 143444,
  CA: 143455,
  AU: 143460,
  NZ: 143461,
  IE: 143449,
  DE: 143443,
  FR: 143442,
  IT: 143450,
  ES: 143454,
  NL: 143452,
  BE: 143446,
  AT: 143445,
  CH: 143459,
  PT: 143453,
  LU: 143451,
  SE: 143456,
  NO: 143457,
  DK: 143458,
  FI: 143447,
  CN: 143465,
  JP: 143462,
  KR: 143466,
  TW: 143470,
  HK: 143463,
  SG: 143464,
};

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

/**
 * App Store search autocomplete hints for a seed term (MZSearchHints).
 * Returns the real "as-you-type" suggestions surfaced in App Store search.
 */
export async function suggestAppleKeyword(
  seed: string,
  country = "US",
  limit = 20,
): Promise<string[]> {
  const id = STOREFRONT_IDS[country.toUpperCase()] ?? STOREFRONT_IDS.US;
  const url = `https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints?term=${encodeURIComponent(seed)}`;

  const response = await fetch(url, {
    headers: {
      "X-Apple-Store-Front": `${id}-1,29`,
      "User-Agent": "iTunes-iPhone/17.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Apple hints failed: ${response.status}`);
  }

  const xml = await response.text();
  // The plist alternates <string>hint</string> with its <string>search-url</string>.
  // Keep the hint terms; drop the "Suggestions" title and any URL entries.
  return [...xml.matchAll(/<string>([^<]*)<\/string>/g)]
    .map((match) => decodeXml(match[1]!).trim())
    .filter((term) => term && !term.startsWith("http") && term.toLowerCase() !== "suggestions")
    .slice(0, limit);
}
