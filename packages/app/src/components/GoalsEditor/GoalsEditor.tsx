import { isRuleNode, nodeAt, type NodePath, type ObserveDef, type Program } from '@mj/engine';
import { describeObservation } from '../../editor/labels';
import {
  addObservation,
  removeObservation,
  scopedProgram,
  updateNode,
  updateObservation,
} from '../../editor/ops';
import { useColor } from '../../hooks/usePalette';
import { useApp } from '../../store/app';
import { NumberField } from '../NumberField/NumberField';
import styles from './GoalsEditor.module.css';

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

function GoalRow({
  program,
  path,
  goal,
  index,
}: {
  program: Program;
  path: NodePath;
  goal: ObserveDef;
  index: number;
}) {
  const edit = useApp((s) => s.edit);
  const update = (patch: Parameters<typeof updateObservation>[3]) =>
    edit((p) => updateObservation(p, path, index, patch));
  return (
    <li className={styles.goal} aria-label={`Goal ${index + 1}`}>
      <p className={styles.summary} data-testid="goal-summary">
        {describeObservation(goal)}
      </p>
      <div className={styles.row}>
        <span className={styles.label}>Cells of</span>
        <SymbolSet
          program={program}
          value={goal.value}
          single
          label="Observed"
          onChange={(v) => update({ value: v })}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>become now</span>
        <SymbolSet
          program={program}
          value={goal.from ?? goal.value}
          single
          label="Now"
          onChange={(v) => update({ from: v === goal.value ? undefined : v })}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>must end as</span>
        <SymbolSet
          program={program}
          value={goal.to}
          label="Goal"
          onChange={(v) => update({ to: v })}
        />
        <button
          type="button"
          className={styles.remove}
          aria-label={`Remove goal ${index + 1}`}
          onClick={() => edit((p) => removeObservation(p, path, index))}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

/** Goals (`observe`) and search settings of a one/all node. */
export function GoalsEditor({ program: fullProgram, path }: { program: Program; path: NodePath }) {
  const program = scopedProgram(fullProgram, path);
  const edit = useApp((s) => s.edit);
  const node = nodeAt(program.root, path);
  if (!node || !isRuleNode(node) || node.kind === 'prl') return null;
  const goals = node.observations ?? [];
  return (
    <div className={styles.root}>
      {goals.length === 0 && (
        <p className={styles.hint}>
          Goals say how the grid must end up. The node then steers towards them, or with search
          plans every step in advance. Every symbol that may change needs a goal.
        </p>
      )}
      <ul className={styles.list} aria-label="Goals">
        {goals.map((g, i) => (
          <GoalRow key={i} program={program} path={path} goal={g} index={i} />
        ))}
      </ul>
      <button
        type="button"
        className={styles.add}
        onClick={() => edit((p) => addObservation(p, path))}
      >
        + Add goal
      </button>
      {goals.length > 0 && (
        <>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={node.search ?? false}
              onChange={(e) =>
                edit((p) => updateNode(p, path, { search: e.target.checked || undefined }))
              }
            />
            Plan the whole route first (search)
          </label>
          {node.search && (
            <>
              <label className={styles.row}>
                <span className={styles.label}>State limit</span>
                <NumberField
                  label="State limit"
                  value={node.limit ?? 0}
                  min={0}
                  onCommit={(n) =>
                    edit((p) => updateNode(p, path, { limit: n > 0 ? Math.round(n) : undefined }))
                  }
                />
                <span className={styles.hint}>0 = no limit (capped)</span>
              </label>
              <label className={styles.row}>
                <span className={styles.label}>Depth weight</span>
                <NumberField
                  label="Depth weight"
                  value={node.depthCoefficient ?? 0.5}
                  onCommit={(n) =>
                    edit((p) =>
                      updateNode(p, path, { depthCoefficient: n === 0.5 ? undefined : n }),
                    )
                  }
                />
                <span className={styles.hint}>
                  higher = shorter solutions, negative = depth-first
                </span>
              </label>
              <p className={styles.hint}>Search can take a while; “Stop search” interrupts it.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
