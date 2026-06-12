import type { AppBlueprint, BlueprintTab, GeneratedFile } from "./types.js";

/* ============================================================
   Builder Stage 2 — deterministic Expo codegen.

   Mirrors the SwiftUI codegen contract: given a validated blueprint, emit a
   complete Expo Router (TypeScript) project via pure string templating. The
   model's content only flows in as escaped string literals and clamped
   enums, so the output always type-checks and runs in Expo Go.
   ============================================================ */

/** Escape for safe embedding inside a TS double-quoted literal. */
function ts(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ");
}

/** kebab-case slug, ASCII only, never empty. */
export function slugFor(b: AppBlueprint): string {
  const slug = (b.appName.match(/[A-Za-z0-9]+/g) ?? [])
    .join("-")
    .toLowerCase();
  return slug || "rork-app";
}

/** Tab route segments: lowercase ASCII words, first tab is index, deduped. */
function tabRoutes(tabs: BlueprintTab[]): string[] {
  const used = new Set<string>();
  return tabs.map((tab, i) => {
    const base = (tab.title.match(/[A-Za-z0-9]+/g) ?? []).join("-").toLowerCase();
    let route = i === 0 ? "index" : base || `tab-${i + 1}`;
    while (used.has(route)) route = `${route}-${i}`;
    used.add(route);
    return route;
  });
}

/** SF Symbol -> Ionicons name (clamped; anything unknown falls back). */
const ICON_MAP: Record<string, string> = {
  house: "home-outline", "house.fill": "home",
  magnifyingglass: "search",
  "square.grid.2x2": "grid-outline", "square.grid.2x2.fill": "grid",
  "list.bullet": "list",
  heart: "heart-outline", "heart.fill": "heart",
  star: "star-outline", "star.fill": "star",
  bolt: "flash-outline", "bolt.fill": "flash",
  flame: "flame-outline", "flame.fill": "flame",
  person: "person-outline", "person.fill": "person",
  "person.crop.circle": "person-circle-outline",
  gearshape: "settings-outline", "gearshape.fill": "settings",
  bell: "notifications-outline", "bell.fill": "notifications",
  bookmark: "bookmark-outline", "bookmark.fill": "bookmark",
  cart: "cart-outline", "cart.fill": "cart",
  calendar: "calendar-outline", clock: "time-outline",
  "chart.bar": "bar-chart-outline", "chart.bar.fill": "bar-chart",
  camera: "camera-outline", "camera.fill": "camera",
  photo: "image-outline", "photo.on.rectangle": "images-outline",
  "play.circle": "play-circle-outline", "play.circle.fill": "play-circle",
  message: "chatbubble-outline", "message.fill": "chatbubble",
  map: "map-outline", location: "location-outline",
  creditcard: "card-outline", "dollarsign.circle": "cash-outline",
  book: "book-outline", "book.fill": "book",
  "music.note": "musical-notes-outline",
  dumbbell: "barbell-outline", "dumbbell.fill": "barbell",
  "fork.knife": "restaurant-outline",
  leaf: "leaf-outline", "leaf.fill": "leaf",
  globe: "globe-outline", sparkles: "sparkles-outline",
  "wand.and.stars": "color-wand-outline", paintbrush: "brush-outline",
  pencil: "pencil-outline",
  "plus.circle": "add-circle-outline", "plus.circle.fill": "add-circle",
  tag: "pricetag-outline", "tag.fill": "pricetag",
  "checkmark.circle": "checkmark-circle-outline", "checkmark.circle.fill": "checkmark-circle",
  flag: "flag-outline", trophy: "trophy-outline", "trophy.fill": "trophy",
};

export function ioniconFor(symbol: string): string {
  return ICON_MAP[symbol] ?? "ellipse-outline";
}

/* ---- file templates ---------------------------------------------------- */

function packageJson(slug: string): string {
  return JSON.stringify(
    {
      name: slug,
      version: "1.0.0",
      main: "expo-router/entry",
      scripts: {
        start: "expo start",
        ios: "expo start --ios",
        android: "expo start --android",
        web: "expo start --web",
      },
      dependencies: {
        "@expo/vector-icons": "^14.0.0",
        expo: "~52.0.0",
        "expo-constants": "~17.0.0",
        "expo-linking": "~7.0.0",
        "expo-router": "~4.0.0",
        "expo-status-bar": "~2.0.0",
        react: "18.3.1",
        "react-native": "0.76.5",
        "react-native-safe-area-context": "4.12.0",
        "react-native-screens": "~4.4.0",
      },
      devDependencies: {
        "@babel/core": "^7.25.0",
        "@types/react": "~18.3.12",
        typescript: "^5.3.3",
      },
      private: true,
    },
    null,
    2,
  );
}

function appJson(b: AppBlueprint, slug: string): string {
  return JSON.stringify(
    {
      expo: {
        name: b.appName,
        slug,
        version: "1.0.0",
        orientation: "portrait",
        scheme: slug,
        userInterfaceStyle: "automatic",
        newArchEnabled: true,
        ios: { supportsTablet: false, bundleIdentifier: b.bundleId },
        android: { package: b.bundleId },
        plugins: ["expo-router"],
        experiments: { typedRoutes: true },
      },
    },
    null,
    2,
  );
}

function tsconfig(): string {
  return JSON.stringify(
    {
      extends: "expo/tsconfig.base",
      compilerOptions: {
        strict: true,
        paths: { "@/*": ["./*"] },
      },
      include: ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"],
    },
    null,
    2,
  );
}

function themeTs(b: AppBlueprint): string {
  return `// Generated by the Rork-style App Builder.
export const theme = {
  accent: "${b.accentHex}",
  bg: "#0B0B0F",
  surface: "#17171E",
  text: "#F4F4F6",
  textDim: "#9A9AA5",
  radius: 16,
} as const;
`;
}

function dataTs(b: AppBlueprint): string {
  const groups = b.tabs
    .map((tab, i) => {
      const items = tab.items
        .map(
          (it) =>
            `    { title: "${ts(it.title)}", subtitle: "${ts(it.subtitle)}", detail: "${ts(it.detail)}" },`,
        )
        .join("\n");
      return `  tab${i}: [\n${items}\n  ],`;
    })
    .join("\n");
  return `// Sample content for the generated ${ts(b.primaryEntity)} app.
export interface Entry {
  title: string;
  subtitle: string;
  detail: string;
}

export const sampleData: Record<string, Entry[]> = {
${groups}
};
`;
}

function componentsTsx(): string {
  return `import { Text, View, StyleSheet } from "react-native";
import { theme } from "../lib/theme";
import type { Entry } from "../lib/data";

export function ScreenHeader({ headline, subhead }: { headline: string; subhead: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.headline}>{headline}</Text>
      {subhead ? <Text style={styles.subhead}>{subhead}</Text> : null}
    </View>
  );
}

export function EntryRow({ entry }: { entry: Entry }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{entry.title}</Text>
        {entry.subtitle ? <Text style={styles.rowSub}>{entry.subtitle}</Text> : null}
      </View>
      {entry.detail ? <Text style={styles.rowDetail}>{entry.detail}</Text> : null}
    </View>
  );
}

export function EntryCard({ entry }: { entry: Entry }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHero}>
        <Text style={styles.cardHeroText}>{entry.detail}</Text>
      </View>
      <Text style={styles.cardTitle}>{entry.title}</Text>
      {entry.subtitle ? <Text style={styles.rowSub}>{entry.subtitle}</Text> : null}
    </View>
  );
}

export function EntryTile({ entry }: { entry: Entry }) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileHero}>
        <Text style={styles.tileHeroText}>{entry.detail}</Text>
      </View>
      <Text style={styles.tileTitle} numberOfLines={1}>{entry.title}</Text>
      {entry.subtitle ? (
        <Text style={styles.rowSub} numberOfLines={1}>{entry.subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headline: { color: theme.text, fontSize: 30, fontWeight: "800" },
  subhead: { color: theme.textDim, fontSize: 14, marginTop: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: theme.accent + "30",
  },
  rowTitle: { color: theme.text, fontSize: 16, fontWeight: "600" },
  rowSub: { color: theme.textDim, fontSize: 12, marginTop: 2 },
  rowDetail: { color: theme.accent, fontSize: 12, fontWeight: "600" },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 14,
    gap: 8,
  },
  cardHero: {
    height: 140,
    borderRadius: 12,
    backgroundColor: theme.accent,
    justifyContent: "flex-end",
    alignItems: "flex-end",
    padding: 12,
  },
  cardHeroText: { color: "#fff", fontWeight: "700" },
  cardTitle: { color: theme.text, fontSize: 17, fontWeight: "700" },
  tile: { flex: 1, gap: 6 },
  tileHero: {
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: theme.accent + "38",
    justifyContent: "flex-end",
    padding: 8,
  },
  tileHeroText: { color: theme.accent, fontSize: 11, fontWeight: "700" },
  tileTitle: { color: theme.text, fontSize: 14, fontWeight: "600" },
});
`;
}

function layoutTsx(b: AppBlueprint, routes: string[]): string {
  const screens = b.tabs
    .map((tab, i) => {
      const route = routes[i] ?? `tab-${i + 1}`;
      return `      <Tabs.Screen
        name="${route}"
        options={{
          title: "${ts(tab.title)}",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="${ioniconFor(tab.symbol)}" color={color} size={size} />
          ),
        }}
      />`;
    })
    .join("\n");
  return `import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../lib/theme";

export default function RootLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        tabBarStyle: { backgroundColor: theme.bg, borderTopColor: theme.surface },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textDim,
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
${screens}
    </Tabs>
  );
}
`;
}

function screenBody(tab: BlueprintTab, i: number): string {
  switch (tab.kind) {
    case "feed":
      return `    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <ScreenHeader headline="${ts(tab.headline)}" subhead="${ts(tab.subhead)}" />
      <View style={{ paddingHorizontal: 16, gap: 16 }}>
        {items.map((e, idx) => (
          <EntryCard key={idx} entry={e} />
        ))}
      </View>
    </ScrollView>`;
    case "grid":
      return `    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <ScreenHeader headline="${ts(tab.headline)}" subhead="${ts(tab.subhead)}" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12 }}>
        {items.map((e, idx) => (
          <View key={idx} style={{ width: "47%" }}>
            <EntryTile entry={e} />
          </View>
        ))}
      </View>
    </ScrollView>`;
    case "form":
      return `    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <ScreenHeader headline="${ts(tab.headline)}" subhead="${ts(tab.subhead)}" />
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <TextInput
          placeholder="Title"
          placeholderTextColor={theme.textDim}
          value={title}
          onChangeText={setTitle}
          style={formStyles.input}
        />
        <TextInput
          placeholder="Notes"
          placeholderTextColor={theme.textDim}
          value={notes}
          onChangeText={setNotes}
          multiline
          style={[formStyles.input, { height: 90 }]}
        />
        <Pressable style={formStyles.button} onPress={() => { setTitle(""); setNotes(""); }}>
          <Text style={formStyles.buttonText}>Add</Text>
        </Pressable>
        {items.map((e, idx) => (
          <EntryRow key={idx} entry={e} />
        ))}
      </View>
    </ScrollView>`;
    case "profile":
      return `    <ScrollView contentContainerStyle={{ paddingBottom: 32, alignItems: "center" }}>
      <View style={profileStyles.avatar} />
      <Text style={profileStyles.name}>${ts(tab.headline)}</Text>
      <Text style={profileStyles.sub}>${ts(tab.subhead)}</Text>
      <View style={profileStyles.cardList}>
        {items.map((e, idx) => (
          <EntryRow key={idx} entry={e} />
        ))}
      </View>
    </ScrollView>`;
    default: // list
      return `    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <ScreenHeader headline="${ts(tab.headline)}" subhead="${ts(tab.subhead)}" />
      <View>
        {items.map((e, idx) => (
          <EntryRow key={idx} entry={e} />
        ))}
      </View>
    </ScrollView>`;
  }
}

function screenTsx(tab: BlueprintTab, i: number): string {
  const isForm = tab.kind === "form";
  const isProfile = tab.kind === "profile";
  const imports = ["ScrollView", "View", "Text"];
  if (isForm) imports.push("TextInput", "Pressable", "StyleSheet");
  if (isProfile) imports.push("StyleSheet");
  const hooks = isForm
    ? `  const [title, setTitle] = useState("");\n  const [notes, setNotes] = useState("");\n`
    : "";
  const reactImport = isForm ? `import { useState } from "react";\n` : "";
  const compImports = ["ScreenHeader"];
  if (tab.kind === "feed") compImports.push("EntryCard");
  else if (tab.kind === "grid") compImports.push("EntryTile");
  else compImports.push("EntryRow");

  const formStyles = isForm
    ? `
const formStyles = StyleSheet.create({
  input: {
    backgroundColor: theme.surface,
    color: theme.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    backgroundColor: theme.accent,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 13,
  },
  buttonText: { color: "#fff", fontWeight: "700" },
});
`
    : "";
  const profileStyles = isProfile
    ? `
const profileStyles = StyleSheet.create({
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: theme.accent + "40",
    marginTop: 20,
  },
  name: { color: theme.text, fontSize: 22, fontWeight: "800", marginTop: 14 },
  sub: { color: theme.textDim, fontSize: 13, marginTop: 4, marginBottom: 16 },
  cardList: {
    alignSelf: "stretch",
    marginHorizontal: 16,
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    paddingVertical: 6,
  },
});
`
    : "";

  return `${reactImport}import { ${[...new Set(imports)].join(", ")} } from "react-native";
import { ${compImports.join(", ")} } from "../components/ui";
import { sampleData } from "../lib/data";
import { theme } from "../lib/theme";

export default function ${screenComponentName(tab, i)}() {
${hooks}  const items = sampleData.tab${i} ?? [];
  return (
${screenBody(tab, i)}
  );
}
${formStyles}${profileStyles}`;
}

function screenComponentName(tab: BlueprintTab, i: number): string {
  const cleaned = (tab.title.match(/[A-Za-z0-9]+/g) ?? [])
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("")
    .replace(/^[0-9]+/, "");
  return `${cleaned || `Tab${i + 1}`}Screen`;
}

function readme(b: AppBlueprint, slug: string): string {
  return `# ${b.appName}

> ${b.tagline}

Generated by the Rork-style App Builder. Core entity: **${b.primaryEntity}**.

## Screens
${b.tabs.map((t) => `- **${t.title}** (${t.kind}) — ${t.headline}`).join("\n")}

## Run it

\`\`\`sh
npx expo install   # or: npm install
npx expo start     # scan the QR code with Expo Go
\`\`\`

Accent color: \`${b.accentHex}\`. Bundle id: \`${b.bundleId}\`.
`;
}

/** Render a validated blueprint into a complete Expo Router project. */
export function generateExpoProject(b: AppBlueprint): { slug: string; files: GeneratedFile[] } {
  const slug = slugFor(b);
  const routes = tabRoutes(b.tabs);
  const files: GeneratedFile[] = [
    { path: "package.json", contents: packageJson(slug) },
    { path: "app.json", contents: appJson(b, slug) },
    { path: "tsconfig.json", contents: tsconfig() },
    { path: "README.md", contents: readme(b, slug) },
    { path: "lib/theme.ts", contents: themeTs(b) },
    { path: "lib/data.ts", contents: dataTs(b) },
    { path: "components/ui.tsx", contents: componentsTsx() },
    { path: "app/_layout.tsx", contents: layoutTsx(b, routes) },
    ...b.tabs.map((tab, i) => ({
      path: `app/${routes[i]}.tsx`,
      contents: screenTsx(tab, i),
    })),
  ];
  return { slug, files };
}
