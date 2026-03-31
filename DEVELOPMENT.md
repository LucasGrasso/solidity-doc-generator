# Development Guide

This document explains the architecture and how to extend solidity-docgen.

## Architecture Overview

The tool follows a **3-stage pipeline** pattern:

```
Parse → Filter → Render → Write
```

### Stage 1: Parse (`src/core/parser.ts`)

Reads Hardhat/Truffle build artifacts and extracts Solidity AST into structured metadata.

**Functions:**

- `readBuildInfoContracts(rootDir, buildInfoDir)` — Main entry point
- `extractSourceLevelDetails(ast, sourceText)` — Extract structs, enums, free functions
- `extractAstContractDetails(ast, contractName)` — Extract contract functions
- `renderAstFunctionSignature(fn)` — Convert AST node to signature string

**Input:** Build artifacts in `artifacts/build-info/*.output.json`
**Output:** `ContractDoc[]` with full metadata

### Stage 2: Filter (`src/core/filter.ts`)

Filter, sort, and group contracts. Generates URL slugs and folder assignments.

**Functions:**

- `filterContracts(contracts, options)` — Apply exclude patterns, kind filters
- `buildFilteredItems(contracts, options)` — Generate FilteredItem[] with slugs
- `groupByFolder(items)` — Group by source folder
- `groupByCategory(items)` — Group by custom category

**Input:** `ContractDoc[]`
**Output:** `FilteredItem[]` with metadata ready for rendering

### Stage 3: Render (`src/core/renderer.ts`)

Render FilteredItem to markdown files with YAML frontmatter.

**Classes:**

- `MarkdownRenderer` — Implements Renderer interface
  - Generates contract pages with ABI, functions, structs, enums
  - Generates index.md summarizing all contracts

**Input:** `FilteredItem[]`
**Output:** `RenderedFile[]` (path + content)

### Stage 4: Write

Pipeline orchestrates writing files to disk.

**File:** `src/pipeline.ts`

## Customization Points

### 1. Plugin System (`src/plugins/index.ts`)

Plugins provide hooks at key pipeline stages:

```typescript
const plugin = {
  name: "my-plugin",
  hooks: {
    // Process individual contract after parsing
    onItem: async (item, context) => {
      item.customProperties = { ... };
      return item;
    },

    // Modify filtered items before rendering
    onFilter: async (items, context) => {
      return items.sort(...);
    },

    // Post-process rendered files
    onWrite: async (files, context) => {
      return files.map(f => ({
        ...f,
        content: "<!-- Header -->\n" + f.content,
      }));
    },

    // Final cleanup/reporting
    onFinish: async (files, context) => {
      console.log(`Generated ${files.length} files`);
    },
  },
};
```

**Hook Order:** onItem → onFilter → onWrite → onFinish

### 2. Property Injection (`src/properties/index.ts`)

Extract custom fields from docstrings:

```solidity
/// @notice Main entry point
/// @custom:category core
/// @custom:security reviewed
contract MyContract {
  ...
}
```

Register extractors:

```typescript
const injector = new PropertyInjector();
injector.registerProperty("category", (item) => {
  return item.doc.notice?.includes("@custom:category") ? "core" : undefined;
});
```

### 3. Template System (`src/templates/handlebars.ts`)

Override default templates with your own Handlebars files:

```typescript
const engine = new HandlebarsTemplateEngine();
engine.registerTemplateFromFile("contract", "./my-templates/contract.hbs");

// Custom helpers
engine.registerHelper("uppercase", function (str) {
  return str.toUpperCase();
});
```

Template context:

```handlebars
---
title: { { contract.contractName } }
---

#
{{contract.contractName}}

{{#if contract.notice}}
  {{contract.notice}}
{{/if}}

{{#each contract.abi}}
  -
  {{this.type}}
  {{this.name}}
{{/each}}
```

## Adding New Features

### Example: Security Report Exporter

1. **Create `src/plugins/security-report.ts`:**

```typescript
import type { Plugin } from "./index.js";

export function createSecurityReportPlugin(): Plugin {
  return {
    name: "security-report",
    hooks: {
      onWrite: async (files, context) => {
        const report = [];

        for (const file of files) {
          const securityMatches = [
            ...file.content.matchAll(/@security:\s*([^\n]+)/g),
          ];

          if (securityMatches.length > 0) {
            report.push({
              file: file.filePath,
              findings: securityMatches.map((m) => m[1]),
            });
          }
        }

        // Write report
        const reportPath = join(context.outDir, "SECURITY_REPORT.md");
        writeFileSync(reportPath, JSON.stringify(report, null, 2));

        return files;
      },
    },
  };
}
```

2. **Register in config:**

```typescript
import { createSecurityReportPlugin } from "./plugins/security-report.js";

export default {
  plugins: [createSecurityReportPlugin()],
};
```

### Example: HTML Renderer

1. **Create `src/renderers/html.ts`:**

```typescript
import { Renderer, RenderOutput } from "../core/index.js";

export class HtmlRenderer implements Renderer {
  async render(items: FilteredItem[]): Promise<RenderOutput> {
    const files = [];

    for (const item of items) {
      const html = `
        <html>
          <h1>${item.doc.contractName}</h1>
          <p>${item.doc.notice}</p>
        </html>
      `;

      files.push({
        filePath: `${items.slug}.html`,
        content: html,
      });
    }

    return files;
  }
}
```

2. **Use in pipeline:**

```typescript
const renderer = new HtmlRenderer();
const files = await renderer.render(filteredItems);
```

## Project Structure for Contributors

```
src/
├── core/              ← Stable core pipeline (rarely changes)
├── config/            ← Configuration types
├── templates/         ← Template engines
├── properties/        ← Property injection
├── plugins/           ← Plugin system
├── renderers/         ← Output format handlers (HTML, JSON, etc.)
├── exporters/         ← Data exporters
├── cli/               ← CLI interface
├── utils/             ← Helper functions
├── pipeline.ts        ← Stages orchestrator
└── index.ts           ← Public API
```

## Testing

### Unit Tests (Future)

```typescript
import { parser } from "../src/core/parser.js";

describe("Parser", () => {
  it("should extract contract details", () => {
    const contracts = readBuildInfoContracts(testDir, testBuildDir);
    expect(contracts.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests (Future)

```typescript
import { runPipeline } from "../src/pipeline.js";

describe("Pipeline", () => {
  it("should generate markdown files", async () => {
    const config = { ... };
    await runPipeline(config);

    const files = readdirSync(config.outDir);
    expect(files.length).toBeGreaterThan(0);
  });
});
```

## Debugging

Enable verbose logging:

```typescript
const renderer = new MarkdownRenderer({
  debug: true, // (future feature)
});
```

Or use Node debugger:

```bash
node --inspect-brk node_modules/.bin/ts-node src/cli/index.ts
```

## Performance Tips

1. **Parallel processing**: Queue plugin executions
2. **Caching**: Memoize AST parsing for unchanged files
3. **Streaming**: Write large files incrementally (not needed for current use case)

## Release Checklist

- [ ] Update version in `package.json`
- [ ] Update `README.md` with new features
- [ ] Run `npm run build`
- [ ] Run tests (when available)
- [ ] Create git tag: `git tag v2.x.x`
- [ ] Publish to npm: `npm publish`

## Resources

- [Handlebars.js](https://handlebarsjs.com/) — Template language
- [Hardhat Build Info Format](https://hardhat.org/hardhat-runner/docs/guides/testing#testing-from-typescript) — AST structure
- [Solidity Contract ABI](https://docs.soliditylang.org/en/v0.8.17/abi-spec.html) — ABI spec

---

**Last updated**: March 31, 2026
