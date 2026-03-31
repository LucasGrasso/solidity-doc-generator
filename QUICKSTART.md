# Quick Start Guide

Get up and running with solidity-docgen in 5 minutes.

## Prerequisites

- Node.js 18+ (with npm)
- Solidity contracts
- Hardhat or Truffle project (with compiled artifacts)

## Installation

```bash
npm install --save-dev solidity-doc-generator
```

## Setup

### Step 1: Compile Contracts

```bash
# Hardhat
npx hardhat compile

# Truffle
truffle compile
```

This creates `artifacts/build-info/*.output.json` files.

### Step 2: Create Config File

Copy `docgen.config.example.ts` to your project root:

```bash
cp node_modules/solidity-doc-generator/docgen.config.example.ts docgen.config.ts
```

(Or create a minimal config from scratch)

### Minimal Config

```typescript
// docgen.config.ts
import type { DocgenConfig } from "solidity-doc-generator";

export default {
  buildInfoDir: "artifacts/build-info",
  outDir: "docs",
} satisfies DocgenConfig;
```

### Step 3: Generate Documentation

```bash
npx solidity-docgen
```

Generated markdown files appear in `docs/` with YAML frontmatter.

## Using with External Projects

To document contracts from a different project (e.g., in a sister directory):

```bash
npx solidity-docgen \
  --root-dir ../other-project \
  --artifacts-dir ../other-project/artifacts/build-info \
  --output-dir ../other-project/docs
```

**Important:** Always specify both `--root-dir` and `--artifacts-dir` when working with external projects, so the parser can locate the source files.

## CLI Parameters

| Parameter         | Purpose                                                   |
| ----------------- | --------------------------------------------------------- |
| `--artifacts-dir` | Path to build-info directory (overrides config)           |
| `--output-dir`    | Where to write markdown files (overrides config)          |
| `--root-dir`      | Project root for locating source files (overrides config) |

Example with config + CLI override:

```bash
# config has artifacts in ./artifacts/build-info
# but override to use ./extended-artifacts instead
npx solidity-docgen --artifacts-dir ./extended-artifacts
```

## Next Steps

### Integrate with VitePress

```bash
# Install VitePress
npm install -D vitepress vue

# Create VitePress config
npx vitepress init docs
```

Copy generated `.md` files to `docs/` — VitePress reads the YAML frontmatter automatically.

### Customize Templates

Create `templates/contract.hbs`:

```handlebars
#
{{contract.contractName}}

{{#if contract.details}}
  ## Details
  {{contract.details}}
{{/if}}

{{#each contract.sourceStructs}}
  ### Struct:
  {{this.name}}
{{/each}}
```

Run `npx solidity-docgen` again to use your custom template.

### Add Plugins

```typescript
// docgen.config.ts
export default {
  plugins: [
    {
      hooks: {
        onFilter: async (items) => {
          // Sort by name
          return items.sort((a, b) =>
            a.doc.contractName.localeCompare(b.doc.contractName),
          );
        },
      },
    },
  ],
};
```

### Extract Custom Properties

Add annotations to your contracts:

```solidity
/// @notice Main contract
/// @custom:category core
/// @custom:security audited
contract MyContract { ... }
```

Access in templates or plugins:

```typescript
export default {
  customProperties: {
    category: (doc) => {
      return doc.notice?.includes("@custom:category core") ? "core" : undefined;
    },
  },
};
```

## File Locations

After running `solidity-docgen`:

```
project/
├── docs/                 ← Generated markdown
│   ├── index.md         ← Overview page
│   ├── mycontract.md    ← Per-contract pages
│   └── ...
├── docgen.config.ts     ← Configuration
└── templates/           ← Custom templates (optional)
    └── contract.hbs
```

## Available Commands

```bash
# Generate docs (uses docgen.config.ts by default)
npx solidity-docgen

# With custom config
npx solidity-docgen --config custom.config.ts

# Override artifacts directory
npx solidity-docgen --artifacts-dir ./build/build-info

# Override output directory
npx solidity-docgen --output-dir ./generated-docs

# Combined: use config file with CLI overrides
npx solidity-docgen --config myconfig.ts --artifacts-dir ./build --output-dir ./docs

# Show help
npx solidity-docgen --help

# Check version
npx solidity-docgen --version
```

## Troubleshooting

### "No contracts found"

- Run `npx hardhat compile` first
- Check `artifacts/build-info/` exists with `.output.json` files
- Verify `buildInfoDir` in config points to correct location

### Empty output

- Check that contracts are in `src/` folder (not `contracts/`)
- Verify `exclude` patterns don't filter out all contracts

### Wrong file paths

- Check `rootDir` and `buildInfoDir` in config
- Ensure paths are relative to project root

## Performance Notes

- For 100+ contracts: ~1-2 seconds
- For 1000+ contracts: ~10-15 seconds
- First run does full AST parsing; subsequent runs are faster with caching (Phase 4+)

## Next Resources

- **Full Configuration**: See [docgen.config.example.ts](./docgen.config.example.ts)
- **API Reference**: See [README.md](./README.md)
- **Development**: See [DEVELOPMENT.md](./DEVELOPMENT.md)

---

**Questions?** Open an issue on [GitHub](https://github.com/solidity-doc-generator).
