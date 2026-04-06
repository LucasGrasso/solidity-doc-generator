/**
 * Core type definitions for the Solidity Doc Generator
 */

// =============================================================================
// AST Types
// =============================================================================

export type AstNode = {
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

export type AbiParam = {
  name?: string;
  type: string;
  internalType?: string;
};

export type AbiItem = {
  type: string;
  name?: string;
  stateMutability?: string;
  inputs?: AbiParam[];
  outputs?: AbiParam[];
};

export type ContractOutput = {
  abi?: AbiItem[];
  devdoc?: { details?: string; methods?: Record<string, { details?: string }> };
  userdoc?: { notice?: string };
};

export type BuildInfo = {
  output?: {
    contracts?: Record<string, Record<string, ContractOutput>>;
    sources?: Record<string, { ast?: AstNode }>;
  };
};

// =============================================================================
// Extracted Documentation Types
// =============================================================================

export type FunctionDoc = {
  signature: string;
  notice: string;
};

export type StructField = {
  name: string;
  type: string;
  property: string;
};

export type StructDoc = {
  name: string;
  notice: string;
  fields: StructField[];
};

export type EnumValue = {
  name: string;
  variant: string;
};

export type EnumDoc = {
  name: string;
  notice: string;
  values: EnumValue[];
};

export type SourceLevelDetails = {
  structs: StructDoc[];
  enums: EnumDoc[];
  freeFunctions: FunctionDoc[];
};

export type ContractAstDetails = {
  contractKind: string;
  functions: FunctionDoc[];
  structs: StructDoc[];
  enums: EnumDoc[];
};

/**
 * Complete contract documentation extracted from build artifacts
 * Ready for filtering and rendering.
 */
export type ContractDoc = {
  sourcePath: string;
  contractName: string;
  contractKind: string;
  abi: AbiItem[];
  astFunctions: FunctionDoc[];
  astStructs: StructDoc[];
  astEnums: EnumDoc[];
  sourceStructs: StructDoc[];
  sourceEnums: EnumDoc[];
  sourceFreeFunctions: FunctionDoc[];
  notice: string;
  details: string;
  license?: string;
  formatTag?: string;
};

// =============================================================================
// Filtered & Rendered Types
// =============================================================================

export type FilteredItem = {
  doc: ContractDoc;
  slug: string;
  folder: string;
  category?: string;
  customProperties?: Record<string, unknown>;
};

export type RenderedFile = {
  filePath: string;
  content: string;
};

export type RenderOutput = RenderedFile[];
