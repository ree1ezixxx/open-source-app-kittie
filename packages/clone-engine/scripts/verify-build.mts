import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fromBlueprint, validateBlueprint } from "../src/index.js";
import type { CloneSource } from "../src/index.js";

// A representative source app + a model-shaped blueprint exercising every TabKind.
const src: CloneSource = {
  id: "apple:000",
  title: "Cal AI - Calorie Tracker",
  developer: "Viral Development",
  category: "Health & Fitness",
  description: "Track calories with a photo. Snap your meal and get instant macros.",
};

const blueprint = validateBlueprint(
  {
    appName: "Macrosnap",
    bundleId: "com.kittieclone.macrosnap",
    tagline: "Calories from a photo",
    accentHex: "#22C55E",
    primaryEntity: "Meal",
    tabs: [
      {
        title: "Today", symbol: "flame.fill", kind: "feed", headline: "Today", subhead: "1,840 / 2,200 kcal",
        items: [
          { title: "Avocado Toast", subtitle: "Breakfast", detail: "320 kcal" },
          { title: "Chicken Bowl", subtitle: "Lunch", detail: "540 kcal" },
          { title: "Greek Yogurt", subtitle: "Snack", detail: "180 kcal" },
          { title: 'Salmon "Teriyaki"', subtitle: "Dinner", detail: "610 kcal" },
        ],
      },
      {
        title: "Browse", symbol: "square.grid.2x2.fill", kind: "grid", headline: "Foods", subhead: "Popular this week",
        items: [
          { title: "Oatmeal", subtitle: "High fiber", detail: "P 6g" },
          { title: "Eggs", subtitle: "High protein", detail: "P 13g" },
          { title: "Banana", subtitle: "Quick carb", detail: "C 27g" },
          { title: "Almonds", subtitle: "Healthy fat", detail: "F 14g" },
        ],
      },
      {
        title: "Log", symbol: "plus.circle.fill", kind: "form", headline: "Add a meal", subhead: "Snap or type it",
        items: [
          { title: "Recent: Latte", subtitle: "120 kcal", detail: "Add" },
          { title: "Recent: Apple", subtitle: "95 kcal", detail: "Add" },
          { title: "Recent: Protein bar", subtitle: "210 kcal", detail: "Add" },
        ],
      },
      {
        title: "History", symbol: "list.bullet", kind: "list", headline: "History", subhead: "Last 7 days",
        items: [
          { title: "Monday", subtitle: "2,050 kcal", detail: "On track" },
          { title: "Tuesday", subtitle: "2,310 kcal", detail: "Over" },
          { title: "Wednesday", subtitle: "1,920 kcal", detail: "Under" },
        ],
      },
      {
        title: "You", symbol: "person.crop.circle", kind: "profile", headline: "Alex", subhead: "Goal: lose 0.5 kg/week",
        items: [
          { title: "Daily goal", subtitle: "Calories", detail: "2,200" },
          { title: "Streak", subtitle: "Days logged", detail: "12" },
          { title: "Weight", subtitle: "Current", detail: "78 kg" },
        ],
      },
    ],
  },
  src,
);

const result = fromBlueprint(blueprint);
const outDir = join("/tmp/kittie-clone-verify", result.projectName);
rmSync("/tmp/kittie-clone-verify", { recursive: true, force: true });
for (const f of result.files) {
  const p = join(outDir, f.path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.contents);
}
console.log(`PROJECT=${result.projectName}`);
console.log(`OUTDIR=${outDir}`);
console.log(`FILES=${result.files.length}`);
console.log(result.files.map((f) => "  " + f.path).join("\n"));
