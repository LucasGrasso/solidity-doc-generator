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
   * Source directory for Solidity contracts (default: contracts)
   * Used to filter which source files to document
   */
  sourceDir?: string;

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

  /**
   * Auto-generate VitePress sidebar configuration
   * @default false
   */
  generateVitepressSidebar?: boolean;

  /**
   * Site title for VitePress config (used if generateVitepressSidebar is true)
   */
  siteTitle?: string;

  /**
   * Site description for VitePress config (used if generateVitepressSidebar is true)
   */
  siteDescription?: string;

  /**
   * Repository URL for VitePress config
   */
  repository?: string;

  /**
   * Base path for VitePress deployment (e.g., "/repo-name/" for GitHub Pages)
   * @default "/"
   */
  vitepressBasePath?: string;

  /**
   * Path to custom index.md template file
   * If provided, this template will be copied to the output directory as index.md
   * instead of generating one. Supports template variables via handlebars syntax.
   * Available variables: title, description, siteTitle, siteDescription, repository
   */
  indexTemplate?: string;

  /**
   * Directory containing custom markdown files to include in documentation
   * Files will be copied to the output directory, preserving folder structure
   * Can include guides, tutorials, contributing docs, etc.
   * Custom docs are merged with generated contract docs in the sidebar
   */
  customDocsDir?: string;

  /**
   * Label for custom docs section in VitePress sidebar
   * @default "Guides"
   */
  customDocsSidebarLabel?: string;

  /**
   * Directory containing custom Handlebars HTML templates
   * Place templates like contract.html.hbs or index.html.hbs here
   * These will render as .html files instead of .md markdown files
   * Template context includes all standard contract data
   */
  htmlTemplateDir?: string;

  /**
   * Enable HTML rendering from Handlebars templates
   * If true, renders to .html files instead of .md files
   * If false (default), renders Markdown as usual
   * @default false
   */
  renderHtml?: boolean;
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
    | "customProperties"
    | "plugins"
    | "frontmatter"
    | "target"
    | "generateVitepressSidebar"
    | "siteTitle"
    | "siteDescription"
    | "repository"
    | "vitepressBasePath"
    | "indexTemplate"
    | "customDocsDir"
    | "customDocsSidebarLabel"
    | "htmlTemplateDir"
    | "renderHtml"
  > & {
    customProperties: Record<string, (doc: any) => string | undefined>;
    plugins: any[];
    frontmatter: Record<string, unknown>;
    target: string;
    generateVitepressSidebar: boolean;
    siteTitle: string;
    siteDescription: string;
    repository: string;
    vitepressBasePath: string;
    indexTemplate: string | null;
    customDocsDir: string | null;
    customDocsSidebarLabel: string;
    htmlTemplateDir: string | null;
    renderHtml: boolean;
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
    sourceDir: config.sourceDir ?? "contracts",
    customProperties: config.customProperties ?? {},
    plugins: config.plugins ?? [],
    frontmatter: config.frontmatter ?? {},
    target: config.target ?? "generic",
    generateVitepressSidebar: config.generateVitepressSidebar ?? false,
    siteTitle: config.siteTitle ?? "Documentation",
    siteDescription: config.siteDescription ?? "API reference",
    repository: config.repository ?? "https://github.com/your-org/your-repo",
    vitepressBasePath: config.vitepressBasePath ?? "/",
    indexTemplate: config.indexTemplate
      ? resolve(
          config.rootDir ? resolve(config.rootDir) : cwd,
          config.indexTemplate,
        )
      : null,
    customDocsDir: config.customDocsDir
      ? resolve(
          config.rootDir ? resolve(config.rootDir) : cwd,
          config.customDocsDir,
        )
      : null,
    customDocsSidebarLabel: config.customDocsSidebarLabel ?? "Guides",
    htmlTemplateDir: config.htmlTemplateDir
      ? resolve(
          config.rootDir ? resolve(config.rootDir) : cwd,
          config.htmlTemplateDir,
        )
      : null,
    renderHtml: config.renderHtml ?? false,
  };
}
