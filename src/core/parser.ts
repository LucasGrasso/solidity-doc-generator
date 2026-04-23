/**
 * Parser module: Extract Solidity AST into structured metadata
 * Migrated from old-reference.ts
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

import type {
  AstNode,
  AbiParam,
  AbiItem,
  BuildInfo,
  ContractDoc,
  ContractAstDetails,
  FunctionDoc,
  SourceLevelDetails,
  StructDoc,
  StructField,
  EnumDoc,
  EnumValue,
} from "./types.js";

// =============================================================================
// Barrel File Detection & Import Extraction
// =============================================================================

/**
 * Check if a source file is a "barrel" file (only imports, no contract definitions)
 */
export function isBarrelFile(
  sourceText: string,
  ast: AstNode | undefined,
): boolean {
  // Check AST: if no contracts/interfaces/libraries defined, it's a barrel
  const contractNodes = ast?.nodes ?? [];
  const hasContracts = contractNodes.some(
    (node) =>
      node.nodeType === "ContractDefinition" ||
      node.nodeType === "InterfaceDefinition" ||
      node.nodeType === "LibraryDefinition",
  );
  return !hasContracts;
}

/**
 * Extract import paths from a barrel file
 */
export function extractImportsFromSource(sourceText: string): string[] {
  const imports: string[] = [];
  // Split by lines and process each import line
  const lines = sourceText.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip non-import lines
    if (!trimmed.startsWith("import ")) {
      continue;
    }

    // Extract the path from quotes
    // Matches patterns like:
    //   import "./path"
    //   import {x} from "./path"
    //   import * as x from "./path"
    const match = trimmed.match(/["']([^"']+)["']/);
    if (match && match[1]) {
      const importPath = match[1];
      if (!imports.includes(importPath)) {
        imports.push(importPath);
      }
    }
  }

  return imports;
}

// =============================================================================
// Helper Functions
// =============================================================================

export function getDocText(documentation: AstNode["documentation"]): string {
  if (!documentation) {
    return "";
  }

  if (typeof documentation === "string") {
    return documentation;
  }

  return documentation.text ?? "";
}

export function getNoticeFromDocText(
  documentation: AstNode["documentation"],
): string {
  const raw = getDocText(documentation).trim();
  if (!raw) {
    return "";
  }

  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const noticeIndex = lines.findIndex((line) => line.startsWith("@notice"));
  if (noticeIndex !== -1) {
    const chunks: string[] = [];
    // Extract text after @notice on first line
    chunks.push(lines[noticeIndex].replace(/^@notice\s*/, "").trim());

    // Capture continuation lines (until next @tag)
    for (let i = noticeIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith("@")) {
        break;
      }
      chunks.push(lines[i]);
    }

    return chunks.join(" ").trim();
  }

  return lines[0].replace(/^@\w+\s*/, "").trim();
}

export function extractLicenseFromSource(
  sourceText: string,
): string | undefined {
  const lines = sourceText.split("\n");
  for (const line of lines) {
    const match = line.match(/SPDX-License-Identifier:\s*([\w.\-]+)/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

export function extractFileNotice(sourceText: string): string {
  const lines = sourceText.split("\n");
  const chunks: string[] = [];
  let inComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Stop at first non-comment, non-empty line
    if (trimmed && !trimmed.startsWith("//")) {
      if (!inComment) {
        break;
      }
      if (!trimmed.startsWith("*") && !trimmed.startsWith("/*")) {
        break;
      }
    }

    // Handle /// comments (NatSpec)
    if (trimmed.startsWith("///")) {
      inComment = true;
      const content = trimmed.replace(/^\/\/\/\s?/, "").trim();
      if (content) {
        chunks.push(content);
      }
    }
    // Handle /** */ block comments
    else if (trimmed.startsWith("/*") || inComment) {
      inComment = true;
      let content = trimmed;
      if (content.startsWith("/*")) {
        content = content.replace(/^\/\*+\s?/, "").trim();
      } else if (content.startsWith("*")) {
        content = content.replace(/^\*\s?/, "").trim();
      }
      if (content.endsWith("*/")) {
        content = content.replace(/\*\/$/, "").trim();
        inComment = false;
      }
      if (content) {
        chunks.push(content);
      }
    }
  }

  return chunks.join(" ").trim();
}

export function parseSrcStart(src: string | undefined): number | null {
  if (!src) {
    return null;
  }

  const parts = src.split(":");
  const start = Number(parts[0]);
  return Number.isFinite(start) ? start : null;
}

export function readLeadingTripleSlashLines(
  sourceText: string,
  startOffset: number,
): string[] {
  const lines: string[] = [];
  let cursor = startOffset;

  while (cursor > 0) {
    const lineEnd = sourceText.lastIndexOf("\n", cursor - 1);
    const lineStart = sourceText.lastIndexOf("\n", lineEnd - 1) + 1;
    const line = sourceText.slice(lineStart, lineEnd >= 0 ? lineEnd : 0);
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      break;
    }

    if (!trimmed.startsWith("///")) {
      break;
    }

    lines.unshift(trimmed.replace(/^\/\/\/\s?/, ""));
    cursor = lineStart;
  }

  return lines;
}

export function extractCustomTagFromLines(
  lines: string[],
  tagName: string,
): string {
  const tagPrefix = `@custom:${tagName}`;
  const chunks: string[] = [];
  let capture = false;

  for (const line of lines) {
    if (line.startsWith(tagPrefix)) {
      capture = true;
      const rest = line.slice(tagPrefix.length).trim();
      if (rest) {
        chunks.push(rest);
      }
      continue;
    }

    if (!capture) {
      continue;
    }

    if (line.startsWith("@")) {
      break;
    }

    chunks.push(line);
  }

  return chunks.join(" ").trim();
}

export function extractCustomTagForNode(
  sourceText: string,
  node: AstNode,
  tagName: string,
): string {
  const start = parseSrcStart(node.src);
  if (start === null) {
    return "";
  }

  const docLines = readLeadingTripleSlashLines(sourceText, start);
  return extractCustomTagFromLines(docLines, tagName);
}

// =============================================================================
// AST Rendering Functions
// =============================================================================

export function renderAstParam(param: AstNode): string {
  const type = param.typeDescriptions?.typeString ?? "unknown";
  const namePart = param.name ? ` ${param.name}` : "";
  return `${type}${namePart}`;
}

export function renderAstFunctionSignature(fn: AstNode): string {
  const kind = fn.kind ?? "function";
  const fnName = fn.name ?? "";

  const callableName =
    kind === "constructor"
      ? "constructor"
      : kind === "fallback"
        ? "fallback"
        : kind === "receive"
          ? "receive"
          : fnName || "<anonymous>";

  const inputs = (fn.parameters?.parameters ?? [])
    .map(renderAstParam)
    .join(", ");
  const outputs = (fn.returnParameters?.parameters ?? [])
    .map((param) => param.typeDescriptions?.typeString ?? "unknown")
    .join(", ");
  const visibility = fn.visibility ? ` ${fn.visibility}` : "";
  const mutability = fn.stateMutability ? ` ${fn.stateMutability}` : "";
  const returns = outputs ? ` returns (${outputs})` : "";

  if (kind === "constructor" || kind === "fallback" || kind === "receive") {
    return `${callableName}(${inputs})${visibility}${mutability}${returns}`;
  }

  return `function ${callableName}(${inputs})${visibility}${mutability}${returns}`;
}

export function renderAbiParam(param: AbiParam): string {
  const namePart = param.name ? ` ${param.name}` : "";
  return `${param.type}${namePart}`;
}

export function renderAbiSignature(item: AbiItem): string {
  if (item.type === "function") {
    const name = item.name ?? "<anonymous>";
    const inputs = (item.inputs ?? []).map(renderAbiParam).join(", ");
    const outputs = (item.outputs ?? []).map((out) => out.type).join(", ");
    const mut = item.stateMutability ? ` ${item.stateMutability}` : "";
    const returns = outputs ? ` returns (${outputs})` : "";
    return `function ${name}(${inputs})${mut}${returns}`;
  }

  if (item.type === "event") {
    const name = item.name ?? "<anonymous>";
    const inputs = (item.inputs ?? []).map(renderAbiParam).join(", ");
    return `event ${name}(${inputs})`;
  }

  if (item.type === "error") {
    const name = item.name ?? "<anonymous>";
    const inputs = (item.inputs ?? []).map(renderAbiParam).join(", ");
    return `error ${name}(${inputs})`;
  }

  return item.type;
}

// =============================================================================
// Source-Level Extraction (structs, enums, free functions)
// =============================================================================

/**
 * Extract file-level structs and enums from source code.
 * File-level = defined outside any contract
 */
function extractFileTypesFromSource(sourceText: string): {
  structs: StructDoc[];
  enums: EnumDoc[];
} {
  const structs: StructDoc[] = [];
  const enums: EnumDoc[] = [];
  const lines = sourceText.split("\n");

  let contractDepth = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    // Skip empty lines and comments
    if (!line || line.startsWith("//") || line.startsWith("*")) {
      continue;
    }

    // Update contract depth
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;

    // Detect struct start (only at file level)
    if (contractDepth === 0 && line.match(/^struct\s+(\w+)\s*\{/)) {
      const nameMatch = line.match(/^struct\s+(\w+)/);
      if (nameMatch) {
        const structName = nameMatch[1];
        // Collect struct content until closing brace
        let structContent = line;
        let braceCount = openBraces - closeBraces;

        while (braceCount > 0 && i < lines.length) {
          const nextLine = lines[i].trim();
          structContent += "\n" + nextLine;
          braceCount +=
            (nextLine.match(/\{/g) || []).length -
            (nextLine.match(/\}/g) || []).length;
          i++;
        }

        // Extract documentation for this struct from source
        const structStart = sourceText.indexOf(`struct ${structName}`);
        let notice = "";
        if (structStart > 0) {
          // Look backwards for /// documentation, but only in the reasonable range before this struct
          let searchStart = Math.max(0, structStart - 300);
          const beforeStruct = sourceText.substring(searchStart, structStart);

          // Find documentation comments near the struct definition
          const docMatches = [
            ...beforeStruct.matchAll(/\/\/\/\s*@notice\s+([^\n]*)/g),
          ];
          if (docMatches.length > 0) {
            // Use the last (closest) @notice found
            notice = docMatches[docMatches.length - 1][1].trim();
          }
        }

        // Parse struct fields
        const braceContent = structContent.match(/\{([^}]+)\}/s)?.[1] || "";
        const fields: StructField[] = [];

        if (braceContent) {
          // Get original source to extract comments properly
          const enumStart = sourceText.indexOf(`struct ${structName}`);
          const enumEnd = sourceText.indexOf("}", enumStart) + 1;
          const structSource = sourceText.substring(enumStart, enumEnd);

          // Split by semicolon to get individual field declarations
          const fieldDecls = braceContent.split(";");
          for (const decl of fieldDecls) {
            // Remove leading comments (/// and /** style)
            let cleaned = decl.replace(/^\s*\/\/\/.*$/gm, ""); // Remove /// comments
            cleaned = cleaned.replace(/^\s*\/\*[\s\S]*?\*\/\s*/gm, ""); // Remove /* */ comments

            const trimmed = cleaned.trim();
            if (!trimmed) {
              continue;
            }

            // Match "type name" pattern
            const fieldMatch = trimmed.match(/^(\w+(?:\[\])?)\s+(\w+)/);
            if (fieldMatch) {
              const fieldName = fieldMatch[2];

              // Extract documentation for this field from source
              let property = "";

              // Split structSource by lines and find the line with this field
              const structLines = structSource.split("\n");
              for (let i = 0; i < structLines.length; i++) {
                const structLine = structLines[i];
                // Check if this line contains the field definition
                if (structLine.match(new RegExp(`\\b${fieldName}\\b.*[;{]`))) {
                  // Found the field definition, look backwards for documentation
                  for (let j = i - 1; j >= 0; j--) {
                    const docLine = structLines[j].trim();
                    if (docLine.startsWith("///")) {
                      const match = docLine.match(/@custom:property\s+(.+)$/);
                      if (match) {
                        property = match[1].trim();
                        break;
                      }
                    } else if (
                      docLine.length > 0 &&
                      !docLine.startsWith("struct")
                    ) {
                      // Stop if we hit a non-comment, non-empty line
                      break;
                    }
                  }
                  break;
                }
              }

              fields.push({
                name: fieldName,
                type: fieldMatch[1],
                property,
              });
            }
          }
        }

        structs.push({
          name: structName,
          notice,
          fields,
        });
      }

      // Don't update contractDepth for file-level structs
      continue;
    }

    // Detect enum start (only at file level)
    if (contractDepth === 0 && line.match(/^enum\s+(\w+)\s*\{/)) {
      const nameMatch = line.match(/^enum\s+(\w+)/);
      if (nameMatch) {
        const enumName = nameMatch[1];
        // Collect enum content until closing brace
        let enumContent = line;
        let braceCount = openBraces - closeBraces;

        while (braceCount > 0 && i < lines.length) {
          const nextLine = lines[i].trim();
          enumContent += "\n" + nextLine;
          braceCount +=
            (nextLine.match(/\{/g) || []).length -
            (nextLine.match(/\}/g) || []).length;
          i++;
        }

        // Extract documentation for this enum from source
        const enumStart = sourceText.indexOf(`enum ${enumName}`);
        let notice = "";
        if (enumStart > 0) {
          // Look backwards for /// documentation, but only in the reasonable range before this enum
          let searchStart = Math.max(0, enumStart - 300);
          const beforeEnum = sourceText.substring(searchStart, enumStart);

          // Find documentation comments near the enum definition
          const docMatches = [
            ...beforeEnum.matchAll(/\/\/\/\s*@notice\s+([^\n]*)/g),
          ];
          if (docMatches.length > 0) {
            // Use the last (closest) @notice found
            notice = docMatches[docMatches.length - 1][1].trim();
          }
        }

        // Parse enum values
        const values: EnumValue[] = [];
        // Extract just the content between the braces
        const braceContent = enumContent.match(/\{([^}]+)\}/s)?.[1] || "";
        if (braceContent) {
          // Get original source to extract comments properly
          const enumSourceStart = sourceText.indexOf(`enum ${enumName}`);
          const enumSourceEnd = sourceText.indexOf("}", enumSourceStart) + 1;
          const enumSource = sourceText.substring(
            enumSourceStart,
            enumSourceEnd,
          );

          // First, remove all comments from the enum content to avoid splitting on commas inside comments
          let cleanedContent = braceContent.replace(/^\s*\/\/\/.*$/gm, ""); // Remove /// comments
          cleanedContent = cleanedContent.replace(/\/\*[\s\S]*?\*\//g, ""); // Remove /* */ comments

          // Now split by comma and clean up
          const valueLines = cleanedContent.split(",");
          for (const line of valueLines) {
            const trimmed = line.trim();
            // Skip empty lines
            if (!trimmed) {
              continue;
            }

            const valueName = trimmed.split(/[\s;]/)[0]; // Get first word
            if (valueName && valueName !== enumName) {
              // Extract documentation for this value from source
              let variant = "";

              // Split enumSource by lines and find the line with just this variant name
              const enumLines = enumSource.split("\n");
              for (let i = 0; i < enumLines.length; i++) {
                const enumLine = enumLines[i].trim();
                // Check if this line is the variant definition (may have trailing comma)
                if (enumLine.match(new RegExp(`^${valueName}\\s*,?\\s*$`))) {
                  // Found the variant definition, look backwards for documentation
                  for (let j = i - 1; j >= 0; j--) {
                    const docLine = enumLines[j].trim();
                    if (docLine.startsWith("///")) {
                      const match = docLine.match(/@custom:variant\s+(.+)$/);
                      if (match) {
                        variant = match[1].trim();
                        break;
                      }
                    } else if (docLine.length > 0) {
                      // Stop if we hit a non-comment, non-empty line
                      break;
                    }
                  }
                  break;
                }
              }

              values.push({
                name: valueName,
                variant,
              });
            }
          }
        }

        enums.push({
          name: enumName,
          notice,
          values,
        });
      }

      // Don't update contractDepth for file-level enums
      continue;
    }

    // Track contract/interface/library depth
    if (
      line.match(/^contract\s+\w+/) ||
      line.match(/^interface\s+\w+/) ||
      line.match(/^library\s+\w+/)
    ) {
      contractDepth += openBraces - closeBraces;
      continue;
    }

    // Update depth for other lines
    contractDepth += openBraces - closeBraces;
  }

  return { structs, enums };
}

/**
 * Extract file-level functions from source code.
 * File-level = defined outside any contract
 */
function extractFileFunctionsFromSource(sourceText: string): FunctionDoc[] {
  const functions: FunctionDoc[] = [];
  const lines = sourceText.split("\n");

  let contractDepth = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    // Skip empty lines and comments
    if (!line || line.startsWith("//") || line.startsWith("*")) {
      continue;
    }

    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;

    // Detect function at file level
    if (contractDepth === 0 && line.match(/^function\s+\w+/)) {
      // Find the full function signature (might span multiple lines)
      let signature = line;
      while (!signature.includes("{") && i < lines.length) {
        signature += " " + lines[i].trim();
        i++;
      }

      // Extract just the signature part (before {)
      const sigPart = signature.split("{")[0].trim();

      // Extract documentation for this function from source
      const funcStart = sourceText.indexOf(sigPart);
      let notice = "";
      if (funcStart > 0) {
        // Look backwards for /// documentation, but only in the reasonable range before this function
        let searchStart = Math.max(0, funcStart - 300);
        const beforeFunc = sourceText.substring(searchStart, funcStart);

        // Find documentation comments near the function definition
        const docMatches = [
          ...beforeFunc.matchAll(/\/\/\/\s*@notice\s+([^\n]*)/g),
        ];
        if (docMatches.length > 0) {
          // Use the last (closest) @notice found
          notice = docMatches[docMatches.length - 1][1].trim();
        }
      }

      functions.push({
        signature: sigPart,
        notice,
      });

      // Count braces for the function body
      let braceCount = openBraces - closeBraces;
      if (line.includes("{")) {
        braceCount = 0; // Reset, we already counted on the signature line
        let sigBraces =
          (signature.match(/\{/g) || []).length -
          (signature.match(/\}/g) || []).length;
        braceCount = sigBraces;
      }

      // Skip to end of function
      while (braceCount > 0 && i < lines.length) {
        const nextLine = lines[i].trim();
        braceCount +=
          (nextLine.match(/\{/g) || []).length -
          (nextLine.match(/\}/g) || []).length;
        i++;
      }
    } else {
      // Track contract/interface/library depth
      if (
        line.match(/^contract\s+\w+/) ||
        line.match(/^interface\s+\w+/) ||
        line.match(/^library\s+\w+/)
      ) {
        contractDepth += openBraces - closeBraces;
      } else {
        // Update depth for other lines
        contractDepth += openBraces - closeBraces;
      }
    }
  }

  return functions;
}

export function extractSourceLevelDetails(
  sourceAst: AstNode | undefined,
  sourceText: string,
): SourceLevelDetails {
  const nodes = sourceAst?.nodes ?? [];

  let structs = nodes
    .filter((node) => node.nodeType === "StructDefinition")
    .map((node) => ({
      name: node.name ?? "<anonymous>",
      notice: getNoticeFromDocText(node.documentation),
      fields: (node.members ?? []).map((field) => ({
        name: field.name ?? "<anonymous>",
        type: field.typeDescriptions?.typeString ?? "unknown",
        property: extractCustomTagForNode(sourceText, field, "property"),
      })),
    }));

  let enums = nodes
    .filter((node) => node.nodeType === "EnumDefinition")
    .map((node) => ({
      name: node.name ?? "<anonymous>",
      notice: getNoticeFromDocText(node.documentation),
      values: (node.members ?? []).map((member) => ({
        name: member.name ?? "<anonymous>",
        variant: extractCustomTagForNode(sourceText, member, "variant"),
      })),
    }));

  // Always parse file-level structs/enums from source since compiler AST is incomplete
  const sourceParsed = extractFileTypesFromSource(sourceText);

  // Prefer source-parsed values if we have them
  if (sourceParsed.structs.length > 0) {
    structs = sourceParsed.structs;
  }
  if (sourceParsed.enums.length > 0) {
    enums = sourceParsed.enums;
  }

  let freeFunctions = nodes
    .filter((node) => node.nodeType === "FunctionDefinition")
    .filter((node) => node.implemented !== false)
    .filter((node) => node.visibility !== "private")
    .map((node) => ({
      signature: renderAstFunctionSignature(node),
      notice: getNoticeFromDocText(node.documentation),
    }));

  // If AST didn't provide free functions, try parsing from source
  if (freeFunctions.length === 0) {
    freeFunctions = extractFileFunctionsFromSource(sourceText);
  }

  return {
    structs,
    enums,
    freeFunctions,
  };
}

// =============================================================================
// Contract-Level Extraction
// =============================================================================

/**
 * Extract @custom:formatTag from contract's leading comments
 */
export function extractFormatTagForContract(
  sourceText: string,
  sourceAst: AstNode | undefined,
  contractName: string,
): string {
  const contractNodes = sourceAst?.nodes ?? [];
  const contractNode = contractNodes.find(
    (node) =>
      node.nodeType === "ContractDefinition" && node.name === contractName,
  );

  if (!contractNode || !contractNode.src) {
    return "";
  }

  return extractCustomTagForNode(sourceText, contractNode, "formatTag");
}

/**
 * Extract contract-level structs and enums from source code
 * (Not available in compiler AST, so parse from source)
 */
function extractContractTypesFromSource(
  sourceText: string,
  contractName: string,
): { structs: StructDoc[]; enums: EnumDoc[] } {
  const structs: StructDoc[] = [];
  const enums: EnumDoc[] = [];

  // Find contract block
  const contractRegex = new RegExp(
    `contract\\s+${contractName}\\s*(?:is\\s+[^{]+)?\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}`,
    "s",
  );
  const contractMatch = sourceText.match(contractRegex);
  if (!contractMatch) {
    return { structs, enums };
  }

  const contractBody = contractMatch[1];

  // Extract structs
  const structRegex = /struct\s+(\w+)\s*\{([^}]+)\}/g;
  let structMatch;
  while ((structMatch = structRegex.exec(contractBody)) !== null) {
    const structName = structMatch[1];
    const fieldsText = structMatch[2];

    const fields: StructField[] = [];
    const fieldLines = fieldsText.split(";").filter((line) => line.trim());
    for (const line of fieldLines) {
      // Remove comments from the line
      let cleaned = line.replace(/^\s*\/\/\/.*$/gm, ""); // Remove /// comments
      cleaned = cleaned.replace(/^\s*\/\*[\s\S]*?\*\/\s*/gm, ""); // Remove /* */ comments

      const trimmed = cleaned.trim();
      if (!trimmed) continue;

      // Parse "type name" format
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        const name = parts[parts.length - 1];
        const type = parts.slice(0, -1).join(" ");

        // Extract property documentation from source
        let property = "";
        const structStart = contractBody.indexOf(`struct ${structName}`);
        if (structStart >= 0) {
          const structEnd = contractBody.indexOf("}", structStart) + 1;
          const structSource = contractBody.substring(structStart, structEnd);

          // Split by lines and find the line with this field
          const structLines = structSource.split("\n");
          for (let i = 0; i < structLines.length; i++) {
            const structLine = structLines[i];
            // Check if this line contains the field definition
            if (structLine.match(new RegExp(`\\b${name}\\b.*[;{]`))) {
              // Found the field definition, look backwards for documentation
              for (let j = i - 1; j >= 0; j--) {
                const docLine = structLines[j].trim();
                if (docLine.startsWith("///")) {
                  const match = docLine.match(/@custom:property\s+(.+)$/);
                  if (match) {
                    property = match[1].trim();
                    break;
                  }
                } else if (
                  docLine.length > 0 &&
                  !docLine.startsWith("struct")
                ) {
                  // Stop if we hit a non-comment, non-empty line
                  break;
                }
              }
              break;
            }
          }
        }

        fields.push({
          name,
          type,
          property,
        });
      }
    }

    structs.push({
      name: structName,
      notice: "",
      fields,
    });
  }

  // Extract enums
  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  let enumMatch;
  while ((enumMatch = enumRegex.exec(contractBody)) !== null) {
    const enumName = enumMatch[1];
    const valuesText = enumMatch[2];

    const values: EnumValue[] = [];

    // Get the enum source for variant documentation extraction
    const enumStart = contractBody.indexOf(`enum ${enumName}`);
    const enumEnd = contractBody.indexOf("}", enumStart) + 1;
    const enumSource = contractBody.substring(enumStart, enumEnd);

    // First, remove all comments from the values text to avoid splitting on commas inside comments
    let cleanedValues = valuesText.replace(/^\s*\/\/\/.*$/gm, ""); // Remove /// comments
    cleanedValues = cleanedValues.replace(/\/\*[\s\S]*?\*\//g, ""); // Remove /* */ comments

    // Now split by comma
    const valueLines = cleanedValues
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v);

    for (const line of valueLines) {
      if (line) {
        const valueName = line.split(/[\s;]/)[0]; // Get first word (the variant name)

        // Extract variant documentation from source
        let variant = "";

        // Split enumSource by lines and find the line with just this variant name
        const enumLines = enumSource.split("\n");
        for (let i = 0; i < enumLines.length; i++) {
          const enumLine = enumLines[i].trim();
          // Check if this line is the variant definition (may have trailing comma)
          if (enumLine.match(new RegExp(`^${valueName}\\s*,?\\s*$`))) {
            // Found the variant definition, look backwards for documentation
            for (let j = i - 1; j >= 0; j--) {
              const docLine = enumLines[j].trim();
              if (docLine.startsWith("///")) {
                const match = docLine.match(/@custom:variant\s+(.+)$/);
                if (match) {
                  variant = match[1].trim();
                  break;
                }
              } else if (docLine.length > 0) {
                // Stop if we hit a non-comment, non-empty line
                break;
              }
            }
            break;
          }
        }

        values.push({
          name: valueName,
          variant,
        });
      }
    }

    enums.push({
      name: enumName,
      notice: "",
      values,
    });
  }

  return { structs, enums };
}

export function extractAstContractDetails(
  sourceAst: AstNode | undefined,
  contractName: string,
  sourceText = "",
): ContractAstDetails {
  const contractNodes = sourceAst?.nodes ?? [];
  const contractNode = contractNodes.find(
    (node) =>
      node.nodeType === "ContractDefinition" && node.name === contractName,
  );

  if (!contractNode) {
    return { contractKind: "contract", functions: [], structs: [], enums: [] };
  }

  const functionNodes = (contractNode.nodes ?? []).filter((node) => {
    if (node.nodeType !== "FunctionDefinition") {
      return false;
    }

    // Keep only implemented callable members to avoid duplicates from interface-like declarations.
    if (node.implemented === false) {
      return false;
    }

    // Exclude private functions from documentation
    if (node.visibility === "private") {
      return false;
    }

    return true;
  });

  // Try to get structs and enums from AST first, fall back to source parsing
  let structNodes = (contractNode.nodes ?? []).filter(
    (node) => node.nodeType === "StructDefinition",
  );
  let enumNodes = (contractNode.nodes ?? []).filter(
    (node) => node.nodeType === "EnumDefinition",
  );

  // If AST doesn't have them, parse from source
  if (structNodes.length === 0 && enumNodes.length === 0 && sourceText) {
    const sourceParsed = extractContractTypesFromSource(
      sourceText,
      contractName,
    );
    return {
      contractKind: contractNode.contractKind ?? "contract",
      functions: functionNodes.map((fn) => ({
        signature: renderAstFunctionSignature(fn),
        notice: getNoticeFromDocText(fn.documentation),
      })),
      structs: sourceParsed.structs,
      enums: sourceParsed.enums,
    };
  }

  return {
    contractKind: contractNode.contractKind ?? "contract",
    functions: functionNodes.map((fn) => ({
      signature: renderAstFunctionSignature(fn),
      notice: getNoticeFromDocText(fn.documentation),
    })),
    structs: structNodes.map((struct) => ({
      name: struct.name ?? "",
      notice: getNoticeFromDocText(struct.documentation),
      fields: (struct.members ?? []).map((member) => ({
        name: member.name ?? "",
        type: member.typeDescriptions?.typeString ?? "unknown",
        property: extractCustomTagForNode(sourceText, member, "property"),
      })),
    })),
    enums: enumNodes.map((enumNode) => ({
      name: enumNode.name ?? "",
      notice: getNoticeFromDocText(enumNode.documentation),
      values: (enumNode.members ?? []).map((member) => ({
        name: member.name ?? "",
        variant: extractCustomTagForNode(sourceText, member, "variant"),
      })),
    })),
  };
}

// =============================================================================
// Build Info Reading
// =============================================================================

export function readBuildInfoContracts(
  rootDir: string,
  buildInfoDir: string,
  sourceDir: string = "contracts",
): ContractDoc[] {
  const files = readdirSync(buildInfoDir).filter((name) =>
    name.endsWith(".output.json"),
  );

  const docs: ContractDoc[] = [];
  const sourceDetailsByPath = new Map<string, SourceLevelDetails>();
  const allSourcesByFile = new Map<string, AstNode | undefined>();

  for (const fileName of files) {
    const fullPath = join(buildInfoDir, fileName);
    const raw = readFileSync(fullPath, "utf8");
    const buildInfo = JSON.parse(raw) as BuildInfo;
    const contractsByFile = buildInfo.output?.contracts ?? {};
    const sourcesByFile = buildInfo.output?.sources ?? {};

    // Store all sources for barrel detection later
    for (const [sourcePath, sourceData] of Object.entries(sourcesByFile)) {
      const normalizedSourcePath = sourcePath.replace(/^project\//, "");
      if (!allSourcesByFile.has(normalizedSourcePath)) {
        allSourcesByFile.set(normalizedSourcePath, sourceData.ast);
      }
    }

    // First pass: extract source-level details (structs, enums, free functions)
    for (const [sourcePath, sourceData] of Object.entries(sourcesByFile)) {
      const normalizedSourcePath = sourcePath.replace(/^project\//, "");
      if (!normalizedSourcePath.startsWith(sourceDir + "/")) {
        continue;
      }

      if (!existsSync(join(rootDir, normalizedSourcePath))) {
        continue;
      }

      if (!sourceDetailsByPath.has(normalizedSourcePath)) {
        const sourceText = readFileSync(
          join(rootDir, normalizedSourcePath),
          "utf8",
        );
        sourceDetailsByPath.set(
          normalizedSourcePath,
          extractSourceLevelDetails(sourceData.ast, sourceText),
        );
      }
    }

    // Second pass: extract contract-level details
    for (const [sourcePath, contracts] of Object.entries(contractsByFile)) {
      const normalizedSourcePath = sourcePath.replace(/^project\//, "");
      if (!normalizedSourcePath.startsWith(sourceDir + "/")) {
        continue;
      }

      // Build-info can include stale virtual paths from previous compiles.
      // Only document contracts backed by files that currently exist in the workspace.
      if (!existsSync(join(rootDir, normalizedSourcePath))) {
        continue;
      }

      const sourceAst = sourcesByFile[sourcePath]?.ast;
      const sourceText = readFileSync(
        join(rootDir, normalizedSourcePath),
        "utf8",
      );
      const sourceDetails =
        sourceDetailsByPath.get(normalizedSourcePath) ??
        extractSourceLevelDetails(sourceAst, sourceText);

      for (const [contractName, data] of Object.entries(contracts)) {
        const astDetails = extractAstContractDetails(
          sourceAst,
          contractName,
          sourceText,
        );
        const license = extractLicenseFromSource(sourceText);
        const formatTag = extractFormatTagForContract(
          sourceText,
          sourceAst,
          contractName,
        );
        docs.push({
          sourcePath: normalizedSourcePath,
          contractName,
          contractKind: astDetails.contractKind,
          abi: data.abi ?? [],
          astFunctions: astDetails.functions,
          astStructs: astDetails.structs,
          astEnums: astDetails.enums,
          sourceStructs: sourceDetails.structs,
          sourceEnums: sourceDetails.enums,
          sourceFreeFunctions: sourceDetails.freeFunctions,
          notice: data.userdoc?.notice ?? "",
          details: data.devdoc?.details ?? "",
          license,
          formatTag: formatTag || undefined,
        });
      }
    }
  }

  // Deduplicate by sourcePath + contractName in case multiple build-info files include the same artifact.
  const byKey = new Map<string, ContractDoc>();
  for (const doc of docs) {
    byKey.set(`${doc.sourcePath}:${doc.contractName}`, doc);
  }

  // Create a map of source files to contracts for barrel file resolution
  const contractsBySourcePath = new Map<string, ContractDoc[]>();
  for (const doc of Array.from(byKey.values())) {
    if (!contractsBySourcePath.has(doc.sourcePath)) {
      contractsBySourcePath.set(doc.sourcePath, []);
    }
    contractsBySourcePath.get(doc.sourcePath)!.push(doc);
  }

  // Add source-level docs for files that define structs/enums/free functions
  // but do not emit any contract artifacts.
  for (const [sourcePath, sourceDetails] of sourceDetailsByPath.entries()) {
    const hasSourceContent =
      sourceDetails.structs.length > 0 ||
      sourceDetails.enums.length > 0 ||
      sourceDetails.freeFunctions.length > 0;

    if (!hasSourceContent) {
      continue;
    }

    const alreadyRepresented = Array.from(byKey.values()).some(
      (doc) => doc.sourcePath === sourcePath,
    );

    if (alreadyRepresented) {
      continue;
    }

    // Read source file to extract license and file-level docstrings
    const sourceText = readFileSync(join(rootDir, sourcePath), "utf8");
    const license = extractLicenseFromSource(sourceText);
    const fileNotice = extractFileNotice(sourceText);

    const sourceTitle = basename(sourcePath, ".sol");
    byKey.set(`${sourcePath}:${sourceTitle}`, {
      sourcePath,
      contractName: sourceTitle,
      contractKind: "source",
      abi: [],
      astFunctions: [],
      astStructs: [],
      astEnums: [],
      sourceStructs: sourceDetails.structs,
      sourceEnums: sourceDetails.enums,
      sourceFreeFunctions: sourceDetails.freeFunctions,
      notice: fileNotice,
      details: "",
      license,
    });
  }

  // Detect barrel files (source files with no contracts and only imports)
  // and create entries that group imported contracts
  for (const [sourcePath, sourceAst] of allSourcesByFile.entries()) {
    if (!sourcePath.startsWith(sourceDir + "/")) {
      continue;
    }

    if (!existsSync(join(rootDir, sourcePath))) {
      continue;
    }

    // Check if this file is a barrel (AST exists but no contracts of its own)
    const sourceText = readFileSync(join(rootDir, sourcePath), "utf8");

    if (isBarrelFile(sourceText, sourceAst)) {
      // Extract imports from barrel file
      const imports = extractImportsFromSource(sourceText);

      if (imports.length > 0) {
        // Resolve imports to contracts
        const barrelImports: Array<{ path: string; contracts: ContractDoc[] }> =
          [];
        const importedPaths = new Set<string>();

        for (const importPath of imports) {
          // Normalize import paths like "./AB.sol" or "./AB" to match absolute paths
          let resolvedPath = importPath;

          // If it's a relative path, resolve it relative to the barrel file's directory
          if (resolvedPath.startsWith("./") || resolvedPath.startsWith("../")) {
            const barrelDir = sourcePath.substring(
              0,
              sourcePath.lastIndexOf("/"),
            );
            resolvedPath = join(barrelDir, resolvedPath).replace(/\\/g, "/");
          }

          // Add .sol if not present
          if (!resolvedPath.endsWith(".sol")) {
            resolvedPath += ".sol";
          }

          // Get contracts from this import
          const importedContracts =
            contractsBySourcePath.get(resolvedPath) || [];

          if (
            importedContracts.length > 0 &&
            !importedPaths.has(resolvedPath)
          ) {
            barrelImports.push({
              path: resolvedPath,
              contracts: importedContracts,
            });
            importedPaths.add(resolvedPath);
          }
        }

        // Create a barrel entry if we found imported contracts
        if (barrelImports.length > 0) {
          const license = extractLicenseFromSource(sourceText);
          const barrelTitle = basename(sourcePath, ".sol");
          const barrelKey = `${sourcePath}:${barrelTitle}`;
          const barrelDoc: ContractDoc = {
            sourcePath,
            contractName: barrelTitle,
            contractKind: "barrel",
            abi: [],
            astFunctions: [],
            astStructs: [],
            astEnums: [],
            sourceStructs: [],
            sourceEnums: [],
            sourceFreeFunctions: [],
            notice: `Re-exports from ${imports.map((p) => basename(p, ".sol")).join(", ")}`,
            details: "",
            license,
            barrelImports,
          };

          // Replace any existing source entry for this file with the barrel entry
          byKey.set(barrelKey, barrelDoc);
        }
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const pathCmp = a.sourcePath.localeCompare(b.sourcePath);
    if (pathCmp !== 0) {
      return pathCmp;
    }
    return a.contractName.localeCompare(b.contractName);
  });
}
