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
} from "./types.js";

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

  const noticeLine = lines.find((line) => line.startsWith("@notice"));
  if (noticeLine) {
    return noticeLine.replace(/^@notice\s*/, "").trim();
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

export function extractSourceLevelDetails(
  sourceAst: AstNode | undefined,
  sourceText: string,
): SourceLevelDetails {
  const nodes = sourceAst?.nodes ?? [];

  const structs = nodes
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

  const enums = nodes
    .filter((node) => node.nodeType === "EnumDefinition")
    .map((node) => ({
      name: node.name ?? "<anonymous>",
      notice: getNoticeFromDocText(node.documentation),
      values: (node.members ?? []).map((member) => ({
        name: member.name ?? "<anonymous>",
        variant: extractCustomTagForNode(sourceText, member, "variant"),
      })),
    }));

  const freeFunctions = nodes
    .filter((node) => node.nodeType === "FunctionDefinition")
    .filter((node) => node.implemented !== false)
    .map((node) => ({
      signature: renderAstFunctionSignature(node),
      notice: getNoticeFromDocText(node.documentation),
    }));

  return {
    structs,
    enums,
    freeFunctions,
  };
}

// =============================================================================
// Contract-Level Extraction
// =============================================================================

export function extractAstContractDetails(
  sourceAst: AstNode | undefined,
  contractName: string,
): ContractAstDetails {
  const contractNodes = sourceAst?.nodes ?? [];
  const contractNode = contractNodes.find(
    (node) =>
      node.nodeType === "ContractDefinition" && node.name === contractName,
  );

  if (!contractNode) {
    return { contractKind: "contract", functions: [] };
  }

  const functionNodes = (contractNode.nodes ?? []).filter((node) => {
    if (node.nodeType !== "FunctionDefinition") {
      return false;
    }

    // Keep only implemented callable members to avoid duplicates from interface-like declarations.
    return node.implemented !== false;
  });

  return {
    contractKind: contractNode.contractKind ?? "contract",
    functions: functionNodes.map((fn) => ({
      signature: renderAstFunctionSignature(fn),
      notice: getNoticeFromDocText(fn.documentation),
    })),
  };
}

// =============================================================================
// Build Info Reading
// =============================================================================

export function readBuildInfoContracts(
  rootDir: string,
  buildInfoDir: string,
): ContractDoc[] {
  const files = readdirSync(buildInfoDir).filter((name) =>
    name.endsWith(".output.json"),
  );

  const docs: ContractDoc[] = [];
  const sourceDetailsByPath = new Map<string, SourceLevelDetails>();

  for (const fileName of files) {
    const fullPath = join(buildInfoDir, fileName);
    const raw = readFileSync(fullPath, "utf8");
    const buildInfo = JSON.parse(raw) as BuildInfo;
    const contractsByFile = buildInfo.output?.contracts ?? {};
    const sourcesByFile = buildInfo.output?.sources ?? {};

    // First pass: extract source-level details (structs, enums, free functions)
    for (const [sourcePath, sourceData] of Object.entries(sourcesByFile)) {
      const normalizedSourcePath = sourcePath.replace(/^project\//, "");
      if (!normalizedSourcePath.startsWith("src/")) {
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
      if (!normalizedSourcePath.startsWith("src/")) {
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
        const astDetails = extractAstContractDetails(sourceAst, contractName);
        const license = extractLicenseFromSource(sourceText);
        docs.push({
          sourcePath: normalizedSourcePath,
          contractName,
          contractKind: astDetails.contractKind,
          abi: data.abi ?? [],
          astFunctions: astDetails.functions,
          sourceStructs: sourceDetails.structs,
          sourceEnums: sourceDetails.enums,
          sourceFreeFunctions: sourceDetails.freeFunctions,
          notice: data.userdoc?.notice ?? "",
          details: data.devdoc?.details ?? "",
          license,
        });
      }
    }
  }

  // Deduplicate by sourcePath + contractName in case multiple build-info files include the same artifact.
  const byKey = new Map<string, ContractDoc>();
  for (const doc of docs) {
    byKey.set(`${doc.sourcePath}:${doc.contractName}`, doc);
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
      sourceStructs: sourceDetails.structs,
      sourceEnums: sourceDetails.enums,
      sourceFreeFunctions: sourceDetails.freeFunctions,
      notice: fileNotice,
      details: "",
      license,
    });
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const pathCmp = a.sourcePath.localeCompare(b.sourcePath);
    if (pathCmp !== 0) {
      return pathCmp;
    }
    return a.contractName.localeCompare(b.contractName);
  });
}
