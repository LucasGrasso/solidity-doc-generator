/**
 * Property injection system
 * Extract and inject custom properties from docstrings
 */

import type { FilteredItem } from "../core/types.js";
import {
  extractCustomTagForNode,
  parseSrcStart,
  readLeadingTripleSlashLines,
  extractCustomTagFromLines,
} from "../core/parser.js";

export type PropertyDefinition = {
  name: string;
  extractor: (item: FilteredItem) => string | undefined;
};

/**
 * Property injection engine
 */
export class PropertyInjector {
  private properties: PropertyDefinition[] = [];

  /**
   * Register a custom property
   */
  registerProperty(
    name: string,
    extractor: (item: FilteredItem) => string | undefined,
  ): void {
    this.properties.push({ name, extractor });
  }

  /**
   * Register standard properties
   */
  registerStandardProperties(): void {
    // Extract @custom:category tag
    this.registerProperty("category", (item) => {
      // Try to extract from leading comment
      const doc = item.doc;
      // This is a simplified version; in a full implementation,
      // you'd extract from docstring
      return undefined;
    });

    // Extract @custom:visibility tag
    this.registerProperty("visibility", (item) => {
      const doc = item.doc;
      if (doc.contractKind === "interface") {
        return "public";
      }
      return undefined;
    });

    // Extract @custom:gasEstimate tag
    this.registerProperty("gasEstimate", (item) => {
      // Simplified; would extract from docstring
      return undefined;
    });
  }

  /**
   * Inject properties into filtered items
   */
  injectProperties(items: FilteredItem[]): FilteredItem[] {
    return items.map((item) => {
      const customProperties: Record<string, unknown> = {};

      for (const prop of this.properties) {
        const value = prop.extractor(item);
        if (value !== undefined) {
          customProperties[prop.name] = value;
        }
      }

      return {
        ...item,
        customProperties,
      };
    });
  }
}

/**
 * Extract custom tag from contract docstring
 */
export function extractContractCustomTag(
  item: FilteredItem,
  tagName: string,
): string {
  // Simplified version - in production, you'd parse the actual docstring
  const notice = item.doc.notice;
  if (!notice) {
    return "";
  }

  // Look for @custom:tagName pattern in notice
  const pattern = new RegExp(`@custom:${tagName}\\s+([^\\n]+)`);
  const match = notice.match(pattern);
  return match ? match[1].trim() : "";
}

/**
 * Standard property extractors
 */
export const standardPropertyExtractors = {
  category: (item: FilteredItem): string | undefined => {
    const tag = extractContractCustomTag(item, "category");
    return tag || undefined;
  },

  visibility: (item: FilteredItem): string | undefined => {
    if (item.doc.contractKind === "interface") {
      return "public";
    }
    return undefined;
  },

  security: (item: FilteredItem): string | undefined => {
    const tag = extractContractCustomTag(item, "security");
    return tag || undefined;
  },

  gasEstimate: (item: FilteredItem): string | undefined => {
    const tag = extractContractCustomTag(item, "gasEstimate");
    return tag || undefined;
  },
};
