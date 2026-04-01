> [!CAUTION]
> This project was (mostly) AI-generated. It should be considered a **proof of concept** or **starting point** for development. Contributions to implement missing features, fix bugs, and improve documentation are welcome!

<a href="https://www.npmjs.com/package/solidity-doc-generator" target="_blank"><img alt="NPM Version" src="https://img.shields.io/npm/v/solidity-doc-generator">
</a>
<a href="https://github.com/LucasGrasso/solidity-doc-generator/blob/main/LICENSE" target="_blank"><img alt="GitHub License" src="https://img.shields.io/github/license/LucasGrasso/solidity-doc-generator"></a>

# Solidity Doc Generator

A **modular, markdown-based documentation generator** for Solidity contracts. Output clean markdown files with YAML frontmatter compatible with any static site generator.

Built-in integration for **VitePress** with automatic sidebar generation.

## Features

✨ **Markdown + YAML Frontmatter** — Output clean markdown files compatible with any static site generator.

🔌 **Plugin System** — Extend functionality with hook points (`onItem`, `onFilter`, `onWrite`, `onFinish`).

🎨 **Customizable Templates** — Override default Handlebars templates for custom layouts, or provide a custom home page template.

� **LaTeX Math Support** — Full LaTeX formula rendering with KaTeX (inline `$...$` and display `$$...$$` math blocks).

�📝 **Custom Properties** — Extract `@custom:*` tags from docstrings and inject into rendered output.

⚙️ **Configuration File** — Simple `.ts`/`.js`/`.json` config file.

🔍 **Source-based Grouping** — Multiple contracts from the same source file grouped into one markdown file (OpenZeppelin style).

🚀 **VitePress Integration** — Automatic sidebar generation and `.vitepress/config.ts` scaffolding.

📚 **Custom Documentation** — Include custom markdown files (guides, tutorials, contributing docs) alongside generated contract documentation.

## Quick Start

### Step 1: Install

```bash
npm install --save-dev solidity-doc-generator
```

### Step 2: Create Hardhat Project

Set up a Hardhat project with Solidity contracts:

```bash
npx hardhat init
# Place contracts in contracts/
```

### Step 3: Create Configuration

Create `docgen.config.ts` in your project root:

```typescript
import type { DocgenConfig } from "solidity-doc-generator";

export default {
  outDir: "docs",
  sourceDir: "contracts", // Which directory to document
} satisfies DocgenConfig;
```

### Step 4: Compile and Generate

```bash
# Compile contracts (generates artifacts)
npx hardhat compile

# Generate documentation
npx solidity-docgen
```

Markdown files will be generated in `docs/`.

## Usage Examples

### Basic CLI Usage

```bash
# Use default config (docgen.config.ts)
npx solidity-docgen

# Custom config file
npx solidity-docgen --config ./docgen.config.ts

# Override artifacts directory
npx solidity-docgen --artifacts-dir ./build/build-info

# Override output directory
npx solidity-docgen --output-dir ./generated-docs

# Include custom documentation and generate VitePress config
npx solidity-docgen --custom-docs-dir ./docs-content --generate-vitepress-sidebar

# Combine config file with CLI overrides
npx solidity-docgen --config myconfig.ts --artifacts-dir ./build --output-dir ./docs
```

### Custom Contract Templates

Override the default Handlebars template for rendering contracts:

```typescript
// docgen.config.ts
export default {
  outDir: "docs",
  templateDir: "./my-templates",
};
```

Create `my-templates/contract.hbs`:

```handlebars
#
{{contractName}}

{{description}}

## Functions

{{#each functions}}
  ###
  {{name}}

  {{description}}

{{/each}}
```

Available variables: `contractName`, `description`, `sourceFile`, `functions`, `events`, `errors`, etc.

### Custom Properties

Extract custom docstring tags (e.g., `@custom:category`) and inject into frontmatter:

```typescript
// docgen.config.ts
export default {
  customProperties: {
    category: (doc) => {
      // Extract @custom:category from docstring
      const match = doc.docstring?.match(/@custom:category\s+(\w+)/);
      return match?.[1] || "general";
    },
    version: (doc) => {
      return doc.docstring?.match(/@custom:version\s+([\d.]+)/)?.[1];
    },
  },
};
```

Then in your Solidity comments:

```solidity
/**
 * @custom:category tokens
 * @custom:version 2.0
 */
contract MyToken { ... }
```

Custom properties are automatically added to generated YAML frontmatter.

### Plugins

Create custom plugins to extend functionality:

```typescript
// plugins/my-plugin.ts
import type { Plugin } from "solidity-doc-generator";

export default {
  name: "my-plugin",
  hooks: {
    onItem: async (item) => {
      // Process individual contracts
      return item;
    },
    onFilter: async (items) => {
      // Modify filtered list
      return items.sort((a, b) =>
        a.doc.contractName.localeCompare(b.doc.contractName),
      );
    },
    onWrite: async (files) => {
      // Post-process rendered markdown
      return files.map((f) => ({
        ...f,
        content: "<!-- Generated -->\n" + f.content,
      }));
    },
    onFinish: async (files) => {
      // Side effects after generation
      console.log(`Generated ${files.length} files`);
    },
  },
} satisfies Plugin;
```

Register in config:

```typescript
import myPlugin from "./plugins/my-plugin";

export default {
  plugins: [myPlugin],
};
```

### Custom Index Template

Provide a custom home page template instead of auto-generating index.md:

```typescript
// docgen.config.ts
export default {
  outDir: "docs",
  indexTemplate: "./templates/index.md",
};
```

Create `templates/index.md` with Handlebars variables:

```markdown
---
layout: home
---

# {{siteTitle}}

{{siteDescription}}

[View Documentation](/api/) | [GitHub]({{repository}})
```

Available variables: `title`, `description`, `siteTitle`, `siteDescription`, `repository`

### Include Custom Documentation

Merge custom markdown files (guides, tutorials, etc.) with generated contract documentation:

```typescript
// docgen.config.ts
export default {
  outDir: "docs",
  customDocsDir: "./docs-content",
};
```

Folder structure:

```
docs-content/
├── guides/
│   ├── getting-started.md
│   └── integration.md
├── contributing.md
└── faq.md
```

Files are copied to the output directory root, preserving folder structure and appearing alongside contract documentation in the sidebar without grouping.

### LaTeX Math Formulas

Write mathematical equations in your documentation using LaTeX syntax. Both inline and display math are supported out of the box:

**Inline math** (within text):

```markdown
The little-endian encoding of integer $I$ is represented as ${B_{n}\ldots{B_0}}_{256}$.
```

**Display math** (separate blocks):

```markdown
The encoding function is defined as:

$$
\text{Enc}_{\text{LE}}: \mathbb{Z}^+ \rightarrow \mathbb{B};
(B_n \ldots B_0)_{256} \rightarrow (B_0, B_1, \ldots, B_n)
$$
```

LaTeX formulas are automatically rendered in the generated VitePress site using KaTeX. No additional setup required—the markdown-it-mathjax3 plugin is included as a dependency.

See the [scale-codec documentation](https://github.com/LucasGrasso/solidity-scale-codec/blob/main/DEFINITIONS.md) for real-world examples of mathematical notation in technical documentation.

### Integrate with VitePress

Our tool can automatically generate a complete VitePress site:

```bash
# Install VitePress locally
npm install -D vitepress vue

# Generate docs with VitePress config
npx solidity-docgen --generate-vitepress-sidebar \
  --site-title "My Contract Docs" \
  --site-description "Documentation for my smart contracts"

# Start dev server
npm run docs:dev
```

Or in `docgen.config.ts`:

```typescript
export default {
  outDir: "docs/api",
  generateVitepressSidebar: true,
  siteTitle: "My Contract Docs",
  siteDescription: "Documentation for my smart contracts",
  repository: "https://github.com/owner/repo",
  vitepressBasePath: "/repo-name/", // for GitHub Pages
  indexTemplate: "./templates/index.md",
  customDocsDir: "./docs-content",
  customDocsSidebarLabel: "Guides", // optional, default is "Guides"
};
```

This generates:

- Markdown files in `docs/api/`
- `.vitepress/config.ts` with auto-generated sidebar
- Custom home page from template
- Custom documentation grouped under "Guides" category above contracts
- Ready-to-run VitePress site with built-in search

## Configuration Options

```typescript
type DocgenConfig = {
  // Paths (relative to project root)
  buildInfoDir?: string; // Hardhat artifacts (default: artifacts/build-info)
  outDir?: string; // Output docs folder (default: docs)
  sourceDir?: string; // Contracts to document (default: contracts)
  templateDir?: string; // Custom template overrides

  // Filtering & Customization
  exclude?: string[]; // Glob patterns to exclude
  contractKinds?: string[]; // Include only these kinds (contract, interface, library)
  customProperties?: Record<string, Function>; // Custom docstring properties
  plugins?: Plugin[]; // Plugin modules
  frontmatter?: Record<string, any>; // Default YAML frontmatter

  // VitePress Integration
  generateVitepressSidebar?: boolean; // Generate .vitepress/config.ts
  siteTitle?: string; // VitePress site title
  siteDescription?: string; // VitePress site description
  vitepressBasePath?: string; // Base path for GitHub Pages (default: /)
  repository?: string; // GitHub repository URL

  // Custom Content
  indexTemplate?: string; // Path to custom index.md template
  customDocsDir?: string; // Directory with custom markdown files
  customDocsSidebarLabel?: string; // Label for custom docs in sidebar (default: Guides)
};
```

## CLI Parameter Overrides

Override config file values directly from the command line:

```bash
# Specify which contracts directory to document
npx solidity-docgen --source-dir ./src

# Override artifacts directory
npx solidity-docgen --artifacts-dir ./build/build-info

# Override output directory
npx solidity-docgen --output-dir ./generated-docs

# Set custom index template
npx solidity-docgen --index-template ./templates/index.md

# Include custom markdown files with custom sidebar label
npx solidity-docgen --custom-docs-dir ./docs-content --custom-docs-label "Documentation"

# Generate VitePress config with metadata
npx solidity-docgen --generate-vitepress-sidebar \
  --site-title "My Docs" \
  --repository "https://github.com/owner/repo"

# Combine multiple overrides
npx solidity-docgen \
  --source-dir ./contracts \
  --artifacts-dir ./build \
  --output-dir ./docs \
  --generate-vitepress-sidebar \
  --custom-docs-dir ./docs-content \
  --custom-docs-label "Guides"
```

All CLI parameters override corresponding config file settings.

## Frontmatter Format

Generated markdown files include YAML frontmatter for static site generators:

```markdown
---
title: MyToken
description: ERC20 token implementation
sourceFile: src/tokens/MyToken.sol
contractKind: contract
---

# MyToken

Contract implementation details...
```

Default fields:

- `title` — Contract name
- `description` — From contract docstring
- `sourceFile` — Source file path
- `contractKind` — contract | interface | library

Add custom fields via `customProperties` or `frontmatter` config.

## Plugin Hook Reference

Available hooks for extending functionality:

```typescript
type Plugin = {
  name: string;
  version?: string;
  hooks?: {
    // Process individual contract documents
    onItem?: (
      item: DocumentItem,
      context: PluginContext,
    ) => Promise<DocumentItem>;

    // Process filtered list of contracts
    onFilter?: (
      items: DocumentItem[],
      context: PluginContext,
    ) => Promise<DocumentItem[]>;

    // Post-process rendered markdown files
    onWrite?: (
      files: RenderedFile[],
      context: PluginContext,
    ) => Promise<RenderedFile[]>;

    // Execute after all files written (side effects, cleanup, etc.)
    onFinish?: (files: RenderedFile[], context: PluginContext) => Promise<void>;
  };
};
```

Hook input/output:

- `onItem` — Transform single contract document
- `onFilter` — Sort, deduplicate, or modify contract list
- `onWrite` — Modify markdown content, add comments, etc.
- `onFinish` — Call external APIs, log statistics, etc.

## Troubleshooting

**Q: Getting "ENOENT: no such file or directory" for artifacts**

A: Make sure you've compiled your Hardhat project:

```bash
npx hardhat compile
```

The tool reads from artifacts generated by Hardhat. Default path is `artifacts/build-info/`.

**Q: No markdown files generated**

A: Check that:

1. Contracts exist in the directory specified by `sourceDir` (default: `contracts/`)
2. Hardhat compilation succeeded
3. Contracts aren't filtered out by `exclude` glob patterns
4. Contract docstrings are valid

**Q: VitePress sidebar not generating**

A: Use the CLI flag:

```bash
npx solidity-docgen --generate-vitepress-sidebar
```

Or in config:

```typescript
export default {
  generateVitepressSidebar: true,
};
```

**Q: Custom properties not appearing in frontmatter**

A: Ensure custom property functions return non-undefined values:

```typescript
customProperties: {
  myField: (doc) => {
    // Must return a value, not undefined
    return "default";
  },
}
```

**Q: Custom docs not appearing in sidebar**

A: Ensure the `customDocsDir` path is correct and relative to your project root:

```typescript
export default {
  customDocsDir: "./docs-content", // relative to project root
  generateVitepressSidebar: true,
};
```

**Q: Custom index template variables not substituting**

A: Make sure to use the correct Handlebars syntax and variable names:

```markdown
<!-- Correct: double braces -->

{{siteTitle}}
{{repository}}

<!-- Incorrect: single braces won't work -->

{siteTitle}
```

Available variables: `title`, `description`, `siteTitle`, `siteDescription`, `repository`

## Testing

```bash
npm test
```

Tests verify artifact parsing, contract filtering, markdown rendering, and VitePress config generation.

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

## License

MIT

## Related

- [OpenZeppelin's solidity-docgen](https://github.com/OpenZeppelin/solidity-docgen) — Inspiration
- [Handlebars](https://handlebarsjs.com/) — Template engine
- [VitePress](https://vitepress.dev/) — Recommended static site generator
