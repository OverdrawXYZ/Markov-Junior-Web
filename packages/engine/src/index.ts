export const ENGINE_VERSION = '0.1.0';

export { createRng } from './rng';
export type { Rng } from './rng';

export type {
  BranchNodeDef,
  ConvolutionNodeDef,
  ConvolutionRuleDef,
  FieldDef,
  PathNodeDef,
  Neighborhood,
  BranchNodeKind,
  NodeDef,
  NodePath,
  Program,
  RuleDef,
  RuleNodeDef,
  RuleNodeKind,
  UnionDef,
} from './program';
export { hasRules, isBranch, isConvolution, isPath, isRuleNode, nodeAt } from './program';
export { parseSum, MAX_SUM } from './convolution-sum';

export { ProgramError, formatIssue } from './errors';
export type { Issue } from './errors';

export { validateProgram } from './validate';
export { createRun } from './interpreter';
export type { Run, RunOptions, StepResult } from './interpreter';

export { programFromXml, programToXml, withLines, pathKey } from './xml';
export type { XmlParseResult } from './xml';

export { SQUARE_SUBGROUPS, SYMMETRY_NAMES } from './symmetry';
export { DEFAULT_SYMMETRY, effectiveSymmetry, ruleVariants } from './variants';
export { parsePattern } from './rule';
export { MAX_SYMBOLS } from './grid';
export { DEFAULT_PALETTE, FALLBACK_COLOR, colorOf } from './palette';
