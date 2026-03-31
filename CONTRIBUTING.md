# Contributing to solidity-doc-generator

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Git

### Setting Up Development Environment

1. **Clone the repository**

   ```bash
   git clone https://github.com/LucasGrasso/solidity-doc-generator.git
   cd solidity-doc-generator
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the project**

   ```bash
   npm run build
   ```

4. **Start development mode** (TypeScript watch)
   ```bash
   npm run dev
   ```

## Project Structure

```
solidity-doc-generator/
├── src/
│   ├── cli/              # Command-line interface
│   ├── core/             # Core parsing, filtering, rendering
│   ├── config/           # Configuration schema and loading
│   ├── hardhat/          # Hardhat plugin integration
│   ├── plugins/          # Plugin system
│   ├── properties/       # Property extractors
│   ├── renderers/        # Output renderers (markdown, etc)
│   ├── templates/        # Handlebars templates
│   └── utils/            # Utilities
├── dist/                 # Compiled JavaScript (generated)
├── test-contracts/       # Example test project with Hardhat
├── docs/                 # VitePress documentation site
├── bin/                  # Executable scripts
└── package.json
```

## Development Workflow

### Making Changes

1. Create a feature branch

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes in the `src/` directory

3. Build and test

   ```bash
   npm run build
   # Test with test-contracts if needed
   cd test-contracts
   npm run docgen
   ```

4. Verify TypeScript types are correct
   ```bash
   npm run build  # Will show any type errors
   ```

### Testing

Test your changes using the example project:

```bash
cd test-contracts
npm install
npm run docgen  # Using CLI
# or
npx hardhat docgen  # Using Hardhat plugin
```

### Code Style

- Use **strict TypeScript** (`"strict": true` in tsconfig.json)
- Keep functions small and focused
- Add JSDoc comments for public APIs
- Follow existing code patterns in the project

## Common Tasks

### Adding a New Feature

1. Create files in appropriate `src/` subdirectory
2. Export public APIs from `src/index.ts`
3. Update types in `src/core/types.ts` if needed
4. Test with example contracts
5. Update documentation if user-facing

### Fixing Bugs

1. Create a test case that reproduces the bug
2. Fix the bug in the source code
3. Verify the test passes
4. Add a test to prevent regression (if applicable)

### Documentation

Documentation lives in:

- **API Docs**: Generated from code via VitePress in `/docs`
- **README.md**: Quick start and overview
- **CONTRIBUTING.md**: This file
- **Code Comments**: JSDoc for complex functions

To preview documentation:

```bash
npm run docs:dev
# Then open http://localhost:5173/
```

## Pull Request Process

1. **Create a descriptive branch name**
   - `feature/add-vitepress-support`
   - `fix/incorrect-import-paths`
   - `docs/add-contributing-guide`

2. **Write clear commit messages**

   ```bash
   git commit -m "feat: add new feature description"
   git commit -m "fix: resolve issue with parsing"
   git commit -m "docs: update API documentation"
   ```

3. **Push to your fork**

   ```bash
   git push origin feature/your-feature-name
   ```

4. **Open a Pull Request on GitHub**
   - Describe what changes you made
   - Reference any related issues (#123)
   - Explain why the changes are needed

5. **Respond to review feedback**
   - Address comments and suggestions
   - Re-request review when ready

## Reporting Issues

When reporting bugs:

- **Be specific** about what you're trying to do
- **Share error messages** and stack traces
- **Include steps to reproduce** the issue
- **Mention your environment** (Node version, OS, etc)

Example issue:

```markdown
## Issue: Parser fails on contract with custom errors

### Steps to Reproduce

1. Create a Solidity file with a custom error definition
2. Run `solidity-docgen` on it
3. See the following error: ...

### Expected Behavior

The parser should handle custom errors gracefully

### Environment

- Node 18.17.0
- solidity-doc-generator v1.0.0
```

## Questions & Discussion

- **GitHub Discussions**: Ask questions and discuss features
- **GitHub Issues**: Report bugs and request features
- **Discord**: Join our community (if available)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors are recognized in the project's CONTRIBUTORS.md file.

---

Thank you for helping make solidity-doc-generator better! 🚀
