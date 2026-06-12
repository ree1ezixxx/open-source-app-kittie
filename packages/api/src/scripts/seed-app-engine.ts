import { getDb } from "../lib/db.js";
import { cloneableApps } from "@kittie/db";
import crypto from "crypto";

function nanoid() {
  return crypto.randomBytes(12).toString("base64").replace(/[+/]/g, (x) => (x === "+" ? "-" : "_")).substring(0, 21);
}

type Platform = "react-native" | "ios-native" | "android-native" | "multi";
type Reason = "trending" | "top-grossing" | "curated";

const CLONEABLE_APPS: Array<{
  title: string;
  description: string;
  repoUrl: string;
  platform: Platform;
  featuredReason: Reason;
  iconUrl?: string;
  expoProjectId?: string;
  iosDeploymentTarget?: string;
  githubStars?: number;
}> = [
  {
    title: "Expo Router Demo",
    description: "Production-grade navigation and routing for React Native",
    repoUrl: "https://github.com/expo/router",
    platform: "react-native",
    featuredReason: "trending",
    iconUrl: "https://expo.dev/static/images/logo.svg",
    expoProjectId: "expo-router",
  },
  {
    title: "React Native Paper",
    description: "Material Design for React Native",
    repoUrl: "https://github.com/callstack/react-native-paper",
    platform: "react-native",
    featuredReason: "curated",
    iconUrl: "https://raw.githubusercontent.com/callstack/react-native-paper/main/assets/logo.png",
  },
  {
    title: "Skia React Native",
    description: "High-performance 2D drawing for React Native",
    repoUrl: "https://github.com/Shopify/react-native-skia",
    platform: "react-native",
    featuredReason: "trending",
    iconUrl: "https://avatars.githubusercontent.com/u/3708309",
    githubStars: 6000,
  },
  {
    title: "Tamagui",
    description: "Universal UI kit for React and React Native",
    repoUrl: "https://github.com/tamagui/tamagui",
    platform: "react-native",
    featuredReason: "top-grossing",
    githubStars: 11000,
  },
  {
    title: "Reanimated",
    description: "React Native animations library",
    repoUrl: "https://github.com/software-mansion/react-native-reanimated",
    platform: "react-native",
    featuredReason: "trending",
    githubStars: 8000,
  },
  {
    title: "Swift Playgrounds",
    description: "Learn to code iOS apps in Swift",
    repoUrl: "https://github.com/apple/swift-playgrounds",
    platform: "ios-native",
    featuredReason: "curated",
    iosDeploymentTarget: "17.0",
  },
  {
    title: "Signal iOS",
    description: "Signal iOS app (open source)",
    repoUrl: "https://github.com/signalapp/Signal-iOS",
    platform: "ios-native",
    featuredReason: "top-grossing",
    iosDeploymentTarget: "14.0",
    githubStars: 13000,
  },
  {
    title: "Telegram iOS",
    description: "Telegram Messenger for iOS (partial open source)",
    repoUrl: "https://github.com/TelegramMessenger/Telegram-iOS",
    platform: "ios-native",
    featuredReason: "top-grossing",
    iosDeploymentTarget: "14.0",
    githubStars: 21000,
  },
  {
    title: "Material Android",
    description: "Material Design Components for Android",
    repoUrl: "https://github.com/material-components/material-components-android",
    platform: "android-native",
    featuredReason: "curated",
    githubStars: 17000,
  },
  {
    title: "Anki Droid",
    description: "Flashcard app for Android",
    repoUrl: "https://github.com/ankidroid/Anki-Android",
    platform: "android-native",
    featuredReason: "trending",
    githubStars: 9000,
  },
];

export async function seedAppEngine() {
  const db = getDb();

  console.log("🌱 Seeding cloneable apps...");

  try {
    for (const app of CLONEABLE_APPS) {
      const existing = await db.query.cloneableApps.findFirst({
        where: (t, { eq }) => eq(t.repoUrl, app.repoUrl),
      });

      if (existing) {
        console.log(`✓ ${app.title} already exists`);
        continue;
      }

      const id = nanoid();
      await db.insert(cloneableApps).values({
        id,
        title: app.title,
        description: app.description,
        repoUrl: app.repoUrl,
        platform: app.platform,
        featuredReason: app.featuredReason,
        iconUrl: app.iconUrl || null,
        expoProjectId: app.expoProjectId || null,
        iosDeploymentTarget: app.iosDeploymentTarget || null,
        githubStars: app.githubStars || null,
        syncedAt: new Date(),
        createdAt: new Date(),
      });

      console.log(`+ ${app.title}`);
    }

    console.log("✅ Seeding complete");
  } catch (e) {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  await seedAppEngine();
}
