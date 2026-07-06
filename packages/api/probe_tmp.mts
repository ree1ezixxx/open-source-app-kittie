process.env.DATABASE_URL = "file:/Users/ellis/Documents/open-source-app-kittie/data/kittie.db";
const { getReviewClusters } = await import("./src/services/review-clusters-service.js");
const cats = ["sleep tracking","budgeting","habit tracker","meditation","language learning","meal planning","running","workout","news reader","photo editor","music player","travel planner"];
let ok = 0;
for (const c of cats) {
  const r = await getReviewClusters({ query: c, limitApps: 8 });
  if (r.status === "ok") ok++;
  console.log(`${c.padEnd(18)} ${r.status.padEnd(13)} reviews=${String(r.data.totalReviewsAnalyzed).padStart(5)} themes=${r.data.themes.length}`);
}
console.log(`ok: ${ok}/12`);
