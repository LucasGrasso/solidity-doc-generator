/**
 * VitePress sidebar generator
 * Automatically generates sidebar configuration from docs folder structure
 */

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export interface SidebarItem {
  text: string;
  link?: string;
  items?: SidebarItem[];
  collapsed?: boolean;
}

/**
 * Convert a filename to readable text (fallback if no title found)
 */
function filenameToText(filename: string): string {
  // Remove .md extension
  const withoutExt = filename.replace(/\.md$/, "");

  // Handle simple camelCase/PascalCase by keeping it as-is
  return withoutExt.charAt(0).toUpperCase() + withoutExt.slice(1);
}

/**
 * Extract title from markdown frontmatter
 */
function extractTitleFromMarkdown(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const titleMatch = frontmatter.match(/^title:\s*"(.+?)"$/m);
  return titleMatch ? titleMatch[1] : null;
}

/**
 * Scan directory recursively and build sidebar structure
 */
export function generateSidebarFromDir(docsDir: string): SidebarItem[] {
  const items: SidebarItem[] = [];

  const entries = readdirSync(docsDir)
    .filter(
      (name) =>
        name !== ".vitepress" && name !== "index.md" && !name.startsWith("."),
    )
    .sort();

  for (const entry of entries) {
    const fullPath = join(docsDir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      items.push(buildFolderItem(fullPath, entry));
    }
  }

  return items;
}

/**
 * Build a sidebar item for a folder
 */
function buildFolderItem(folderPath: string, folderName: string): SidebarItem {
  const entries = readdirSync(folderPath).sort();
  const subItems: SidebarItem[] = [];

  for (const entry of entries) {
    const fullPath = join(folderPath, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      subItems.push(buildFolderItem(fullPath, entry));
    } else if (entry.endsWith(".md")) {
      const filename = entry.replace(/\.md$/, "");
      let text = filenameToText(filename);

      // Try to extract title from markdown frontmatter
      try {
        const content = readFileSync(fullPath, "utf8");
        const title = extractTitleFromMarkdown(content);
        if (title) {
          text = title;
        }
      } catch (error) {
        // Fall back to filename-based text
      }

      subItems.push({
        text,
        link: `/${getRelativePath(folderPath, entry)}`,
      });
    }
  }

  return {
    text: filenameToText(folderName),
    collapsed: true,
    items: subItems.length > 0 ? subItems : undefined,
  };
}

/**
 * Get relative path from docs directory
 */
function getRelativePath(basePath: string, filename: string): string {
  const fullPath = join(basePath, filename).replace(/\.md$/, "");
  // Normalize path separators to forward slashes for URLs
  return fullPath
    .split("\\")
    .join("/")
    .replace(/^.*docs\//, "");
}

/**
 * Generate VitePress config template with sidebar
 */
export function generateVitepressConfig(
  title: string,
  description: string,
  repository?: string,
  sidebar: SidebarItem[] = [],
): string {
  const sidebarCode = formatSidebarCode(sidebar, 6);

  return `import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "${title.replace(/"/g, '\\"')}",
  description: "${description.replace(/"/g, '\\"')}",
  
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
    ],

    sidebar: [
      {
        text: 'Home',
        link: '/'
      },
${sidebarCode}
    ],

    socialLinks: [
      { icon: 'github', link: '${repository || "https://github.com/your-org/your-repo"}' }
    ]
  }
})
`;
}

/**
 * Format sidebar items as JavaScript code with proper indentation
 */
function formatSidebarCode(items: SidebarItem[], indent: number = 2): string {
  const spaces = " ".repeat(indent);
  const nextIndent = indent + 2;
  const nextSpaces = " ".repeat(nextIndent);

  return items
    .map((item) => {
      let code = `${spaces}{\n`;
      code += `${nextSpaces}text: '${item.text.replace(/'/g, "\\'")}',\n`;

      if (item.link) {
        code += `${nextSpaces}link: '${item.link}',\n`;
      }

      if (item.collapsed !== undefined) {
        code += `${nextSpaces}collapsed: ${item.collapsed},\n`;
      }

      if (item.items && item.items.length > 0) {
        code += `${nextSpaces}items: [\n`;
        code += formatSidebarCode(item.items, nextIndent + 2);
        code += `\n${nextSpaces}]\n`;
      }

      code += `${spaces}}`;
      return code;
    })
    .join(",\n");
}
