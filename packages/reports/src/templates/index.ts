/**
 * Product report templates and a registry factory that wires them up alongside
 * the built-in `generic` fallback.
 */
import { createDefaultRegistry, ReportTemplateRegistry } from "../registry.js";
import { APP_TEARDOWN_TEMPLATE, appTeardownTemplate } from "./app-teardown.js";
import { CATEGORY_PULSE_TEMPLATE, categoryPulseTemplate } from "./category-pulse.js";

export * from "./app-teardown.js";
export * from "./category-pulse.js";

/** A registry with `generic`, `app_teardown`, and `category_pulse` registered. */
export function createReportRegistry(): ReportTemplateRegistry {
  return createDefaultRegistry()
    .register(APP_TEARDOWN_TEMPLATE, appTeardownTemplate)
    .register(CATEGORY_PULSE_TEMPLATE, categoryPulseTemplate);
}
