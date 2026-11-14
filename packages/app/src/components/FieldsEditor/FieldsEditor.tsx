import { isRuleNode, nodeAt, type FieldDef, type NodePath, type Program } from '@mj/engine';
import { describeField } from '../../editor/labels';
import { addField, removeField, scopedProgram, updateField, updateNode } from '../../editor/ops';
import { useColor } from '../../hooks/usePalette';
import { useApp } from '../../store/app';
import styles from './FieldsEditor.module.css';

/** Toggle buttons choosing a set of symbols (in alphabet order). */
function SymbolSet({
  program,
  value,
  onChange,
  label,
  single,
}: {
  program: Program;
  value: string;
  onChange(next: string): void;
  label: string;
  single?: boolean;
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

function FieldRow({
  program,
  path,
  field,
  index,
}: {
  program: Program;
  path: NodePath;
  field: FieldDef;
  index: number;
}) {
  const edit = useApp((s) => s.edit);
  const update = (patch: Parameters<typeof updateField>[3]) =>
    edit((p) => updateField(p, path, index, patch));
  const away = field.from !== undefined;
  const target = field.from ?? field.to ?? '';
  return (
    <li className={styles.field} aria-label={`Field ${index + 1}`}>
      <p className={styles.summary} data-testid="field-summary">
        {describeField(field)}
      </p>
      <div className={styles.row}>
        <span className={styles.label}>Guide</span>
        <SymbolSet
          program={program}
          value={field.for}
          single
          label="Guide"
          onChange={(ch) => update({ for: ch })}
        />
      </div>
      <div className={styles.row}>
        <select
          className={styles.direction}
          aria-label="Direction"
          value={away ? 'from' : 'to'}
          onChange={(e) => update(e.target.value === 'from' ? { from: target } : { to: target })}
        >
          <option value="to">towards</option>
          <option value="from">away from</option>
        </select>
        <SymbolSet
          program={program}
          value={target}
          label="Target"
          onChange={(next) => update(away ? { from: next } : { to: next })}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>through</span>
        <SymbolSet
          program={program}
          value={field.on}
          label="Through"
          onChange={(next) => update({ on: next })}
        />
      </div>
      <div className={styles.row}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={field.recompute ?? false}
            onChange={(e) => update({ recompute: e.target.checked })}
          />
          Recompute every step
        </label>
        <label className={styles.check} title="Stop this node if the field can't be computed">
          <input
            type="checkbox"
            checked={field.essential ?? false}
            onChange={(e) => update({ essential: e.target.checked })}
          />
          Required
        </label>
        <button
          type="button"
          className={styles.remove}
          aria-label={`Remove field ${index + 1}`}
          onClick={() => edit((p) => removeField(p, path, index))}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

/** Fields and temperature of a one/all node. */
export function FieldsEditor({ program: fullProgram, path }: { program: Program; path: NodePath }) {
  const program = scopedProgram(fullProgram, path);
  const edit = useApp((s) => s.edit);
  const node = nodeAt(program.root, path);
  if (!node || !isRuleNode(node) || node.kind === 'prl') return null;
  const fields = node.fields ?? [];
  const key = path.join('/');
  return (
    <div className={styles.root}>
      {fields.length === 0 && (
        <p className={styles.hint}>
          Fields steer where this node writes: prefer matches that move a symbol towards (or away
          from) others.
        </p>
      )}
      <ul className={styles.list} aria-label="Fields">
        {fields.map((f, i) => (
          <FieldRow key={i} program={program} path={path} field={f} index={i} />
        ))}
      </ul>
      <button type="button" className={styles.add} onClick={() => edit((p) => addField(p, path))}>
        + Add field
      </button>
      {fields.length > 0 && (
        <label className={styles.row}>
          <span className={styles.label}>Temperature</span>
          <input
            type="range"
            min={0}
            max={50}
            step={0.5}
            value={node.temperature ?? 0}
            aria-label="Temperature"
            onChange={(e) =>
              edit(
                (p) => updateNode(p, path, { temperature: Number(e.target.value) || undefined }),
                {
                  coalesce: `temperature-${key}`,
                },
              )
            }
          />
          <span className={styles.num}>{node.temperature ?? 0}</span>
        </label>
      )}
      {fields.length > 0 && (
        <p className={styles.hint}>0 always takes the best match; higher is more random.</p>
      )}
    </div>
  );
}
