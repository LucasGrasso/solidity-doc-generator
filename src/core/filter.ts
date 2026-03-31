/**
 * Filter module: Filter, sort, and group contracts
 */

import { basename } from "node:path";
import type { ContractDoc, FilteredItem } from "./types.js";

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Extract folder from source path
 * @example
 *   toFolder("src/contracts/Token.sol") => "contracts"
 *   toFolder("src/Token.sol") => "(root)"
 */
export function toFolder(sourcePath: string): string {
  const withoutSrc = sourcePath.replace(/^src\//, "");
  const parts = withoutSrc.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
}

/**
 * Convert to URL-safe slug
 * @example
 *   toSlug("MyContract") => "mycontract"
 *   toSlug("My-Contract 123") => "my-contract-123"
 */
export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// =============================================================================
// Filter Types & Interfaces
// =============================================================================

export type FilterOptions = {
  /**
   * Exclude patterns using glob syntax
   */
  exclude?: string[];

  /**
   * Only include contracts of these kinds
   * @example ["contract", "interface", "library"]
   */
  contractKinds?: string[];

  /**
   * Custom sorting function
   */
  sort?: (a: ContractDoc, b: ContractDoc) => number;

  /**
   * Custom category assignment function
   */
  categoryFn?: (doc: ContractDoc) => string | undefined;
};

// =============================================================================
// Filtering & Grouping
// =============================================================================

/**
 * Check if a path matches a glob pattern (simple implementation)
 */
function matchesGlob(path: string, pattern: string): boolean {
  const regex = new RegExp(
    "^" +
      pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".") +
      "$",
  );
  return regex.test(path);
}

/**
 * Check if a contract should be excluded
 */
function shouldExclude(doc: ContractDoc, excludePatterns?: string[]): boolean {
  if (!excludePatterns || excludePatterns.length === 0) {
    return false;
  }

  return excludePatterns.some((pattern) =>
    matchesGlob(doc.sourcePath, pattern),
  );
}

/**
 * Apply filters to contracts
 */
export function filterContracts(
  contracts: ContractDoc[],
  options: FilterOptions = {},
): ContractDoc[] {
  let filtered = contracts.filter((doc) => {
    // Exclude check
    if (shouldExclude(doc, options.exclude)) {
      return false;
    }

    // Contract kind check
    if (
      options.contractKinds &&
      options.contractKinds.length > 0 &&
      !options.contractKinds.includes(doc.contractKind)
    ) {
      return false;
    }

    return true;
  });

  // Apply sorting
  if (options.sort) {
    filtered.sort(options.sort);
  } else {
    // Default sorting: by source path, then by contract name
    filtered.sort((a, b) => {
      const pathCmp = a.sourcePath.localeCompare(b.sourcePath);
      if (pathCmp !== 0) {
        return pathCmp;
      }
      return a.contractName.localeCompare(b.contractName);
    });
  }

  return filtered;
}

/**
 * Build filtered items from contracts with slug generation
 */
export function buildFilteredItems(
  contracts: ContractDoc[],
  options: FilterOptions = {},
): FilteredItem[] {
  const filtered = filterContracts(contracts, options);
  const sourceToSlug = new Map<string, string>();
  const used = new Set<string>();

  // First pass: assign slugs to unique source files
  for (const doc of filtered) {
    if (!sourceToSlug.has(doc.sourcePath)) {
      // Generate slug from source filename (without .sol extension)
      const sourceFile = basename(doc.sourcePath).replace(/\.sol$/, "");
      let slug = toSlug(sourceFile);
      let counter = 2;

      // Ensure slug uniqueness
      while (used.has(slug)) {
        slug = `${toSlug(sourceFile)}-${counter}`;
        counter += 1;
      }

      used.add(slug);
      sourceToSlug.set(doc.sourcePath, slug);
    }
  }

  // Second pass: create filtered items with source-file-based slugs
  return filtered.map((doc) => {
    const slug = sourceToSlug.get(doc.sourcePath)!;

    return {
      doc,
      slug,
      folder: toFolder(doc.sourcePath),
      category: options.categoryFn?.(doc),
    };
  });
}

/**
 * Group filtered items by folder
 */
export function groupByFolder(
  items: FilteredItem[],
): Map<string, FilteredItem[]> {
  const groups = new Map<string, FilteredItem[]>();

  for (const item of items) {
    if (!groups.has(item.folder)) {
      groups.set(item.folder, []);
    }
    groups.get(item.folder)!.push(item);
  }

  return groups;
}

/**
 * Group filtered items by category
 */
export function groupByCategory(
  items: FilteredItem[],
): Map<string | undefined, FilteredItem[]> {
  const groups = new Map<string | undefined, FilteredItem[]>();

  for (const item of items) {
    const category = item.category;
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category)!.push(item);
  }

  return groups;
}
