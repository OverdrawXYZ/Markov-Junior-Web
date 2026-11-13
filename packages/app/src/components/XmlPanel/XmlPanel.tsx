import { useRef } from 'react';
import { formatIssue, type Issue } from '@mj/engine';
import { useApp } from '../../store/app';
import styles from './XmlPanel.module.css';

/** Select line `line` (1-based) in a textarea and scroll it into view. */
function selectLine(el: HTMLTextAreaElement, line: number): void {
  const lines = el.value.split('\n');
  const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
  const end = start + (lines[line - 1]?.length ?? 0);
  el.focus();
  el.setSelectionRange(start, end);
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 18;
  el.scrollTop = Math.max(0, (line - 3) * lineHeight);
}

function IssueList({
  issues,
  kind,
  onSelect,
}: {
  issues: Issue[];
  kind: 'error' | 'warning';
  onSelect(line: number): void;
}) {
  if (issues.length === 0) return null;
  return (
    <ul
      className={styles.issues}
      data-kind={kind}
      aria-label={kind === 'error' ? 'Errors' : 'Warnings'}
    >
      {issues.map((issue, i) => (
        <li key={i}>
          {issue.line !== undefined ? (
            <button type="button" className={styles.issue} onClick={() => onSelect(issue.line!)}>
              {formatIssue(issue)}
            </button>
          ) : (
            <span className={styles.issue}>{formatIssue(issue)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function XmlPanel() {
  const source = useApp((s) => s.source);
  const parseErrors = useApp((s) => s.parseErrors);
  const validationIssues = useApp((s) => s.issues);
  const issues = parseErrors.length > 0 ? parseErrors : validationIssues;
  const warnings = useApp((s) => s.warnings);
  const setSource = useApp((s) => s.setSource);
  const ref = useRef<HTMLTextAreaElement>(null);
  const onSelect = (line: number) => ref.current && selectLine(ref.current, line);

  return (
    <div className={styles.root}>
      <textarea
        ref={ref}
        className={styles.editor}
        aria-label="Program XML"
        aria-invalid={issues.length > 0}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      />
      <IssueList issues={issues} kind="error" onSelect={onSelect} />
      <IssueList issues={warnings} kind="warning" onSelect={onSelect} />
      {issues.length > 0 && (
        <p className={styles.hint}>
          {parseErrors.length > 0
            ? 'The visual editor shows the last version that parsed. Editing there replaces this text.'
            : 'The preview keeps running the last valid version.'}
        </p>
      )}
    </div>
  );
}
