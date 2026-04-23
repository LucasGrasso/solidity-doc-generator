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
import { join, dirname, resolve } from "node:path";
import Handlebars from "handlebars";

import {
  readBuildInfoContracts,
  buildFilteredItems,
  MarkdownRenderer,
  type FilterOptions,
  type FilteredItem,
  type RenderedFile,
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
  formatTags?: string[];
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
  templateDir?: string | null;
  useMarkdownTemplate?: boolean;
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
    formatTags: config.formatTags,
  };
  const filteredItems = buildFilteredItems(contracts, filterOptions);
  console.log(`   ${filteredItems.length} contract(s) after filtering`);

  // Phase 3: Render
  let files;
  const markdownTemplatePath =
    config.useMarkdownTemplate && config.templateDir
      ? join(config.templateDir, "contract.md.hbs")
      : null;

  if (markdownTemplatePath && existsSync(markdownTemplatePath)) {
    console.log("🎨 Rendering from markdown template...");
    files = await renderMarkdownFromTemplate(
      filteredItems,
      markdownTemplatePath,
      config.repository || "",
    );
    console.log(`   Generated ${files.length} file(s)`);

    // Generate default index if not in config
    if (!config.indexTemplate) {
      const indexFile = generateDefaultIndex(
        filteredItems,
        config.siteTitle || "Documentation",
      );
      if (indexFile) {
        files.push(indexFile);
      }
    }
  } else {
    console.log("✨ Rendering markdown...");
    const renderer = new MarkdownRenderer({
      outputDir: "",
      frontmatterDefaults: config.frontmatter,
    });
    files = await renderer.render(filteredItems);
    console.log(`   Generated ${files.length} file(s)`);
  }

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
        config.customDocsDir.replace(/\\/g, "/").split("/").pop() ||
        "customdocs";
      const customDocsOutputPath = resolve(config.outDir, customDocsFolderName);

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

/**
 * Render contracts using markdown Handlebars template
 */
async function renderMarkdownFromTemplate(
  items: FilteredItem[],
  templatePath: string,
  repository: string,
): Promise<RenderedFile[]> {
  const templateContent = readFileSync(templatePath, "utf8");

  // Register custom helper to compare values
  Handlebars.registerHelper("eq", (a: any, b: any) => {
    return a === b;
  });

  // Register custom helper to check if contracts are barrel
  Handlebars.registerHelper("isBarrel", (contracts: any[]) => {
    return contracts && contracts.length > 0 && contracts[0].doc && contracts[0].doc.contractKind === 'barrel';
  });

  // Register custom helper to get barrel imports
  Handlebars.registerHelper("getBarrelImports", (contracts: any[]) => {
    if (contracts && contracts.length > 0 && contracts[0].doc && contracts[0].doc.barrelImports) {
      return contracts[0].doc.barrelImports;
    }
    return [];
  });

  // Register custom helper to extract function name and parameters from signature
  Handlebars.registerHelper("functionName", (signature: string) => {
    if (!signature) return "";
    // Extract function name and parameters like "name(params)"
    // From "function name(params) visibility returns (type)"
    const match = signature.match(/function\s+(\w+\([^)]*\))/);
    return match ? match[1] : signature;
  });

  // Register custom helper to create URL-safe slug from function signature
  Handlebars.registerHelper("slugifyFunctionName", (signature: string) => {
    if (!signature) return "";
    // Extract just the function name from signature
    // From "function name(params) visibility returns (type)"
    const match = signature.match(/function\s+(\w+)\s*\(/);
    return match ? match[1].toLowerCase() : "";
  });

  // Register custom helper to slugify struct/enum names
  Handlebars.registerHelper("slugify", (name: string) => {
    if (!name) return "";
    return name.toLowerCase().replace(/\s+/g, "-");
  });

  // Register custom helper to extract filename from source path
  Handlebars.registerHelper("filenameOnly", (sourcePath: string) => {
    if (!sourcePath) return "";
    // Extract just the filename without extension from path like "contracts/AB.sol"
    const match = sourcePath.match(/([^/\\]+)\.sol$/);
    return match ? match[1] : sourcePath;
  });

  const template = Handlebars.compile(templateContent);

  // Group items by source file to render one doc per contract
  const itemsBySource = new Map<string, FilteredItem[]>();
  for (const item of items) {
    const sourcePath = item.doc.sourcePath;
    if (!itemsBySource.has(sourcePath)) {
      itemsBySource.set(sourcePath, []);
    }
    itemsBySource.get(sourcePath)!.push(item);
  }

  const files: RenderedFile[] = [];

  for (const [sourcePath, sourceItems] of itemsBySource) {
    // Prepare context for all contracts in this source file
    const context = {
      contracts: sourceItems.map((item) => ({
        doc: item.doc,
        item,
        slug: item.slug,
      })),
      sourcePath,
      folder:
        sourceItems[0].folder && sourceItems[0].folder !== "(root)"
          ? sourceItems[0].folder
          : null,
      repository,
      // Add file-level items (same for all contracts in the file)
      sourceFreeFunctions: sourceItems[0].doc.sourceFreeFunctions,
      sourceStructs: sourceItems[0].doc.sourceStructs,
      sourceEnums: sourceItems[0].doc.sourceEnums,
    };

    // Render template
    const content = template(context);

    // Determine file path based on first item's slug
    const firstItem = sourceItems[0];
    let filePath: string;
    if (firstItem.folder && firstItem.folder !== "(root)") {
      filePath = `${firstItem.folder}/${firstItem.slug}.md`;
    } else {
      filePath = `${firstItem.slug}.md`;
    }

    files.push({
      filePath,
      content,
    });
  }

  return files;
}

/**
 * Generate a default index page with a simple table of contents
 */
function generateDefaultIndex(
  items: FilteredItem[],
  title: string,
): RenderedFile | null {
  const lines: string[] = [
    `# ${title}`,
    "",
    "| Contract | Source |",
    "| --- | --- |",
  ];

  // Sort items by name
  const sortedItems = [...items].sort((a, b) =>
    a.doc.contractName.localeCompare(b.doc.contractName),
  );

  for (const item of sortedItems) {
    const contractPath =
      item.folder && item.folder !== "(root)"
        ? `/${item.folder}/${item.slug}`
        : `/${item.slug}`;

    lines.push(
      `| [${item.doc.contractName}](${contractPath}) | ${item.doc.sourcePath} |`,
    );
  }

  const content = lines.join("\n");

  return {
    filePath: "index.md",
    content,
  };
}
