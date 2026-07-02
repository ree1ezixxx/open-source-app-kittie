/**
 * Product report templates and a registry factory that wires them up alongside
 * the built-in `generic` fallback.
 */
import { createDefaultRegistry, ReportTemplateRegistry } from "../registry.js";
import { APP_TEARDOWN_TEMPLATE, appTeardownTemplate } from "./app-teardown.js";
import { CATEGORY_PULSE_TEMPLATE, categoryPulseTemplate } from "./category-pulse.js";
import { BUILD_BRIEF_TEMPLATE, buildBriefTemplate } from "./build-brief.js";

export * from "./app-teardown.js";
export * from "./category-pulse.js";
export * from "./build-brief.js";

/** A registry with `generic`, `app_teardown`, `category_pulse`, and `build_brief`. */
export function createReportRegistry(): ReportTemplateRegistry {
  return createDefaultRegistry()
    .register(APP_TEARDOWN_TEMPLATE, appTeardownTemplate)
    .register(CATEGORY_PULSE_TEMPLATE, categoryPulseTemplate)
    .register(BUILD_BRIEF_TEMPLATE, buildBriefTemplate);
}
