#!/usr/bin/env node

/**
 * CLI entry point for solidity-docgen
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";

async function main(): Promise<void> {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  let configPath = "docgen.config.ts";
  let watch = false;
  const overrides: Record<string, any> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && args[i + 1]) {
      configPath = args[i + 1];
      i++;
    } else if (args[i] === "--artifacts-dir" && args[i + 1]) {
      overrides.buildInfoDir = args[i + 1];
      i++;
    } else if (args[i] === "--output-dir" && args[i + 1]) {
      overrides.outDir = args[i + 1];
      i++;
    } else if (args[i] === "--root-dir" && args[i + 1]) {
      overrides.rootDir = args[i + 1];
      i++;
    } else if (args[i] === "--source-dir" && args[i + 1]) {
      overrides.sourceDir = args[i + 1];
      i++;
    } else if (args[i] === "--generate-vitepress-sidebar") {
      overrides.generateVitepressSidebar = true;
    } else if (args[i] === "--site-title" && args[i + 1]) {
      overrides.siteTitle = args[i + 1];
      i++;
    } else if (args[i] === "--site-description" && args[i + 1]) {
      overrides.siteDescription = args[i + 1];
      i++;
    } else if (args[i] === "--repository" && args[i + 1]) {
      overrides.repository = args[i + 1];
      i++;
    } else if (args[i] === "--index-template" && args[i + 1]) {
      overrides.indexTemplate = args[i + 1];
      i++;
    } else if (args[i] === "--watch") {
      watch = true;
    } else if (args[i] === "--help" || args[i] === "-h") {
      printHelp();
      process.exit(0);
    } else if (args[i] === "--version" || args[i] === "-v") {
      console.log("solidity-docgen v1.0.0");
      process.exit(0);
    }
  }

  // Resolve config path
  const resolvedConfigPath = resolve(configPath);

  if (!existsSync(resolvedConfigPath)) {
    console.error(`❌ Config file not found: ${resolvedConfigPath}`);
    console.error(
      `   Create a config file at ${configPath} or use --config <path>`,
    );
    process.exit(1);
  }

  try {
    // Dynamically import the pipeline and config modules
    const { loadConfig, normalizeConfig } = await import("../core/index.js");
    const { runPipeline } = await import("../pipeline.js");

    console.log(`📋 Loading config from ${resolvedConfigPath}...`);
    const rawConfig = await loadConfig(resolvedConfigPath);

    // Apply CLI overrides to config
    const mergedConfig = { ...rawConfig, ...overrides };
    const config = normalizeConfig(mergedConfig);

    if (watch) {
      console.log("👀 Watch mode not yet implemented (Phase 3)");
      process.exit(1);
    }

    await runPipeline(config);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`❌ Error: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
    } else {
      console.error(`❌ Unknown error`, error);
    }
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
solidity-docgen - Generate markdown documentation from Solidity contracts

USAGE
  solidity-docgen [OPTIONS]

OPTIONS
  --config <path>              Path to config file (default: docgen.config.ts)
  --artifacts-dir <dir>        Build artifacts directory (overrides config)
  --source-dir <dir>           Source directory for contracts (default: contracts)
  --output-dir <dir>           Output directory (overrides config)
  --root-dir <dir>             Project root directory (overrides config)
  --generate-vitepress-sidebar Auto-generate VitePress config from docs
  --site-title <title>         Site title for VitePress config
  --site-description <desc>    Site description for VitePress config
  --repository <url>           Repository URL for VitePress config
  --index-template <path>      Custom index.md template (supports handlebars)
  --watch                      Watch mode (not yet implemented)
  --help, -h                   Show this help message
  --version, -v                Show version

EXAMPLES
  # With default config file (docgen.config.ts)
  $ solidity-docgen

  # With custom config path
  $ solidity-docgen --config custom-config.ts

  # Override artifacts directory
  $ solidity-docgen --artifacts-dir ./build/build-info

  # Auto-generate VitePress sidebar
  $ solidity-docgen --generate-vitepress-sidebar --site-title "My API Docs"

  # Combined: artifacts + root-dir + auto-sidebar
  $ solidity-docgen --root-dir ../my-project --artifacts-dir ../my-project/artifacts/build-info --generate-vitepress-sidebar

For more information, visit: https://github.com/solidity-doc-generator
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
