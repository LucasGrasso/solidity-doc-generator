/**
 * Plugin system with hook points
 */

import type { FilteredItem, RenderedFile, ContractDoc } from "../core/types.js";

/**
 * Plugin hook types
 */
export type PluginHooks = {
  /**
   * onItem: Process each parsed contract
   * Useful for enriching metadata, computing properties, validating
   */
  onItem?: (
    item: FilteredItem,
    context: PluginContext,
  ) => FilteredItem | Promise<FilteredItem>;

  /**
   * onFilter: Process filtered item list before rendering
   * Useful for sorting, grouping, categorizing
   */
  onFilter?: (
    items: FilteredItem[],
    context: PluginContext,
  ) => FilteredItem[] | Promise<FilteredItem[]>;

  /**
   * onWrite: Process rendered files before writing
   * Useful for post-processing, validation, analytics
   */
  onWrite?: (
    files: RenderedFile[],
    context: PluginContext,
  ) => RenderedFile[] | Promise<RenderedFile[]>;

  /**
   * onFinish: Final hook after all files are written
   * Useful for side effects like uploading, reporting
   */
  onFinish?: (
    files: RenderedFile[],
    context: PluginContext,
  ) => void | Promise<void>;
};

/**
 * Plugin context passed to hooks
 */
export type PluginContext = {
  config: any;
  rootDir: string;
  outDir: string;
};

/**
 * Plugin interface
 */
export interface Plugin {
  name?: string;
  version?: string;
  hooks: PluginHooks;
}

/**
 * Plugin loader and executor
 */
export class PluginManager {
  private plugins: Plugin[] = [];

  /**
   * Register a plugin
   */
  registerPlugin(plugin: Plugin | PluginHooks): void {
    // If hooks object passed directly, wrap it
    const normalized: Plugin =
      "hooks" in plugin ? (plugin as Plugin) : { hooks: plugin as PluginHooks };

    this.plugins.push(normalized);
  }

  /**
   * Register multiple plugins
   */
  registerPlugins(plugins: (Plugin | PluginHooks)[]): void {
    for (const plugin of plugins) {
      this.registerPlugin(plugin);
    }
  }

  /**
   * Execute onItem hooks
   */
  async executeOnItem(
    item: FilteredItem,
    context: PluginContext,
  ): Promise<FilteredItem> {
    let result = item;

    for (const plugin of this.plugins) {
      if (plugin.hooks.onItem) {
        result = await plugin.hooks.onItem(result, context);
      }
    }

    return result;
  }

  /**
   * Execute onFilter hooks
   */
  async executeOnFilter(
    items: FilteredItem[],
    context: PluginContext,
  ): Promise<FilteredItem[]> {
    let result = items;

    for (const plugin of this.plugins) {
      if (plugin.hooks.onFilter) {
        result = await plugin.hooks.onFilter(result, context);
      }
    }

    return result;
  }

  /**
   * Execute onWrite hooks
   */
  async executeOnWrite(
    files: RenderedFile[],
    context: PluginContext,
  ): Promise<RenderedFile[]> {
    let result = files;

    for (const plugin of this.plugins) {
      if (plugin.hooks.onWrite) {
        result = await plugin.hooks.onWrite(result, context);
      }
    }

    return result;
  }

  /**
   * Execute onFinish hooks
   */
  async executeOnFinish(
    files: RenderedFile[],
    context: PluginContext,
  ): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.hooks.onFinish) {
        await plugin.hooks.onFinish(files, context);
      }
    }
  }
}

/**
 * Example security report generator plugin
 */
export function createSecurityReportPlugin(): Plugin {
  return {
    name: "security-report",
    version: "1.0.0",
    hooks: {
      onWrite: async (files, context) => {
        // Example: Generate a security findings report
        const securityFindings = files
          .filter((f) => f.content.includes("@custom:security"))
          .map((f) => ({
            file: f.filePath,
            findings: "Review security annotations",
          }));

        if (securityFindings.length > 0) {
          console.log("🔒 Security findings:");
          for (const finding of securityFindings) {
            console.log(`   - ${finding.file}`);
          }
        }

        return files;
      },
    },
  };
}

/**
 * Example category grouping plugin
 */
export function createCategoryGroupingPlugin(): Plugin {
  return {
    name: "category-grouping",
    version: "1.0.0",
    hooks: {
      onFilter: async (items, context) => {
        // Example: Assign categories based on contract kind
        return items.map((item) => ({
          ...item,
          category:
            item.category ||
            (item.doc.contractKind === "library" ? "libraries" : "contracts"),
        }));
      },
    },
  };
}
