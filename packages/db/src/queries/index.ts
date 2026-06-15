export {
  countAppsInCategory,
  getGrowthWindow,
  getGrowthWindows,
  getLatestSnapshot,
  getSnapshotContext,
  listHistoricals,
  listSnapshotContexts,
  parseJsonArray,
  seriesFromSnapshots,
  type GrowthMetric,
  type SnapshotContext,
} from "./signals.js";

export {
  computeGrowthWindow,
  GROWTH_PERIOD_DAYS,
  smoothingForWindow,
  type GrowthWindowOptions,
  type SeriesPoint,
} from "./growth.js";

export {
  assembleTopCharts,
  normalizeChartType,
  type ChartRow,
  type TopChartsParams,
} from "./charts.js";

export { getTopCharts } from "./charts-query.js";
