export {
  countApps,
  countAppsInCategory,
  getLatestSnapshot,
  getSnapshotContext,
  listHistoricals,
  listSnapshotContexts,
  parseJsonArray,
  type SnapshotContext,
} from "./signals.js";
export {
  appsWithAppleAds,
  appsWithCreators,
  getAppById as getAppRowById,
  listFreshSet,
  loadAppRelations,
  reviewCountsByApp,
} from "./detail.js";
export { enrichSnapshotScores } from "./scoring.js";
export {
  findKeyword,
  keywordRowToDifficulty,
  makeKeywordLookupId,
  upsertKeywordRow,
  type KeywordRow,
} from "./keywords.js";
export {
  countAppsForSuggestions,
  listKeywordSuggestions,
  type KeywordSuggestion,
} from "./keyword-suggestions.js";
export {
  isKeywordTracked,
  listTrackedKeywords,
  trackKeyword,
  untrackKeyword,
  type TrackedKeywordEntry,
} from "./tracked-keywords.js";
/* Additive lane — Monitor layer (tracked apps / changes / alerts). */
export {
  countUnreadAlerts,
  ensureDefaultAlertRules,
  getCaptureBaseline,
  getJobCursor,
  insertAlerts,
  insertAppChanges,
  isAppTracked,
  listAlertRules,
  listAlertsFeed,
  listAppChanges,
  listRecentAlertsForApp,
  listRecentChanges,
  listTrackedAppEntries,
  markAlertsRead,
  saveCaptureBaseline,
  saveJobCursor,
  trackApp,
  untrackApp,
  updateAlertRule,
  updateTrackedNote,
  type AlertFeedEntry,
  type AlertInput,
  type AlertRuleEntry,
  type AppChangeEntry,
  type AppChangeInput,
  type RecentChangeEntry,
  type TrackedAppEntry,
} from "./monitor.js";
export {
  appTitlesByIds,
  listAppIdsByCategory,
  listAppsByIds,
  listIdeaCandidateApps,
  listKeywordIndexRows,
  listMinableReviews,
  listSnapshotSeries,
  reviewFreshnessByApp,
  reviewTextByIds,
  staleKeywordsForScope,
  type IdeaCandidateApp,
  type KeywordIndexRowRaw,
  type MinableReviewRow,
  type ReviewEvidence,
} from "./intel.js";
export {
  getIdeaRow,
  ideaFeedStats,
  ideasTableExists,
  ideatedSourceApps,
  insertOrReplaceIdea,
  listIdeaRows,
  type IdeaInsert,
  type IdeaRow,
} from "./ideas-bridge.js";
