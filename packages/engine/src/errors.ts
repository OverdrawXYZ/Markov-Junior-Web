import type { NodePath } from './program';

export interface Issue {
  message: string;
  /** Path to the node the issue belongs to, if known. */
  path?: NodePath;
  /** Index of the rule within that node, if the issue is about a rule. */
  rule?: number;
  /** 1-based source line, when the issue came from XML. */
  line?: number;
}

/** Thrown when a program cannot be parsed or compiled. Carries every issue found. */
export class ProgramError extends Error {
  readonly issues: readonly Issue[];

  constructor(issues: readonly Issue[]) {
    super(issues.map(formatIssue).join('\n'));
    this.name = 'ProgramError';
    this.issues = issues;
  }
}

export function formatIssue(issue: Issue): string {
  const where: string[] = [];
  if (issue.line !== undefined) where.push(`line ${issue.line}`);
  if (issue.path !== undefined) where.push(`node [${issue.path.join(', ')}]`);
  if (issue.rule !== undefined) where.push(`rule ${issue.rule}`);
  return where.length ? `${issue.message} (${where.join(', ')})` : issue.message;
}
