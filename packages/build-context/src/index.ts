/**
 * @kittie/build-context — persistent, portable project memory for coding agents
 * (lane L3, ticket #105). See README.md and CONTEXT.md for the model.
 */
export * from "./types.js";
export * from "./clock.js";
export * from "./paths.js";
export * from "./io.js";
export * from "./lock.js";
export * from "./render.js";
export * from "./advise.js";
export {
  BuildContextManager,
  createBuildContextManager,
  BuildContextExistsError,
  BuildContextNotFoundError,
  type BuildContextManagerOptions,
  type CreateInput,
  type UpdatePatch,
  type GetOptions,
  type ProfileUserValues,
} from "./manager.js";
