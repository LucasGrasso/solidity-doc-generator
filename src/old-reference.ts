import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

type AbiParam = {
  name?: string;
  type: string;
  internalType?: string;
};

type AbiItem = {
  type: string;
  name?: string;
  stateMutability?: string;
  inputs?: AbiParam[];
  outputs?: AbiParam[];
};

type ContractOutput = {
  abi?: AbiItem[];
  devdoc?: { details?: string; methods?: Record<string, { details?: string }> };
  userdoc?: { notice?: string };
};

type BuildInfo = {
  output?: {
    contracts?: Record<string, Record<string, ContractOutput>>;
    sources?: Record<string, { ast?: AstNode }>;
  };
};

type AstNode = {
  nodeType: string;
  name?: string;
  src?: string;
  members?: AstNode[];
  contractKind?: string;
  kind?: string;
  visibility?: string;
  stateMutability?: string;
  implemented?: boolean;
  documentation?: { text?: string } | string;
  parameters?: { parameters?: AstNode[] };
  returnParameters?: { parameters?: AstNode[] };
  typeDescriptions?: { typeString?: string };
  nodes?: AstNode[];
};

type AstFunctionDoc = {
  signature: string;
  notice: string;
};

type AstStructDoc = {
  name: string;
  notice: string;
  fields: Array<{ name: string; type: string; property: string }>;
};

type AstEnumDoc = {
  name: string;
  notice: string;
  values: Array<{ name: string; variant: string }>;
};

type SourceAstDetails = {
  structs: AstStructDoc[];
  enums: AstEnumDoc[];
  freeFunctions: AstFunctionDoc[];
};

type DocContract = {
  sourcePath: string;
  contractName: string;
  contractKind: string;
  abi: AbiItem[];
  astFunctions: AstFunctionDoc[];
  sourceStructs: AstStructDoc[];
  sourceEnums: AstEnumDoc[];
  sourceFreeFunctions: AstFunctionDoc[];
  notice: string;
  details: string;
};

const ROOT = process.cwd();
const BUILD_INFO_DIR = join(ROOT, "artifacts", "build-info");
const SITE_DIR = join(ROOT, "site");

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readBuildInfoContracts(): DocContract[] {
  const files = readdirSync(BUILD_INFO_DIR).filter((name) =>
    name.endsWith(".output.json"),
  );

  const docs: DocContract[] = [];
  const sourceDetailsByPath = new Map<string, SourceAstDetails>();

  for (const fileName of files) {
    const fullPath = join(BUILD_INFO_DIR, fileName);
    const raw = readFileSync(fullPath, "utf8");
    const buildInfo = JSON.parse(raw) as BuildInfo;
    const contractsByFile = buildInfo.output?.contracts ?? {};
    const sourcesByFile = buildInfo.output?.sources ?? {};

    for (const [sourcePath, sourceData] of Object.entries(sourcesByFile)) {
      const normalizedSourcePath = sourcePath.replace(/^project\//, "");
      if (!normalizedSourcePath.startsWith("src/")) {
        continue;
      }

      if (!existsSync(join(ROOT, normalizedSourcePath))) {
        continue;
      }

      if (!sourceDetailsByPath.has(normalizedSourcePath)) {
        const sourceText = readFileSync(
          join(ROOT, normalizedSourcePath),
          "utf8",
        );
        sourceDetailsByPath.set(
          normalizedSourcePath,
          extractSourceLevelDetails(sourceData.ast, sourceText),
        );
      }
    }

    for (const [sourcePath, contracts] of Object.entries(contractsByFile)) {
      const normalizedSourcePath = sourcePath.replace(/^project\//, "");
      if (!normalizedSourcePath.startsWith("src/")) {
        continue;
      }

      // Build-info can include stale virtual paths from previous compiles.
      // Only document contracts backed by files that currently exist in the workspace.
      if (!existsSync(join(ROOT, normalizedSourcePath))) {
        continue;
      }

      const sourceAst = sourcesByFile[sourcePath]?.ast;
      const sourceText = readFileSync(join(ROOT, normalizedSourcePath), "utf8");
      const sourceDetails =
        sourceDetailsByPath.get(normalizedSourcePath) ??
        extractSourceLevelDetails(sourceAst, sourceText);

      for (const [contractName, data] of Object.entries(contracts)) {
        const astDetails = extractAstContractDetails(sourceAst, contractName);
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
        });
      }
    }
  }

  // Deduplicate by sourcePath + contractName in case multiple build-info files include the same artifact.
  const byKey = new Map<string, DocContract>();
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
      notice: "",
      details: "",
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

function parseSrcStart(src: string | undefined): number | null {
  if (!src) {
    return null;
  }

  const parts = src.split(":");
  const start = Number(parts[0]);
  return Number.isFinite(start) ? start : null;
}

function readLeadingTripleSlashLines(
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

function extractCustomTagFromLines(lines: string[], tagName: string): string {
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

function extractCustomTagForNode(
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

function extractSourceLevelDetails(
  sourceAst: AstNode | undefined,
  sourceText: string,
): SourceAstDetails {
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

function getDocText(documentation: AstNode["documentation"]): string {
  if (!documentation) {
    return "";
  }

  if (typeof documentation === "string") {
    return documentation;
  }

  return documentation.text ?? "";
}

function getNoticeFromDocText(documentation: AstNode["documentation"]): string {
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

function renderAstParam(param: AstNode): string {
  const type = param.typeDescriptions?.typeString ?? "unknown";
  const namePart = param.name ? ` ${param.name}` : "";
  return `${type}${namePart}`;
}

function renderAstFunctionSignature(fn: AstNode): string {
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

function extractAstContractDetails(
  sourceAst: AstNode | undefined,
  contractName: string,
): {
  contractKind: string;
  functions: AstFunctionDoc[];
} {
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

function renderParam(param: AbiParam): string {
  const namePart = param.name ? ` ${param.name}` : "";
  return `${param.type}${namePart}`;
}

function renderSignature(item: AbiItem): string {
  if (item.type === "function") {
    const name = item.name ?? "<anonymous>";
    const inputs = (item.inputs ?? []).map(renderParam).join(", ");
    const outputs = (item.outputs ?? []).map((out) => out.type).join(", ");
    const mut = item.stateMutability ? ` ${item.stateMutability}` : "";
    const returns = outputs ? ` returns (${outputs})` : "";
    return `function ${name}(${inputs})${mut}${returns}`;
  }

  if (item.type === "event") {
    const name = item.name ?? "<anonymous>";
    const inputs = (item.inputs ?? []).map(renderParam).join(", ");
    return `event ${name}(${inputs})`;
  }

  if (item.type === "error") {
    const name = item.name ?? "<anonymous>";
    const inputs = (item.inputs ?? []).map(renderParam).join(", ");
    return `error ${name}(${inputs})`;
  }

  return item.type;
}

type DocPage = {
  slug: string;
  folder: string;
  item: DocContract;
};

function toFolder(sourcePath: string): string {
  const withoutSrc = sourcePath.replace(/^src\//, "");
  const parts = withoutSrc.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildPages(contracts: DocContract[]): DocPage[] {
  const used = new Set<string>();

  return contracts.map((item) => {
    const base = `${item.sourcePath.replace(/^src\//, "").replace(/\.sol$/i, "")}-${item.contractName}`;
    let slug = toSlug(base);
    let counter = 2;

    while (used.has(slug)) {
      slug = `${toSlug(base)}-${counter}`;
      counter += 1;
    }

    used.add(slug);

    return {
      slug,
      folder: toFolder(item.sourcePath),
      item,
    };
  });
}

function renderShellStyles(): string {
  return `
    :root {
      --bg: #f5f8ff;
      --panel: #eef3ff;
      --card: #ffffff;
      --ink: #102341;
      --muted: #51617c;
      --line: #d5deef;
      --accent: #1956ff;
      --accent-soft: #e6eeff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Barlow", "Segoe UI", -apple-system, sans-serif;
      color: var(--ink);
      background: linear-gradient(180deg, #fafdff 0%, #f2f6ff 100%);
    }
    .layout {
      display: grid;
      grid-template-columns: 320px 1fr;
      min-height: 100vh;
    }
    nav {
      border-right: 1px solid var(--line);
      padding: 1rem;
      position: sticky;
      top: 0;
      max-height: 100vh;
      overflow: auto;
      background: var(--panel);
    }
    nav h1 {
      margin: 0 0 0.35rem;
      font-size: 1.1rem;
    }
    nav p { margin: 0 0 0.8rem; color: var(--muted); }
    .search-wrap {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.45rem;
      margin-bottom: 0.8rem;
    }
    .search-wrap input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0.45rem 0.55rem;
      font: inherit;
    }
    .search-wrap button {
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 8px;
      padding: 0.45rem 0.7rem;
      font: inherit;
      cursor: pointer;
    }
    .nav-empty {
      display: none;
      color: var(--muted);
      margin: 0.45rem 0 0.65rem;
    }
    .nav-tree {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.28rem;
    }
    .nav-folder-item {
      display: block;
    }
    .nav-group {
      border-top: 1px solid var(--line);
      padding-top: 0.55rem;
      margin-top: 0.55rem;
    }
    .nav-group summary {
      list-style: none;
      cursor: pointer;
      margin: 0;
      font-size: 0.8rem;
      font-weight: 700;
      color: #2a3f69;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.1rem 0;
    }
    .nav-group summary::-webkit-details-marker { display: none; }
    .nav-group summary::before {
      content: "▸";
      color: var(--muted);
      margin-right: 0.3rem;
      transition: transform 180ms ease;
    }
    .nav-group[open] summary::before { transform: rotate(90deg); }
    .nav-group > .nav-tree {
      margin-top: 0.32rem;
      margin-left: 0.4rem;
      padding-left: 0.62rem;
      border-left: 1px dashed #c9d6ef;
      opacity: 0.96;
      transform-origin: top left;
      animation: treeIn 170ms ease;
    }
    .nav-group summary span {
      background: var(--accent-soft);
      color: #1b3f9c;
      border: 1px solid #d4e0ff;
      border-radius: 999px;
      font-size: 0.7rem;
      padding: 0.08rem 0.42rem;
    }
    nav a {
      text-decoration: none;
      color: var(--accent);
      font-weight: 700;
      font-size: 0.92rem;
      transition: color 140ms ease;
    }
    nav a:hover {
      color: #0f3fce;
    }
    nav a.current {
      color: #092c8e;
      background: var(--accent-soft);
      border: 1px solid #d4e0ff;
      border-radius: 7px;
      padding: 0.2rem 0.4rem;
      display: inline-block;
    }
    main {
      padding: 1.2rem 1.5rem 2rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .hero {
      background: linear-gradient(115deg, #ffffff 0%, #edf3ff 100%);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 1rem 1.1rem;
      animation: cardIn 240ms ease;
    }
    .hero h2 { margin: 0 0 0.35rem; }
    .source {
      margin: 0;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.9rem;
    }
    .kind {
      display: inline-block;
      margin-top: 0.45rem;
      color: #1b3f9c;
      background: var(--accent-soft);
      border: 1px solid #d4e0ff;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.15rem 0.45rem;
    }
    .section-card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 1rem 1.05rem;
      box-shadow: 0 1px 2px rgba(16, 35, 65, 0.04);
      animation: cardIn 280ms ease;
    }
    h3 {
      margin: 0 0 0.6rem;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
    }
    h4 { margin: 0 0 0.45rem; }
    .api-note { margin: 0.25rem 0 0.45rem; color: var(--muted); }
    .api-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .api-entry {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 0.75rem;
      background: #fcfdff;
    }
    .api-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    .api-table th,
    .api-table td {
      border-bottom: 1px solid var(--line);
      padding: 0.52rem 0.58rem;
      text-align: left;
      vertical-align: top;
    }
    .api-table th {
      background: var(--accent-soft);
      color: #1b3f9c;
      font-size: 0.82rem;
    }
    code {
      white-space: pre-wrap;
      word-break: break-word;
      font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .index-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
      gap: 0.8rem;
    }
    .index-card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 0.75rem;
      transition: transform 170ms ease, box-shadow 170ms ease;
    }
    .index-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 10px rgba(14, 46, 130, 0.08);
    }
    .index-card p { margin: 0.35rem 0 0; color: var(--muted); font-size: 0.86rem; }
    @keyframes treeIn {
      from { opacity: 0; transform: translateY(-3px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes cardIn {
      from { opacity: 0; transform: translateY(5px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
      nav {
        position: static;
        max-height: unset;
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
      main { padding: 1rem; }
    }
  `;
}

function renderSidebar(
  pages: DocPage[],
  currentSlug: string | null,
  linkPrefix: string,
): string {
  type FolderNode = {
    name: string;
    path: string;
    children: Map<string, FolderNode>;
    pages: DocPage[];
  };

  const root: FolderNode = {
    name: "",
    path: "",
    children: new Map<string, FolderNode>(),
    pages: [],
  };

  for (const page of pages) {
    if (page.folder === "(root)") {
      root.pages.push(page);
      continue;
    }

    const segments = page.folder.split("/").filter(Boolean);
    let cursor = root;
    let runningPath = "";

    for (const segment of segments) {
      runningPath = runningPath ? `${runningPath}/${segment}` : segment;

      if (!cursor.children.has(segment)) {
        cursor.children.set(segment, {
          name: segment,
          path: runningPath,
          children: new Map<string, FolderNode>(),
          pages: [],
        });
      }

      cursor = cursor.children.get(segment)!;
    }

    cursor.pages.push(page);
  }

  function countPages(node: FolderNode): number {
    let total = node.pages.length;
    for (const child of node.children.values()) {
      total += countPages(child);
    }
    return total;
  }

  function nodeHasCurrent(node: FolderNode): boolean {
    if (!currentSlug) {
      return false;
    }

    if (node.pages.some((entry) => entry.slug === currentSlug)) {
      return true;
    }

    for (const child of node.children.values()) {
      if (nodeHasCurrent(child)) {
        return true;
      }
    }

    return false;
  }

  function renderPageItems(entries: DocPage[]): string {
    return entries
      .slice()
      .sort((a, b) => a.item.contractName.localeCompare(b.item.contractName))
      .map((entry) => {
        const isCurrent = currentSlug === entry.slug;
        const cls = isCurrent ? "current" : "";
        const search =
          `${entry.item.contractName} ${entry.folder}`.toLowerCase();
        return `<li class="nav-item" data-search="${escapeHtml(search)}"><a class="${cls}" href="${linkPrefix}${entry.slug}.html">${escapeHtml(entry.item.contractName)}</a></li>`;
      })
      .join("\n");
  }

  function renderNode(node: FolderNode): string {
    const childFolders = Array.from(node.children.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(renderNode)
      .join("\n");

    const pageItems = renderPageItems(node.pages);
    const children = `${pageItems}${childFolders}`;
    const open = nodeHasCurrent(node) ? "open" : "";

    return `<li class="nav-folder-item"><details class="nav-group" data-group data-folder="${escapeHtml(node.path.toLowerCase())}" ${open}><summary>${escapeHtml(node.name)} <span>${countPages(node)}</span></summary><ul class="nav-tree">${children}</ul></details></li>`;
  }

  const rootPages = renderPageItems(root.pages);
  const folderItems = Array.from(root.children.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(renderNode)
    .join("\n");

  return `<ul class="nav-tree">${rootPages}${folderItems}</ul>`;
}

function renderSearchScript(): string {
  return `<script>
      (function () {
        const input = document.getElementById("nav-search");
        const clear = document.getElementById("nav-clear");
        const navItems = Array.from(document.querySelectorAll(".nav-item"));
        const groups = Array.from(document.querySelectorAll("[data-group]"));
        const empty = document.getElementById("nav-empty");

        function applyFilter() {
          const q = (input.value || "").trim().toLowerCase();
          let visibleItems = 0;

          navItems.forEach((item) => {
            const text = item.getAttribute("data-search") || "";
            const match = q.length === 0 || text.includes(q);
            item.style.display = match ? "" : "none";
            if (match) {
              visibleItems += 1;
            }
          });

          groups.forEach((group) => {
            const groupText = group.getAttribute("data-folder") || "";
            const hasVisible = Array.from(group.querySelectorAll(".nav-item")).some(
              (item) => item.style.display !== "none",
            );
            const folderMatch = q.length > 0 && groupText.includes(q);
            const showGroup = hasVisible || folderMatch;
            group.style.display = showGroup ? "" : "none";
            if (showGroup && q.length > 0) {
              group.open = true;
            }
          });

          if (empty) {
            empty.style.display = visibleItems === 0 ? "block" : "none";
          }
        }

        if (!input || !clear) {
          return;
        }

        input.addEventListener("input", applyFilter);
        clear.addEventListener("click", function () {
          input.value = "";
          applyFilter();
          input.focus();
        });
      })();
    </script>`;
}

function renderContractContent(item: DocContract): string {
  const signatures = item.abi
    .filter(
      (abiItem) =>
        abiItem.type === "function" ||
        abiItem.type === "event" ||
        abiItem.type === "error",
    )
    .map(
      (abiItem) =>
        `<li><code>${escapeHtml(renderSignature(abiItem))}</code></li>`,
    )
    .join("\n");

  const astFunctions = item.astFunctions
    .map((fn) => {
      const notice = fn.notice
        ? `<p class="api-note">${escapeHtml(fn.notice)}</p>`
        : "";
      return `<li><code>${escapeHtml(fn.signature)}</code>${notice}</li>`;
    })
    .join("\n");

  const structSurface = item.sourceStructs.length
    ? `<div class="api-list">${item.sourceStructs
        .map((structDoc) => {
          const structNotice = structDoc.notice
            ? `<p class="api-note">${escapeHtml(structDoc.notice)}</p>`
            : "";
          const fields = structDoc.fields.length
            ? `<table class="api-table"><thead><tr><th>Field</th><th>Type</th><th>Description (@custom:property)</th></tr></thead><tbody>${structDoc.fields
                .map(
                  (field) =>
                    `<tr><td><code>${escapeHtml(field.name)}</code></td><td><code>${escapeHtml(field.type)}</code></td><td>${escapeHtml(field.property || "-")}</td></tr>`,
                )
                .join("\n")}</tbody></table>`
            : `<p>No fields.</p>`;
          return `<article class="api-entry"><h4><code>struct ${escapeHtml(structDoc.name)}</code></h4>${structNotice}${fields}</article>`;
        })
        .join("\n")}</div>`
    : `<p>No structs found.</p>`;

  const enumSurface = item.sourceEnums.length
    ? `<div class="api-list">${item.sourceEnums
        .map((enumDoc) => {
          const enumNotice = enumDoc.notice
            ? `<p class="api-note">${escapeHtml(enumDoc.notice)}</p>`
            : "";
          const values = enumDoc.values.length
            ? `<table class="api-table"><thead><tr><th>Variant</th><th>Description (@custom:variant)</th></tr></thead><tbody>${enumDoc.values
                .map(
                  (value) =>
                    `<tr><td><code>${escapeHtml(value.name)}</code></td><td>${escapeHtml(value.variant || "-")}</td></tr>`,
                )
                .join("\n")}</tbody></table>`
            : `<p>No values.</p>`;
          return `<article class="api-entry"><h4><code>enum ${escapeHtml(enumDoc.name)}</code></h4>${enumNotice}${values}</article>`;
        })
        .join("\n")}</div>`
    : `<p>No enums found.</p>`;

  const freeFunctionSurface = item.sourceFreeFunctions.length
    ? `<ul>${item.sourceFreeFunctions
        .map((fn) => {
          const fnNotice = fn.notice
            ? `<p class="api-note">${escapeHtml(fn.notice)}</p>`
            : "";
          return `<li><code>${escapeHtml(fn.signature)}</code>${fnNotice}</li>`;
        })
        .join("\n")}</ul>`
    : `<p>No top-level functions found.</p>`;

  const abiSurface = signatures
    ? `<ul>${signatures}</ul>`
    : `<p>No callable ABI entries.</p>`;
  const functionSurface = astFunctions
    ? `<ul>${astFunctions}</ul>`
    : `<p>No function definitions found in AST.</p>`;
  const notice = item.notice ? `<p>${escapeHtml(item.notice)}</p>` : "";
  const details = item.details ? `<p>${escapeHtml(item.details)}</p>` : "";

  return `
    <article class="hero">
      <h2>${escapeHtml(item.contractName)}</h2>
      <p class="source">${escapeHtml(item.sourcePath)}</p>
      <span class="kind">${escapeHtml(item.contractKind)}</span>
      ${notice}
      ${details}
    </article>
    <section class="section-card"><h3>ABI Surface</h3>${abiSurface}</section>
    <section class="section-card"><h3>Function Surface</h3>${functionSurface}</section>
    <section class="section-card"><h3>Structs</h3>${structSurface}</section>
    <section class="section-card"><h3>Enums</h3>${enumSurface}</section>
    <section class="section-card"><h3>Factory / Top-Level Functions</h3>${freeFunctionSurface}</section>
  `;
}

function buildContractHtml(pages: DocPage[], current: DocPage): string {
  const navItems = renderSidebar(pages, current.slug, "");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(current.item.contractName)} | solidity-scale-codec docs</title>
    <style>${renderShellStyles()}</style>
  </head>
  <body>
    <div class="layout">
      <nav>
        <h1><a href="../index.html" style="text-decoration:none;color:inherit;">solidity-scale-codec docs</a></h1>
        <p>Contract reference pages</p>
        <div class="search-wrap">
          <input id="nav-search" type="search" placeholder="Search contracts or folders..." />
          <button id="nav-clear" type="button">Clear</button>
        </div>
        <p id="nav-empty" class="nav-empty">No results found.</p>
        <div id="nav-groups">${navItems}</div>
      </nav>
      <main>
        ${renderContractContent(current.item)}
      </main>
    </div>
    ${renderSearchScript()}
  </body>
</html>`;
}

function buildIndexHtml(pages: DocPage[]): string {
  const navItems = renderSidebar(pages, null, "contracts/");
  const cards = pages
    .map(
      (page) =>
        `<article class="index-card"><a href="contracts/${page.slug}.html">${escapeHtml(page.item.contractName)}</a><p>${escapeHtml(page.folder)} | ${escapeHtml(page.item.contractKind)}</p></article>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>solidity-scale-codec docs</title>
    <style>${renderShellStyles()}</style>
  </head>
  <body>
    <div class="layout">
      <nav>
        <h1>solidity-scale-codec docs</h1>
        <p>Autogenerated from contracts under <code>src/</code>.</p>
        <div class="search-wrap">
          <input id="nav-search" type="search" placeholder="Search contracts or folders..." />
          <button id="nav-clear" type="button">Clear</button>
        </div>
        <p id="nav-empty" class="nav-empty">No results found.</p>
        <div id="nav-groups">${navItems}</div>
      </nav>
      <main>
        <article class="hero">
          <h2>API Reference</h2>
          <p class="source">One page per contract for durable links and indexing.</p>
        </article>
        <section class="section-card">
          <h3>Contracts</h3>
          <div class="index-grid">${cards}</div>
        </section>
      </main>
    </div>
    ${renderSearchScript()}
  </body>
</html>`;
}

function main(): void {
  const contracts = readBuildInfoContracts();

  if (contracts.length === 0) {
    throw new Error(
      "No contracts found under src/. Run `npm run compile` and ensure build-info exists.",
    );
  }

  rmSync(SITE_DIR, { recursive: true, force: true });
  mkdirSync(SITE_DIR, { recursive: true });
  mkdirSync(join(SITE_DIR, "contracts"), { recursive: true });

  const pages = buildPages(contracts);

  for (const page of pages) {
    const contractHtml = buildContractHtml(pages, page);
    writeFileSync(
      join(SITE_DIR, "contracts", `${page.slug}.html`),
      contractHtml,
      "utf8",
    );
  }

  const indexHtml = buildIndexHtml(pages);
  writeFileSync(join(SITE_DIR, "index.html"), indexHtml, "utf8");

  console.log(
    `Generated docs for ${contracts.length} contracts at site/index.html and site/contracts/*.html`,
  );
}

main();
