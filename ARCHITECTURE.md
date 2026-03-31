## Architecture: Implementation Status

### Phase 1: Core Pipeline ✅ (Complete)

**Status:** Fully implemented and tested

- `src/core/parser.ts` — Extract Solidity AST from Hardhat build artifacts
- `src/core/filter.ts` — Filter by contract kind, generate slugs, group by source file
- `src/core/renderer.ts` — OpenZeppelin-style renderer (multiple contracts per source file)
- `src/core/types.ts` — TypeScript types for AST, filtered items, rendered files
- `src/config/schema.ts` — Configuration schema and validation
- `src/pipeline.ts` — Orchestrates parse → filter → render → write pipeline

### Phase 2: Customization ✅ (Complete)

**Status:** Fully implemented

- `src/templates/handlebars.ts` — Handlebars template engine with built-in templates
- `src/properties/index.ts` — Custom property extraction from JSDoc/NatSpec
- `src/plugins/index.ts` — Plugin system with hook points (onItem, onFilter, onWrite, onFinish)

### Phase 2.5: VitePress Integration ✅ (Implemented)

**Status:** Fully working

- `src/sidebar-generator.ts` — Auto-generates `.vitepress/config.ts` with sidebar from markdown structure
- Frontmatter support with YAML header generation
- Automatic documentation index creation

### Phase 3: CLI ✅ (Implemented)

**Status:** Fully implemented with all major features

- `src/cli/index.ts` — Command-line interface with:
  - `--config <path>` — Configuration file path
  - `--artifacts-dir <dir>` — Build artifacts directory
  - `--output-dir <dir>` — Output markdown directory
  - `--root-dir <dir>` — Project root directory
  - `--source-dir <dir>` — Solidity source directory (default: contracts)
  - `--generate-vitepress-sidebar` — Auto-generate VitePress config
  - `--site-title <title>` — Site title for VitePress
  - `--site-description <desc>` — Site description for VitePress
  - `--watch` — Watch mode (placeholder - Phase 4)
  - Help and version flags

### Phase 4: Advanced Site Integration ⚠️ (Partial)

**Status:** Only VitePress implemented; others planned

**Implemented:**

- ✅ VitePress `.vitepress/config.ts` generation

**Not Implemented:**

- ❌ Next.js frontmatter generator
- ❌ MkDocs frontmatter generator
- ❌ Jekyll frontmatter generator
- ❌ Nextra frontmatter generator

### Phase 5: Exporters ❌ (Not Implemented)

**Status:** Planned but not yet built

- `src/exporters/json.ts` — Export contract metadata as JSON
- `src/exporters/types.ts` — Generate TypeScript type definitions
- `src/exporters/abi.ts` — Extract and export contract ABIs
