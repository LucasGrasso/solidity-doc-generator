/**
 * Handlebars template engine integration
 */

import Handlebars from "handlebars";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FilteredItem, RenderedFile } from "../core/types.js";

export type TemplateContext = {
  item: FilteredItem;
  contract: any;
  slug: string;
  folder: string;
  [key: string]: any;
};

/**
 * Handlebars-based template engine
 */
export class HandlebarsTemplateEngine {
  private templates = new Map<string, HandlebarsTemplateDelegate>();
  private partials = new Map<string, string>();

  /**
   * Register a template from source code
   */
  registerTemplate(name: string, source: string): void {
    const compiled = Handlebars.compile(source);
    this.templates.set(name, compiled);
  }

  /**
   * Register a template from file
   */
  registerTemplateFromFile(name: string, filePath: string): void {
    const source = readFileSync(filePath, "utf8");
    this.registerTemplate(name, source);
  }

  /**
   * Register a partial
   */
  registerPartial(name: string, source: string): void {
    this.partials.set(name, source);
    Handlebars.registerPartial(name, source);
  }

  /**
   * Register a partial from file
   */
  registerPartialFromFile(name: string, filePath: string): void {
    const source = readFileSync(filePath, "utf8");
    this.registerPartial(name, source);
  }

  /**
   * Register a custom helper function
   */
  registerHelper(
    name: string,
    fn: (this: any, ...args: any[]) => string,
  ): void {
    Handlebars.registerHelper(name, fn);
  }

  /**
   * Render a template with context
   */
  render(templateName: string, context: TemplateContext): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    return template(context, {
      partials: Object.fromEntries(this.partials),
    });
  }

  /**
   * Render a template from string (one-off)
   */
  renderString(source: string, context: TemplateContext): string {
    const template = Handlebars.compile(source);
    return template(context, {
      partials: Object.fromEntries(this.partials),
    });
  }
}

/**
 * Built-in template definitions
 */
export const BUILTIN_TEMPLATES = {
  contract: `---
title: {{contract.contractName}}
description: {{contract.notice}}
sourceFile: {{contract.sourcePath}}
slug: {{slug}}
---

# {{contract.contractName}}

**File**: [\`{{contract.sourcePath}}\`]({{contract.sourcePath}})
**Kind**: \`{{contract.contractKind}}\`

{{#if contract.notice}}
{{contract.notice}}
{{/if}}

{{#if contract.details}}
## Details

{{contract.details}}
{{/if}}

{{#if contract.abi.length}}
## ABI Surface

{{#each contract.abi}}
- \`{{signature}}\`
{{/each}}
{{/if}}

{{#if contract.astFunctions.length}}
## Functions

{{#each contract.astFunctions}}
- \`{{this.signature}}\`
  {{#if this.notice}}\`{{this.notice}}\`{{/if}}
{{/each}}
{{/if}}

{{#if contract.sourceStructs.length}}
## Structs

{{#each contract.sourceStructs}}
### \`struct {{this.name}}\`

{{#if this.notice}}{{this.notice}}{{/if}}

| Field | Type | Description |
|-------|------|-------------|
{{#each this.fields}}
| \`{{this.name}}\` | \`{{this.type}}\` | {{#if this.property}}{{this.property}}{{else}}-{{/if}} |
{{/each}}
{{/each}}
{{/if}}

{{#if contract.sourceEnums.length}}
## Enums

{{#each contract.sourceEnums}}
### \`enum {{this.name}}\`

{{#if this.notice}}{{this.notice}}{{/if}}

| Variant | Description |
|---------|-------------|
{{#each this.values}}
| \`{{this.name}}\` | {{#if this.variant}}{{this.variant}}{{else}}-{{/if}} |
{{/each}}
{{/each}}
{{/if}}
`,

  index: `---
title: Contract Reference
description: API reference for all contracts
---

# Contract Reference

Complete reference for all contracts and types.

## Contracts

| Name | File | Kind |
|------|------|------|
{{#each items}}
| [{{this.doc.contractName}}](./{{this.slug}}.md) | \`{{this.doc.sourcePath}}\` | \`{{this.doc.contractKind}}\` |
{{/each}}
`,
};
