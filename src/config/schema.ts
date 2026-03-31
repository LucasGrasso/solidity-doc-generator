/**
 * Configuration schema and loader
 */

import { readFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";

export type DocgenConfig = {
  /**
   * Root directory (default: process.cwd())
   */
  rootDir?: string;

  /**
   * Build info directory (default: artifacts/build-info)
   */
  buildInfoDir?: string;

  /**
   * Output directory (default: docs)
   */
  outDir?: string;

  /**
   * Template directory for overrides (default: templates)
   */
  templateDir?: string;

  /**
   * Exclude patterns using glob syntax
   */
  exclude?: string[];

  /**
   * Contract kinds to include
   * @example ["contract", "interface", "library"]
   */
  contractKinds?: string[];

  /**
   * Custom properties to extract from docstrings
   */
  customProperties?: Record<string, (doc: any) => string | undefined>;

  /**
   * Plugin modules
   */
  plugins?: any[];

  /**
   * Frontmatter defaults
   */
  frontmatter?: Record<string, unknown>;

  /**
   * Target site generator (affects frontmatter format)
   * @default "generic"
   */
  target?: "generic" | "vitepress" | "nextra" | "mkdocs" | "jekyll";
};

/**
 * Load configuration from file
 */
export async function loadConfig(configPath: string): Promise<DocgenConfig> {
  const ext = extname(configPath);

  if (ext === ".json") {
    const raw = readFileSync(configPath, "utf8");
    return JSON.parse(raw) as DocgenConfig;
  }

  if (ext === ".ts" || ext === ".js") {
    // Dynamic import for .ts and .js files
    const absolutePath = resolve(configPath);
    const fileUrl = pathToFileURL(absolutePath).href;
    const imported = await import(fileUrl);
    return (imported.default ?? imported) as DocgenConfig;
  }

  throw new Error(
    `Unsupported config file format: ${ext}. Supported: .json, .ts, .js`,
  );
}

/**
 * Validate and normalize configuration
 */
export function normalizeConfig(
  config: DocgenConfig,
  cwd: string = process.cwd(),
): Required<
  Omit<
    DocgenConfig,
    "customProperties" | "plugins" | "frontmatter" | "target"
  > & {
    customProperties: Record<string, (doc: any) => string | undefined>;
    plugins: any[];
    frontmatter: Record<string, unknown>;
    target: string;
  }
> {
  return {
    rootDir: config.rootDir ? resolve(config.rootDir) : cwd,
    buildInfoDir: resolve(
      config.rootDir ? resolve(config.rootDir) : cwd,
      config.buildInfoDir ?? "artifacts/build-info",
    ),
    outDir: resolve(
      config.rootDir ? resolve(config.rootDir) : cwd,
      config.outDir ?? "docs",
    ),
    templateDir: resolve(
      config.rootDir ? resolve(config.rootDir) : cwd,
      config.templateDir ?? "templates",
    ),
    exclude: config.exclude ?? [],
    contractKinds: config.contractKinds ?? [
      "contract",
      "interface",
      "library",
      "source",
    ],
    customProperties: config.customProperties ?? {},
    plugins: config.plugins ?? [],
    frontmatter: config.frontmatter ?? {},
    target: config.target ?? "generic",
  };
}
