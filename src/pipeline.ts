/**
 * Main pipeline: parse → filter → render
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

import {
  readBuildInfoContracts,
  buildFilteredItems,
  MarkdownRenderer,
  type FilterOptions,
} from "./core/index.js";

export interface PipelineConfig {
  rootDir: string;
  buildInfoDir: string;
  outDir: string;
  exclude?: string[];
  contractKinds?: string[];
  customProperties?: Record<string, (doc: any) => string | undefined>;
  plugins?: any[];
  frontmatter?: Record<string, unknown>;
  target?: string;
}

export async function runPipeline(config: PipelineConfig): Promise<void> {
  // Phase 1: Parse
  console.log("📖 Parsing build artifacts...");
  const contracts = readBuildInfoContracts(config.rootDir, config.buildInfoDir);
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

  console.log("✅ Done!");
}
