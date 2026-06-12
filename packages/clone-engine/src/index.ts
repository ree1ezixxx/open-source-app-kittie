import { generateBlueprint, type GenerateJson, validateBlueprint } from "./blueprint.js";
import { generateProject, generateXcodeProject } from "./codegen.js";
import { generateExpoProject } from "./expo-codegen.js";
import type { AppBlueprint, CloneResult, CloneSource } from "./types.js";

export type { AppBlueprint, BlueprintTab, BlueprintItem, CloneResult, CloneSource, GeneratedFile, TabKind } from "./types.js";
export { generateBlueprint, validateBlueprint } from "./blueprint.js";
export { generateProject, generateXcodeProject, projectNameFor } from "./codegen.js";
export type { GenerateJson } from "./blueprint.js";
export { SAFE_SYMBOLS } from "./blueprint.js";
export {
  buildBlueprintFromPrompt,
  reviseBlueprint,
  heuristicBlueprint,
  heuristicRevise,
} from "./builder.js";
export { generateExpoProject, slugFor, ioniconFor } from "./expo-codegen.js";

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

/** Render a blueprint straight to a native SwiftUI Xcode project. */
export function fromBlueprintXcode(blueprint: AppBlueprint): CloneResult {
  const { projectName, files } = generateXcodeProject(blueprint);
  return {
    blueprint,
    projectName,
    files,
    buildCommands: [
      `open ${projectName}.xcodeproj`,
      `xcodebuild -project ${projectName}.xcodeproj -scheme ${projectName} -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO`,
    ],
  };
}

/** Render a blueprint straight to an Expo Router project (the builder path). */
export function fromBlueprintExpo(blueprint: AppBlueprint): CloneResult {
  const { slug, files } = generateExpoProject(blueprint);
  return {
    blueprint,
    projectName: slug,
    files,
    buildCommands: ["npx expo install", "npx expo start"],
  };
}
