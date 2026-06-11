import { generateBlueprint, type GenerateJson, validateBlueprint } from "./blueprint.js";
import { generateProject } from "./codegen.js";
import type { AppBlueprint, CloneResult, CloneSource } from "./types.js";

export type { AppBlueprint, BlueprintTab, BlueprintItem, CloneResult, CloneSource, GeneratedFile, TabKind } from "./types.js";
export { generateBlueprint, validateBlueprint } from "./blueprint.js";
export { generateProject, projectNameFor } from "./codegen.js";
export type { GenerateJson } from "./blueprint.js";
export { SAFE_SYMBOLS } from "./blueprint.js";

function buildCommands(projectName: string): string[] {
  return [
    "xcodegen generate",
    `xcodebuild -project ${projectName}.xcodeproj -scheme ${projectName} -destination 'generic/platform=iOS Simulator' build`,
  ];
}

/**
 * End-to-end: trending app listing -> Gemini blueprint -> deterministic
 * SwiftUI project. `gen` is the injected Gemini JSON call; omit it (or let it
 * fail) and the engine still returns a valid fallback scaffold.
 */
export async function generateIosClone(src: CloneSource, gen?: GenerateJson): Promise<CloneResult> {
  const blueprint = gen ? await generateBlueprint(src, gen) : validateBlueprint({}, src);
  return fromBlueprint(blueprint);
}

/** Render a known/edited blueprint straight to a project (no model call). */
export function fromBlueprint(blueprint: AppBlueprint): CloneResult {
  const { projectName, files } = generateProject(blueprint);
  return { blueprint, projectName, files, buildCommands: buildCommands(projectName) };
}
