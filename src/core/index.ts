/**
 * Core pipeline exports
 */

export * from "./types.js";
export * from "./parser.js";
export * from "./filter.js";
export * from "./renderer.js";

// Re-export config from src/config module
export type { DocgenConfig } from "../config/schema.js";
export { loadConfig, normalizeConfig } from "../config/schema.js";
