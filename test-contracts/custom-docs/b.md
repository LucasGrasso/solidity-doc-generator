# Frequently Asked Questions

## General Questions

### What documentation generator is used?

This documentation is generated automatically using [solidity-doc-generator](https://github.com/solidity-doc-generator/). The tool parses Solidity contracts and generates clean markdown documentation compatible with VitePress.

### How is this documentation generated?

The documentation pipeline:

1. **Parse** — Reads Hardhat build artifacts
2. **Filter** — Selects which contracts to document
3. **Render** — Converts to markdown with YAML frontmatter
4. **Write** — Saves files to docs directory
5. **Configure** — Generates VitePress configuration

### Can I contribute to the documentation?

Yes! The documentation is part of the source code repository. Check `CONTRIBUTING.md` for guidelines.

## Technical Questions

### Where are the contract source files?

Contract source files are located in:

```
contracts/
├── ContractName.sol
└── ...
```

### How do I understand the function signatures?

Each function documentation includes:

- **Name** — Function identifier
- **Parameters** — Input arguments and types
- **Return values** — Output types and descriptions
- **Visibility** — public, internal, external, private

### What do the different function types mean?

- **view/pure** — Read-only functions (don't modify state)
- **payable** — Can receive Ether
- **constructor** — Contract initialization
- **receive/fallback** — Special functions for receiving Ether

## Troubleshooting

### Documentation not updating?

Make sure you've:

1. Compiled the contracts: `npx hardhat compile`
2. Regenerated docs: `npx solidity-docgen`
3. Rebuilt the site: `npm run docs:build`

### Page not found (404)?

- Check that the contract exists in the sidebar
- Verify the contract wasn't excluded in configuration
- Try rebuilding the entire site

### Function not documented?

Ensure the function has a proper docstring:

```solidity
/**
 * @notice Brief description of what this does
 * @param paramName Description of parameter
 * @return Description of return value
 */
function myFunction(uint256 paramName) external returns (uint256) {
    // ...
}
```
