/**
 * Main pipeline: parse → filter → render
 */

import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  cpSync,
} from "node:fs";
import { join, dirname, sep } from "node:path";
import Handlebars from "handlebars";

import {
  readBuildInfoContracts,
  buildFilteredItems,
  MarkdownRenderer,
  type FilterOptions,
} from "./core/index.js";
import {
  generateSidebarFromDir,
  generateVitepressConfig,
} from "./sidebar-generator.js";

export interface PipelineConfig {
  rootDir: string;
  buildInfoDir: string;
  outDir: string;
  sourceDir?: string;
  exclude?: string[];
  contractKinds?: string[];
  customProperties?: Record<string, (doc: any) => string | undefined>;
  plugins?: any[];
  frontmatter?: Record<string, unknown>;
  target?: string;
  generateVitepressSidebar?: boolean;
  siteTitle?: string;
  siteDescription?: string;
  repository?: string;
  vitepressBasePath?: string;
  indexTemplate?: string | null;
  customDocsDir?: string | null;
  customDocsSidebarLabel?: string;
}

export async function runPipeline(config: PipelineConfig): Promise<void> {
  // Phase 1: Parse
  console.log("📖 Parsing build artifacts...");
  const contracts = readBuildInfoContracts(
    config.rootDir,
    config.buildInfoDir,
    config.sourceDir || "contracts",
  );
  console.log(`   Found ${contracts.length} contract(s)`);

  if (contracts.length === 0) {
    throw new Error(
      "No contracts found. Ensure build-info directory exists and contains .output.json files.",
    );
  }

  // Phase 2: Filter
  console.log("🔍 Filtering contracts...");
  const filterOptions: FilterOptions = {
    exclude: config.exclude,
    contractKinds: config.contractKinds,
  };
  const filteredItems = buildFilteredItems(contracts, filterOptions);
  console.log(`   ${filteredItems.length} contract(s) after filtering`);

  // Phase 3: Render
  console.log("✨ Rendering markdown...");
  const renderer = new MarkdownRenderer({
    outputDir: "",
    frontmatterDefaults: config.frontmatter,
  });
  const files = await renderer.render(filteredItems);
  console.log(`   Generated ${files.length} file(s)`);

  // Phase 4: Write
  console.log("💾 Writing files...");
  mkdirSync(config.outDir, { recursive: true });

  for (const file of files) {
    const filePath = join(config.outDir, file.filePath);
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, file.content, "utf8");
    console.log(`   ✓ ${filePath}`);
  }

  // Phase 4.25: Copy custom docs directory (optional)
  if (config.customDocsDir && existsSync(config.customDocsDir)) {
    console.log("📂 Copying custom documentation files...");
    try {
      // Extract folder name from customDocsDir (e.g., "D:\path\guides" -> "guides")
      const customDocsFolderName =
        config.customDocsDir.split(sep).pop() || "customdocs";
      const customDocsOutputPath = config.outDir + sep + customDocsFolderName;

      // Copy to a named subfolder to preserve structure and identify custom docs
      cpSync(config.customDocsDir, customDocsOutputPath, { recursive: true });
      console.log(`   ✓ Custom docs copied from ${config.customDocsDir}`);
    } catch (error) {
      console.warn("   ⚠ Could not copy custom docs directory:", error);
    }
  }

  // Phase 4.5: Process custom index template (optional)
  if (config.indexTemplate) {
    console.log("📄 Processing custom index template...");
    try {
      if (existsSync(config.indexTemplate)) {
        const templateContent = readFileSync(config.indexTemplate, "utf8");
        const template = Handlebars.compile(templateContent);

        // Prepare template variables
        const templateVars = {
          title: config.siteTitle || "Documentation",
          description: config.siteDescription || "API reference",
          siteTitle: config.siteTitle || "Documentation",
          siteDescription: config.siteDescription || "API reference",
          repository:
            config.repository || "https://github.com/your-org/your-repo",
        };

        const renderedIndex = template(templateVars);
        const indexPath = join(config.outDir, "index.md");
        writeFileSync(indexPath, renderedIndex, "utf8");
        console.log(`   ✓ ${indexPath}`);
      } else {
        console.warn(`   ⚠ Index template not found: ${config.indexTemplate}`);
      }
    } catch (error) {
      console.warn("   ⚠ Could not process index template:", error);
    }
  }

  // Phase 5: Generate VitePress config (optional)
  if (config.generateVitepressSidebar) {
    console.log("📝 Generating VitePress sidebar...");
    try {
      const sidebar = generateSidebarFromDir(
        config.outDir,
        config.customDocsSidebarLabel || "Guides",
        config.customDocsDir || undefined,
      );
      const vitepressConfig = generateVitepressConfig(
        config.siteTitle || "Documentation",
        config.siteDescription || "API reference",
        config.repository,
        sidebar,
        config.vitepressBasePath || "/",
      );

      const configDir = join(config.outDir, ".vitepress");
      mkdirSync(configDir, { recursive: true });
      const configPath = join(configDir, "config.ts");
      writeFileSync(configPath, vitepressConfig, "utf8");
      console.log(`   ✓ ${configPath}`);
    } catch (error) {
      console.warn("   ⚠ Could not generate VitePress config:", error);
    }
  }

  console.log("✅ Done!");
}
