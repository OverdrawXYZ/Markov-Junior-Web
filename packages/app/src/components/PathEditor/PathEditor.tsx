import { isPath, nodeAt, type NodePath, type Program } from '@mj/engine';
import { describePath } from '../../editor/labels';
import { scopedProgram, updatePath } from '../../editor/ops';
import { useColor } from '../../hooks/usePalette';
import { useApp } from '../../store/app';
import styles from './PathEditor.module.css';

function SymbolSet({
  program,
  value,
  label,
  single,
  onChange,
}: {
  program: Program;
  value: string;
  label: string;
  single?: boolean;
  onChange(next: string): void;
}) {
  const color = useColor();
  return (
    <span className={styles.set} role="group" aria-label={label}>
      {[...program.values].map((ch) => {
        const on = value.includes(ch);
        return (
          <button
            key={ch}
            type="button"
            className={styles.member}
            aria-pressed={on}
            aria-label={`${label} ${ch}`}
            style={{ background: color(ch) }}
            onClick={() => {
              if (single) return onChange(ch);
              const next = [...program.values]
                .filter((c) => (c === ch ? !on : value.includes(c)))
                .join('');
              if (next) onChange(next);
            }}
          >
            {ch}
          </button>
        );
      })}
    </span>
  );
}

/** Settings of a path node. */
export function PathEditor({ program: fullProgram, path }: { program: Program; path: NodePath }) {
  const program = scopedProgram(fullProgram, path);
  const edit = useApp((s) => s.edit);
  const node = nodeAt(program.root, path);
  if (!node || !isPath(node)) return null;
  const update = (patch: Parameters<typeof updatePath>[2]) =>
    edit((p) => updatePath(p, path, patch));
  const color = node.color ?? node.from[0] ?? '';

  const flags = [
    ['longest', 'Start from the farthest'],
    ['inertia', 'Prefer going straight'],
    ['edges', 'Allow diagonal steps'],
  ] as const;

  return (
    <div className={styles.root}>
      <p className={styles.summary} data-testid="path-summary">
        {describePath(node)}
      </p>
      <div className={styles.row}>
        <span className={styles.label}>From</span>
        <SymbolSet
          program={program}
          value={node.from}
          label="From"
          onChange={(v) => update({ from: v })}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>To</span>
        <SymbolSet
          program={program}
          value={node.to}
          label="To"
          onChange={(v) => update({ to: v })}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Through</span>
        <SymbolSet
          program={program}
          value={node.on}
          label="Through"
          onChange={(v) => update({ on: v })}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Paint with</span>
        <SymbolSet
          program={program}
          value={color}
          single
          label="Paint"
          onChange={(v) => update({ color: v === node.from[0] ? undefined : v })}
        />
      </div>
      {flags.map(([key, text]) => (
        <label key={key} className={styles.check}>
          <input
            type="checkbox"
            checked={node[key] ?? false}
            onChange={(e) => update({ [key]: e.target.checked })}
          />
          {text}
        </label>
      ))}
    </div>
  );
}
