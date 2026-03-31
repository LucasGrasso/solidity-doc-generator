> [!CAUTION]
> This project was (mostly) AI-generated. It should be considered a **proof of concept** or **starting point** for development. Contributions to implement missing features, fix bugs, and improve documentation are welcome!

# Solidity Doc Generator

A **modular, markdown-based documentation generator** for Solidity contracts. Output clean markdown files with YAML frontmatter compatible with any static site generator (Next.js, VitePress, MkDocs, etc.).

It has a built-in integration for VitePress.

## Features

✨ **Markdown + YAML Frontmatter** — Decouples content from styling. Works with VitePress, Next.js, MkDocs, Jekyll, or any static site generator.

🔌 **Plugin System** — Extend functionality with hook points (`onItem`, `onFilter`, `onWrite`, `onFinish`).

🎨 **Customizable Templates** — Override default Handlebars templates for custom layouts.

📝 **Custom Properties** — Extract `@custom:*` tags from docstrings and inject into rendered output.

⚙️ **Configuration File** — Simple `.ts`/`.js`/`.json` config (not embedded in `hardhat.config.ts`).

🔍 **Filtering & Grouping** — Exclude contracts, filter by kind, group by folder/category.

📤 **Metadata Export** — Generate JSON and TypeScript definitions for programmatic access.

## Architecture: 5 Phases

### Phase 1: Core Pipeline ✅

- `src/core/parser.ts` — Extract Solidity AST into structured metadata
- `src/core/filter.ts` — Filter, sort, and group contracts
- `src/core/renderer.ts` — Abstract renderer interface + markdown implementation
- `src/config/schema.ts` — Configuration types and loader

### Phase 2: Customization 🚀

- `src/templates/handlebars.ts` — Handlebars template engine
- `src/properties/index.ts` — Custom property injection system
- `src/plugins/index.ts` — Plugin system with hook points

### Phase 3: CLI (Not yet implemented)

- `src/cli/index.ts` — Command-line interface
- `src/hardhat-task.ts` — Optional Hardhat v3 plugin

### Phase 4: Site Integration (Not yet implemented)

- Frontmatter generators for VitePress, Next.js, MkDocs
- Navigation index generation

### Phase 5: Exporters (Not yet implemented)

- `src/exporters/json.ts` — JSON metadata export
- `src/exporters/types.ts` — TypeScript type generation

## Quick Start

### Step 1: Install Dependencies

```bash
npm install
npm install --save-dev ts-node
```

### Step 2: Create Configuration

Create `docgen.config.ts`:

```typescript
import type { DocgenConfig } from "./src/config/schema";

export default {
  rootDir: process.cwd(),
  buildInfoDir: "artifacts/build-info",
  outDir: "docs",
  templateDir: "templates",
  exclude: ["**/Mock*.sol", "**/test/**"],
  contractKinds: ["contract", "interface", "library"],
  frontmatter: {
    author: "My Project",
    license: "MIT",
  },
} satisfies DocgenConfig;
```

### Step 3: Run Pipeline

```bash
npx ts-node src/cli/index.ts --config docgen.config.ts
```

Generated markdown files will appear in `docs/`.

## Project Structure

```
solidity-doc-generator/
├── src/
│   ├── core/
│   │   ├── types.ts          # Shared types
│   │   ├── parser.ts         # AST extraction
│   │   ├── filter.ts         # Filtering & grouping
│   │   ├── renderer.ts       # Markdown renderer
│   │   └── index.ts          # Core exports
│   ├── config/
│   │   └── schema.ts         # Config types & loader
│   ├── templates/
│   │   └── handlebars.ts     # Template engine
│   ├── properties/
│   │   └── index.ts          # Property injection
│   ├── plugins/
│   │   └── index.ts          # Plugin system
│   ├── renderers/            # (Future: additional renderers)
│   ├── exporters/            # (Future: JSON, TypeScript exports)
│   ├── cli/                  # (Future: CLI entry point)
│   ├── utils/                # (Future: utility functions)
│   ├── pipeline.ts           # Main orchestration
│   └── index.ts              # Main exports
├── tsconfig.json
├── package.json
├── docgen.config.example.ts
└── README.md
```

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

# Combine config file with CLI overrides
npx solidity-docgen --config myconfig.ts --artifacts-dir ./build --output-dir ./docs
```

### With Custom Templates

```typescript
// docgen.config.ts
export default {
  outDir: "./docs",
  templateDir: "./my-templates", // Override default .hbs files
};
```

Place custom templates in `my-templates/contract.hbs`, etc.

### With Custom Properties

```typescript
export default {
  customProperties: {
    category: (doc) => {
      if (doc.contractName.includes("ERC")) return "standards";
      return "utilities";
    },
    gasEstimate: (doc) => {
      // Extract from docstring or compute
      return undefined;
    },
  },
};
```

### With Plugins

```typescript
export default {
  plugins: [
    {
      onFilter: async (items, context) => {
        // Sort by contract name
        return items.sort((a, b) =>
          a.doc.contractName.localeCompare(b.doc.contractName),
        );
      },
      onWrite: async (files, context) => {
        // Add custom metadata
        return files.map((f) => ({
          ...f,
          content: "<!-- Auto-generated -->\n" + f.content,
        }));
      },
    },
  ],
};
```

### Integrate with VitePress

1. Generate docs: `npx solidity-docgen --config docgen.config.ts`
2. Copy `docs/*.md` to your VitePress `docs/` folder
3. VitePress automatically reads YAML frontmatter
4. Configure sidebar in `.vitepress/config.ts`

```typescript
import { createSidebar } from "path/to/generated/sidebar.js";

export default {
  themeConfig: {
    sidebar: createSidebar(),
  },
};
```

## Configuration Options

```typescript
type DocgenConfig = {
  // Paths
  rootDir?: string; // Project root (default: cwd)
  buildInfoDir?: string; // Artifact location (default: artifacts/build-info)
  outDir?: string; // Output location (default: docs)
  templateDir?: string; // Template overrides (default: templates)

  // Filtering
  exclude?: string[]; // Glob patterns to exclude
  contractKinds?: string[]; // Contract types to include

  // Customization
  customProperties?: Record<string, Function>; // Extract custom fields
  plugins?: Plugin[]; // Plugin modules
  frontmatter?: Record<string, any>; // Default frontmatter fields

  // Target site generator
  target?: "generic" | "vitepress" | "nextra" | "mkdocs" | "jekyll";
};
```

## CLI Parameter Overrides

Configuration file values can be overridden via command-line parameters:

```bash
# Override artifacts directory (default: artifacts/build-info)
npx solidity-docgen --artifacts-dir ./build/output

# Override output directory (default: docs)
npx solidity-docgen --output-dir ./documentation

# Override root directory (default: current working directory)
npx solidity-docgen --root-dir ./projects/my-contract

# Combine multiple parameters
npx solidity-docgen --config prod.config.ts \
  --artifacts-dir ./build \
  --output-dir ./generated-docs \
  --root-dir ./
```

This allows for flexible workflows where the same config file works across different environments or folder structures.

## Frontmatter Format

Generated markdown files include YAML frontmatter:

```markdown
---
title: MyContract
description: Main entry point for the protocol
sourceFile: src/MyContract.sol
contractKind: contract
slug: mycontract
category: core
---

# MyContract

...
```

This works with all major static site generators out-of-the-box.

## Plugin Development

Create a plugin by implementing the `Plugin` interface:

```typescript
import type { Plugin, PluginContext } from "solidity-doc-generator";

const myPlugin: Plugin = {
  name: "my-plugin",
  version: "1.0.0",
  hooks: {
    onItem: async (item, context) => {
      // Process each contract
      return { ...item, category: "my-category" };
    },
    onFilter: async (items, context) => {
      // Process filtered list
      return items.sort(...);
    },
    onWrite: async (files, context) => {
      // Post-process rendered files
      return files.map(...);
    },
    onFinish: async (files, context) => {
      // Side effects after writing
      console.log(`Generated ${files.length} files`);
    },
  },
};

export default myPlugin;
```

Register in config:

```typescript
import myPlugin from "./plugins/my-plugin.ts";

export default {
  plugins: [myPlugin],
};
```

## Development Status

| Phase                     | Status         | Features                              |
| ------------------------- | -------------- | ------------------------------------- |
| Phase 1: Core             | ✅ Complete    | Parser, filter, markdown renderer     |
| Phase 2: Customization    | 🚀 In Progress | Templates, properties, plugins        |
| Phase 3: CLI              | 📋 Planned     | CLI tool, Hardhat plugin              |
| Phase 4: Site Integration | 📋 Planned     | Frontmatter presets, index generation |
| Phase 5: Exporters        | 📋 Planned     | JSON, TypeScript exports              |

## Testing

```bash
npm test
```

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

## License

MIT

## Related

- [OpenZeppelin's solidity-docgen](https://github.com/OpenZeppelin/solidity-docgen) — Inspiration
- [Handlebars](https://handlebarsjs.com/) — Template engine
- [VitePress](https://vitepress.dev/) — Recommended static site generator
