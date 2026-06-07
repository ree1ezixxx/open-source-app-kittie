import type { AppSignals } from "@kittie/intelligence";
import type {
  AppDetail,
  AppHistoricalPoint,
  AppIap,
  AppleSearchAd,
  CreatorPartnership,
  MetaAdCreative,
  Review,
  Store,
} from "@kittie/types";

export interface RawAppFixture {
  id: string;
  store: Store;
  storeAppId: string;
  title: string;
  iconUrl: string | null;
  developer: string;
  category: string | null;
  rating: number | null;
  reviewCount: number;
  releasedAt: string | null;
  updatedAt: string | null;
  description: string | null;
  screenshotUrls: string[];
  websiteUrl: string | null;
  supportEmail: string | null;
  price: number | null;
  contentRating: string | null;
  languages: string[];
  signals: AppSignals;
  iaps: AppIap[];
  metaAds: MetaAdCreative[];
  appleSearchAds: AppleSearchAd[];
  creators: CreatorPartnership[];
  historicals: AppHistoricalPoint[];
  reviews: Review[];
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
const dateOnly = (n: number) => daysAgo(n).slice(0, 10);

export const MOCK_APPS: RawAppFixture[] = [
  {
    id: "apple:6478234567",
    store: "apple",
    storeAppId: "6478234567",
    title: "FocusFlow AI",
    iconUrl: "https://placehold.co/128x128/6366f1/white?text=FF",
    developer: "Nova Labs",
    category: "Productivity",
    rating: 4.7,
    reviewCount: 2840,
    releasedAt: daysAgo(45),
    updatedAt: daysAgo(3),
    description: "AI-powered focus timer with deep work analytics.",
    screenshotUrls: [],
    websiteUrl: "https://focusflow.example.com",
    supportEmail: "hello@focusflow.example.com",
    price: 0,
    contentRating: "4+",
    languages: ["en", "es"],
    signals: {
      category: "Productivity",
      chartRank: 42,
      reviewCount: 2840,
      reviewCountPrior: 2100,
      rating: 4.7,
      iapCount: 4,
      metaAdCount: 6,
      metaAdCountPrior: 2,
      chartRankPrior: 78,
      updatedAt: new Date(daysAgo(3)),
      releasedAt: new Date(daysAgo(45)),
      categoryAppCount: 35,
    },
    iaps: [
      { name: "Pro Monthly", price: 9.99, currency: "USD" },
      { name: "Pro Yearly", price: 59.99, currency: "USD" },
    ],
    metaAds: [
      {
        id: "meta-ff-1",
        platform: "meta",
        adCopy: "Stop procrastinating. Start flowing.",
        imageUrl: null,
        videoUrl: null,
        status: "active",
        firstSeenAt: daysAgo(20),
        lastSeenAt: daysAgo(1),
      },
    ],
    appleSearchAds: [{ country: "US", keyword: "focus timer", rank: 3 }],
    creators: [
      {
        platform: "tiktok",
        handle: "@productivityguy",
        profileUrl: "https://tiktok.com/@productivityguy",
        followerCount: 120_000,
      },
    ],
    historicals: [
      { date: dateOnly(30), reviewCount: 1800, rating: 4.6, chartRank: 95, downloadsEstimate: 12000, revenueEstimate: 28000 },
      { date: dateOnly(14), reviewCount: 2400, rating: 4.65, chartRank: 60, downloadsEstimate: 18000, revenueEstimate: 42000 },
      { date: dateOnly(0), reviewCount: 2840, rating: 4.7, chartRank: 42, downloadsEstimate: 22000, revenueEstimate: 55000 },
    ],
    reviews: [],
  },
  {
    id: "apple:6445123890",
    store: "apple",
    storeAppId: "6445123890",
    title: "CalmSteps",
    iconUrl: "https://placehold.co/128x128/10b981/white?text=CS",
    developer: "Wellness Co",
    category: "Health & Fitness",
    rating: 4.5,
    reviewCount: 890,
    releasedAt: daysAgo(60),
    updatedAt: daysAgo(12),
    description: "Gentle step challenges for mental wellness.",
    screenshotUrls: [],
    websiteUrl: null,
    supportEmail: null,
    price: 0,
    contentRating: "12+",
    languages: ["en"],
    signals: {
      category: "Health & Fitness",
      chartRank: 120,
      reviewCount: 890,
      reviewCountPrior: 720,
      rating: 4.5,
      iapCount: 2,
      metaAdCount: 1,
      metaAdCountPrior: 0,
      chartRankPrior: 145,
      updatedAt: new Date(daysAgo(12)),
      releasedAt: new Date(daysAgo(60)),
      categoryAppCount: 55,
    },
    iaps: [{ name: "Premium", price: 4.99, currency: "USD" }],
    metaAds: [],
    appleSearchAds: [],
    creators: [],
    historicals: [
      { date: dateOnly(30), reviewCount: 650, rating: 4.4, chartRank: 160, downloadsEstimate: 5000, revenueEstimate: 12000 },
      { date: dateOnly(0), reviewCount: 890, rating: 4.5, chartRank: 120, downloadsEstimate: 8000, revenueEstimate: 18000 },
    ],
    reviews: [],
  },
  {
    id: "google:com.pixelcraft.studio",
    store: "google",
    storeAppId: "com.pixelcraft.studio",
    title: "PixelCraft Studio",
    iconUrl: "https://placehold.co/128x128/f59e0b/white?text=PC",
    developer: "PixelCraft Inc",
    category: "Photo & Video",
    rating: 4.2,
    reviewCount: 12_400,
    releasedAt: daysAgo(400),
    updatedAt: daysAgo(5),
    description: "Mobile photo editor with AI background removal.",
    screenshotUrls: [],
    websiteUrl: "https://pixelcraft.example.com",
    supportEmail: "support@pixelcraft.example.com",
    price: 0,
    contentRating: "Everyone",
    languages: ["en", "de", "fr"],
    signals: {
      category: "Photo & Video",
      chartRank: 8,
      reviewCount: 12_400,
      reviewCountPrior: 11_800,
      rating: 4.2,
      iapCount: 8,
      metaAdCount: 15,
      metaAdCountPrior: 12,
      chartRankPrior: 11,
      updatedAt: new Date(daysAgo(5)),
      releasedAt: new Date(daysAgo(400)),
      categoryAppCount: 120,
    },
    iaps: [
      { name: "Pro Pack", price: 14.99, currency: "USD" },
      { name: "Filters Bundle", price: 6.99, currency: "USD" },
    ],
    metaAds: [
      {
        id: "meta-pc-1",
        platform: "meta",
        adCopy: "Edit like a pro on your phone.",
        imageUrl: null,
        videoUrl: null,
        status: "active",
        firstSeenAt: daysAgo(90),
        lastSeenAt: daysAgo(2),
      },
    ],
    appleSearchAds: [],
    creators: [
      {
        platform: "instagram",
        handle: "@mobileedits",
        profileUrl: null,
        followerCount: 45_000,
      },
    ],
    historicals: [
      { date: dateOnly(30), reviewCount: 11_200, rating: 4.15, chartRank: 15, downloadsEstimate: 80000, revenueEstimate: 200000 },
      { date: dateOnly(0), reviewCount: 12_400, rating: 4.2, chartRank: 8, downloadsEstimate: 95000, revenueEstimate: 240000 },
    ],
    reviews: [],
  },
  {
    id: "apple:6499012345",
    store: "apple",
    storeAppId: "6499012345",
    title: "BudgetBuddy",
    iconUrl: "https://placehold.co/128x128/0ea5e9/white?text=BB",
    developer: "FinApps",
    category: "Finance",
    rating: 4.8,
    reviewCount: 420,
    releasedAt: daysAgo(25),
    updatedAt: daysAgo(2),
    description: "Simple envelope budgeting for couples.",
    screenshotUrls: [],
    websiteUrl: "https://budgetbuddy.example.com",
    supportEmail: "team@budgetbuddy.example.com",
    price: 0,
    contentRating: "4+",
    languages: ["en"],
    signals: {
      category: "Finance",
      chartRank: 28,
      reviewCount: 420,
      reviewCountPrior: 180,
      rating: 4.8,
      iapCount: 3,
      metaAdCount: 4,
      metaAdCountPrior: 1,
      chartRankPrior: 110,
      updatedAt: new Date(daysAgo(2)),
      releasedAt: new Date(daysAgo(25)),
      categoryAppCount: 28,
    },
    iaps: [{ name: "Family Plan", price: 7.99, currency: "USD" }],
    metaAds: [
      {
        id: "meta-bb-1",
        platform: "meta",
        adCopy: "Budget together, stress less.",
        imageUrl: null,
        videoUrl: null,
        status: "active",
        firstSeenAt: daysAgo(10),
        lastSeenAt: daysAgo(1),
      },
    ],
    appleSearchAds: [{ country: "US", keyword: "budget app", rank: 5 }],
    creators: [],
    historicals: [
      { date: dateOnly(14), reviewCount: 250, rating: 4.7, chartRank: 85, downloadsEstimate: 3000, revenueEstimate: 15000 },
      { date: dateOnly(0), reviewCount: 420, rating: 4.8, chartRank: 28, downloadsEstimate: 6000, revenueEstimate: 35000 },
    ],
    reviews: [],
  },
  {
    id: "google:com.streakquest.game",
    store: "google",
    storeAppId: "com.streakquest.game",
    title: "Streak Quest",
    iconUrl: "https://placehold.co/128x128/ec4899/white?text=SQ",
    developer: "Indie Arcade",
    category: "Games",
    rating: 3.9,
    reviewCount: 5600,
    releasedAt: daysAgo(200),
    updatedAt: daysAgo(45),
    description: "Daily challenge roguelike with streak rewards.",
    screenshotUrls: [],
    websiteUrl: null,
    supportEmail: null,
    price: 0,
    contentRating: "Teen",
    languages: ["en", "ja"],
    signals: {
      category: "Games",
      chartRank: 250,
      reviewCount: 5600,
      reviewCountPrior: 5800,
      rating: 3.9,
      iapCount: 12,
      metaAdCount: 0,
      metaAdCountPrior: 2,
      chartRankPrior: 200,
      updatedAt: new Date(daysAgo(45)),
      releasedAt: new Date(daysAgo(200)),
      categoryAppCount: 200,
    },
    iaps: [{ name: "Gem Pack", price: 2.99, currency: "USD" }],
    metaAds: [],
    appleSearchAds: [],
    creators: [],
    historicals: [
      { date: dateOnly(30), reviewCount: 5700, rating: 3.95, chartRank: 220, downloadsEstimate: 40000, revenueEstimate: 60000 },
      { date: dateOnly(0), reviewCount: 5600, rating: 3.9, chartRank: 250, downloadsEstimate: 35000, revenueEstimate: 52000 },
    ],
    reviews: [],
  },
];

export const SUPPORTED_COUNTRIES = [
  "US", "GB", "CA", "AU", "DE", "FR", "ES", "IT", "JP", "KR", "BR", "MX", "IN",
] as const;
