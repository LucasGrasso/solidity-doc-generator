/**
 * Renderer interface and markdown implementation
 */

import type { FilteredItem, RenderedFile } from "./types.js";

// =============================================================================
// Renderer Interface
// =============================================================================

export interface Renderer {
  /**
   * Render a collection of filtered items
   */
  render(items: FilteredItem[]): Promise<RenderedFile[]>;
}

// =============================================================================
// Markdown Renderer
// =============================================================================

/**
 * Escape special characters for Markdown
 */
function escapeMarkdown(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replaceAll("#", "\\#")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Render a code block
 */
function renderCodeBlock(code: string, language = "solidity"): string {
  return `\`\`\`${language}\n${code}\n\`\`\``;
}

/**
 * Render markdown frontmatter
 */
function renderFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "string") {
      // Simple YAML escaping for strings
      const escaped = value.includes('"') ? value.replace(/"/g, '\\"') : value;
      lines.push(`${key}: "${escaped}"`);
    } else if (typeof value === "boolean" || typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    }
  }

  lines.push("---");
  return lines.join("\n");
}

// =============================================================================
// Markdown Renderer Implementation
// =============================================================================

export type MarkdownRendererOptions = {
  /** Custom frontmatter fields to add to every page */
  frontmatterDefaults?: Record<string, unknown>;

  /** Whether to include table of contents */
  includeToc?: boolean;

  /** Output directory (relative path) */
  outputDir?: string;
};

export class MarkdownRenderer implements Renderer {
  constructor(private options: MarkdownRendererOptions = {}) {}

  async render(items: FilteredItem[]): Promise<RenderedFile[]> {
    const files: RenderedFile[] = [];

    // Group items by source file
    const itemsBySource = new Map<string, FilteredItem[]>();
    for (const item of items) {
      const sourcePath = item.doc.sourcePath;
      if (!itemsBySource.has(sourcePath)) {
        itemsBySource.set(sourcePath, []);
      }
      itemsBySource.get(sourcePath)!.push(item);
    }

    // Render one file per source
    for (const [, sourceItems] of itemsBySource) {
      const { content, filePath } = this.renderSource(sourceItems);
      files.push({ filePath, content });
    }

    // Render index file summarizing all items
    const indexFile = this.renderIndex(items);
    if (indexFile) {
      files.push(indexFile);
    }

    return files;
  }

  private renderSource(items: FilteredItem[]): RenderedFile {
    if (items.length === 0) {
      throw new Error("Cannot render source with no items");
    }

    // Use the first item's metadata as the source reference
    const firstItem = items[0];
    const firstDoc = firstItem.doc;
    const outputDir = this.options.outputDir ?? "docs";

    // Construct file path with folder structure
    let filePath: string;
    if (firstItem.folder && firstItem.folder !== "(root)") {
      filePath = `${outputDir}/${firstItem.folder}/${firstItem.slug}.md`;
    } else {
      filePath = `${outputDir}/${firstItem.slug}.md`;
    }

    // Determine the page title based on number and type of items
    let pageTitle: string;
    if (items.length === 1) {
      pageTitle = firstDoc.contractName;
    } else {
      // For multiple items, use a descriptive title
      const fileLabel = firstDoc.sourcePath.split("/").pop() || "Module";
      pageTitle = fileLabel.replace(".sol", "");
    }

    // Build frontmatter
    const frontmatterData: Record<string, unknown> = {
      title: pageTitle,
      description: firstDoc.notice || firstDoc.details || "No description",
      sourceFile: firstDoc.sourcePath,
      ...this.options.frontmatterDefaults,
    };

    if (firstDoc.license) {
      frontmatterData.license = firstDoc.license;
    }

    // Build content
    const sections: string[] = [];

    // Frontmatter
    const frontmatter = renderFrontmatter(frontmatterData);
    sections.push(frontmatter);
    sections.push("");

    // Title - only add if multiple items (otherwise it will be added by item render)
    if (items.length > 1) {
      sections.push(`# ${pageTitle}`);
      sections.push("");
    }

    // File metadata
    sections.push(
      `**File**: [\`${firstDoc.sourcePath}\`](${firstDoc.sourcePath})`,
    );
    sections.push("");

    // Module description (from first item with notice/details)
    let moduleDesc = "";
    for (const item of items) {
      if (item.doc.notice || item.doc.details) {
        moduleDesc = item.doc.notice || item.doc.details || "";
        break;
      }
    }
    if (moduleDesc) {
      sections.push(moduleDesc);
      sections.push("");
    }

    // Build table of contents for multiple items
    if (items.length > 1) {
      sections.push("## Reference");
      sections.push("");
      for (const item of items) {
        const doc = item.doc;
        const name = doc.contractName;
        const anchor = name.toLowerCase().replace(/\s+/g, "-");
        sections.push(`- [${name}](#${anchor})`);
      }
      sections.push("");
    }

    // Render each item as a subsection (or main section if only one)
    for (const item of items) {
      const doc = item.doc;
      const titleLevel = items.length === 1 ? "#" : "##";

      // Title with anchor
      sections.push(`${titleLevel} ${doc.contractName}`);
      sections.push("");

      // Kind badge
      sections.push(`**Kind**: \`${doc.contractKind}\``);
      sections.push("");

      // Notice and details
      if (doc.notice && items.length > 1) {
        sections.push(doc.notice);
        sections.push("");
      }

      if (doc.details && items.length > 1) {
        sections.push("### Details");
        sections.push("");
        sections.push(doc.details);
        sections.push("");
      }

      // ABI Surface
      if (doc.abi.length > 0) {
        const functions = doc.abi.filter((item) => item.type === "function");
        const events = doc.abi.filter((item) => item.type === "event");
        const errors = doc.abi.filter((item) => item.type === "error");

        // Only show section if there's actual content
        if (functions.length > 0 || events.length > 0 || errors.length > 0) {
          sections.push(`${titleLevel}# ABI Surface`);
          sections.push("");

          if (functions.length > 0) {
            sections.push(`### Functions`);
            sections.push("");
            for (const fn of functions) {
              sections.push(`- \`${escapeMarkdown(renderAbiSignature(fn))}\``);
            }
            sections.push("");
          }

          if (events.length > 0) {
            sections.push(`### Events`);
            sections.push("");
            for (const evt of events) {
              sections.push(`- \`${escapeMarkdown(renderAbiSignature(evt))}\``);
            }
            sections.push("");
          }

          if (errors.length > 0) {
            sections.push(`### Errors`);
            sections.push("");
            for (const err of errors) {
              sections.push(`- \`${escapeMarkdown(renderAbiSignature(err))}\``);
            }
            sections.push("");
          }
        }
      }

      // Function Surface (from AST)
      if (doc.astFunctions.length > 0) {
        sections.push(`${titleLevel}# Function Surface`);
        sections.push("");
        for (const fn of doc.astFunctions) {
          // Normalize signature by removing newlines and extra spaces
          const normalizedSig = fn.signature.replace(/\s+/g, " ").trim();
          sections.push(`- \`${escapeMarkdown(normalizedSig)}\``);
          if (fn.notice) {
            sections.push(`  - ${fn.notice}`);
          }
        }
        sections.push("");
      }

      // Structs
      if (doc.sourceStructs.length > 0) {
        sections.push(`${titleLevel}# Structs`);
        sections.push("");
        for (const struct of doc.sourceStructs) {
          sections.push(`### \`struct ${struct.name}\``);
          sections.push("");
          if (struct.notice) {
            sections.push(`${struct.notice}`);
            sections.push("");
          }
          if (struct.fields.length > 0) {
            sections.push("| Field | Type | Description |");
            sections.push("|-------|------|-------------|");
            for (const field of struct.fields) {
              const desc = field.property
                ? escapeMarkdown(field.property)
                : "-";
              sections.push(
                `| \`${escapeMarkdown(field.name)}\` | \`${escapeMarkdown(field.type)}\` | ${desc} |`,
              );
            }
          }
          sections.push("");
        }
      }

      // Enums
      if (doc.sourceEnums.length > 0) {
        sections.push(`${titleLevel}# Enums`);
        sections.push("");
        for (const enumDoc of doc.sourceEnums) {
          sections.push(`### \`enum ${enumDoc.name}\``);
          sections.push("");
          if (enumDoc.notice) {
            sections.push(`${enumDoc.notice}`);
            sections.push("");
          }
          if (enumDoc.values.length > 0) {
            sections.push("| Variant | Description |");
            sections.push("|---------|-------------|");
            for (const val of enumDoc.values) {
              const desc = val.variant ? escapeMarkdown(val.variant) : "-";
              sections.push(`| \`${escapeMarkdown(val.name)}\` | ${desc} |`);
            }
          }
          sections.push("");
        }
      }

      // Free Functions
      if (doc.sourceFreeFunctions.length > 0) {
        sections.push(`${titleLevel}# Top-Level Functions`);
        sections.push("");
        for (const fn of doc.sourceFreeFunctions) {
          sections.push(`- \`${escapeMarkdown(fn.signature)}\``);
          if (fn.notice) {
            sections.push(`  - ${fn.notice}`);
          }
        }
        sections.push("");
      }
    }

    const content = sections.join("\n");

    return {
      filePath,
      content,
    };
  }

  private renderIndex(items: FilteredItem[]): RenderedFile | null {
    const outputDir = this.options.outputDir ?? "docs";
    const filePath = `${outputDir}/index.md`;

    const frontmatterData: Record<string, unknown> = {
      title: "Contract Reference",
      description: "API reference for all contracts",
      ...this.options.frontmatterDefaults,
    };

    const sections: string[] = [];
    sections.push(renderFrontmatter(frontmatterData));
    sections.push("");

    sections.push("# Contract Reference");
    sections.push("");
    sections.push("Complete reference for all contracts and types.");
    sections.push("");

    sections.push("## Contracts");
    sections.push("");
    sections.push("| Name | File | Kind |");
    sections.push("|------|------|------|");

    for (const item of items) {
      const doc = item.doc;
      // Build path based on folder structure
      let relPath: string;
      if (item.folder && item.folder !== "(root)") {
        relPath = `./${item.folder}/${item.slug}`;
      } else {
        relPath = `./${item.slug}`;
      }
      const link = `[${doc.contractName}](${relPath})`;
      sections.push(
        `| ${link} | \`${doc.sourcePath}\` | \`${doc.contractKind}\` |`,
      );
    }
    sections.push("");

    return {
      filePath,
      content: sections.join("\n"),
    };
  }
}

// =============================================================================
// Helper: Render ABI Signature (from parser)
// =============================================================================

function renderAbiSignature(item: any): string {
  if (item.type === "function") {
    const name = item.name ?? "<anonymous>";
    const inputs = (item.inputs ?? [])
      .map((p: any) => {
        const namePart = p.name ? ` ${p.name}` : "";
        return `${p.type}${namePart}`;
      })
      .join(", ");
    const outputs = (item.outputs ?? []).map((out: any) => out.type).join(", ");
    const mut = item.stateMutability ? ` ${item.stateMutability}` : "";
    const returns = outputs ? ` returns (${outputs})` : "";
    return `function ${name}(${inputs})${mut}${returns}`;
  }

  if (item.type === "event") {
    const name = item.name ?? "<anonymous>";
    const inputs = (item.inputs ?? [])
      .map((p: any) => {
        const namePart = p.name ? ` ${p.name}` : "";
        return `${p.type}${namePart}`;
      })
      .join(", ");
    return `event ${name}(${inputs})`;
  }

  if (item.type === "error") {
    const name = item.name ?? "<anonymous>";
    const inputs = (item.inputs ?? [])
      .map((p: any) => {
        const namePart = p.name ? ` ${p.name}` : "";
        return `${p.type}${namePart}`;
      })
      .join(", ");
    return `error ${name}(${inputs})`;
  }

  return item.type;
}
