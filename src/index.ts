/**
 * Solidity Doc Generator - Main Entry Point
 */

// Core pipeline exports
export * from "./core/index.js";

// Configuration exports
export { loadConfig, normalizeConfig } from "./config/schema.js";
export type { DocgenConfig } from "./config/schema.js";

// Template system exports
export {
  HandlebarsTemplateEngine,
  BUILTIN_TEMPLATES,
} from "./templates/handlebars.js";
export type { TemplateContext } from "./templates/handlebars.js";

// Property injection exports
export { PropertyInjector } from "./properties/index.js";

// Plugin system exports
export { PluginManager } from "./plugins/index.js";
export type { Plugin, PluginHooks, PluginContext } from "./plugins/index.js";

// Pipeline orchestration
export { runPipeline } from "./pipeline.js";
