import { useRef, useState } from 'react';
import {
  alphabetAt,
  isMap,
  nodeAt,
  parseScaleComponent,
  type NodePath,
  type Program,
} from '@mj/engine';
import {
  addMapRule,
  cellAt,
  moveMapRule,
  patternSize,
  removeMapRule,
  resizePattern,
  setCell,
  updateMap,
  updateMapRule,
} from '../../editor/ops';
import { MAX_PATTERN } from '../../editor/labels';
import { useApp } from '../../store/app';
import { PatternView } from '../PatternView/PatternView';
import { Brushes, PaintGrid } from '../RuleEditor/RuleEditor';
import styles from './MapEditor.module.css';

type Side = 'in' | 'out';

/** A text field that commits on blur/Enter and shows whether the value is valid. */
function CommitField({
  value,
  label,
  valid,
  onCommit,
  className,
}: {
  value: string;
  label: string;
  valid(text: string): boolean;
  onCommit(text: string): void;
  className?: string | undefined;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value;
  const ok = valid(text);
  const commit = () => {
    if (draft !== null && ok && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      className={className}
      aria-label={label}
      aria-invalid={!ok}
      value={text}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
    />
  );
}

function MapRuleEditor({
  program,
  path,
  index,
}: {
  program: Program;
  path: NodePath;
  index: number;
}) {
  const edit = useApp((s) => s.edit);
  const node = nodeAt(program.root, path);
  const outer = alphabetAt(program, path);
  const [inBrush, setInBrush] = useState(outer.values[0] ?? '*');
  const [outBrush, setOutBrush] = useState(
    node && isMap(node) ? (node.values[1] ?? node.values[0] ?? '*') : '*',
  );
  const strokeId = useRef(0);
  if (!node || !isMap(node)) return null;
  const rule = node.rules[index];
  if (!rule) return null;

  const outerView: Program = { ...program, values: outer.values, unions: [...outer.unions] };
  const innerView: Program = { ...program, values: node.values, unions: [] };

  const update = (patch: Parameters<typeof updateMapRule>[3], coalesce?: string) =>
    edit((p) => updateMapRule(p, path, index, patch), coalesce === undefined ? {} : { coalesce });

  const paint = (side: Side) => (x: number, y: number, erase: boolean) => {
    const ch = erase ? '*' : side === 'in' ? inBrush : outBrush;
    edit(
      (p) => {
        const n = nodeAt(p.root, path);
        const r = n && isMap(n) ? n.rules[index] : undefined;
        if (!r || cellAt(r[side], x, y) === ch) return p;
        return updateMapRule(p, path, index, { [side]: setCell(r[side], x, y, ch) });
      },
      { coalesce: `map-stroke-${strokeId.current}` },
    );
  };

  const sizeControls = (side: Side) => {
    const { w, h } = patternSize(rule[side]);
    const resize = (nw: number, nh: number) => {
      if (nw < 1 || nh < 1 || nw > MAX_PATTERN || nh > MAX_PATTERN) return;
      update({ [side]: resizePattern(rule[side], nw, nh) });
    };
    const name = side === 'in' ? 'input' : 'output';
    return (
      <span className={styles.size}>
        <button
          type="button"
          onClick={() => resize(w - 1, h)}
          disabled={w <= 1}
          aria-label={`Narrower ${name}`}
        >
          −
        </button>
        <span className={styles.num}>
          {w}×{h}
        </span>
        <button
          type="button"
          onClick={() => resize(w + 1, h)}
          disabled={w >= MAX_PATTERN}
          aria-label={`Wider ${name}`}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => resize(w, h - 1)}
          disabled={h <= 1}
          aria-label={`Shorter ${name}`}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => resize(w, h + 1)}
          disabled={h >= MAX_PATTERN}
          aria-label={`Taller ${name}`}
        >
          +
        </button>
      </span>
    );
  };

  return (
    <section className={styles.ruleEditor} aria-label="Map rule editor">
      <div className={styles.sides}>
        <figure className={styles.side}>
          <figcaption>Find (outside the map)</figcaption>
          <Brushes
            program={outerView}
            brush={inBrush}
            setBrush={setInBrush}
            label="Input brushes"
          />
          <PaintGrid
            pattern={rule.in}
            side="in"
            values={outer.values}
            onPaint={paint('in')}
            onStrokeStart={() => strokeId.current++}
          />
          {sizeControls('in')}
        </figure>
        <figure className={styles.side}>
          <figcaption>Draw (in the map)</figcaption>
          <Brushes
            program={innerView}
            brush={outBrush}
            setBrush={setOutBrush}
            label="Output brushes"
          />
          <PaintGrid
            pattern={rule.out}
            side="out"
            values={node.values}
            onPaint={paint('out')}
            onStrokeStart={() => strokeId.current++}
          />
          {sizeControls('out')}
        </figure>
      </div>
    </section>
  );
}

const validFactor = (text: string) => parseScaleComponent(text.trim()) !== null;

/** Scale, alphabet and translation rules of a map node. */
export function MapEditor({
  program,
  path,
  selectedRule,
}: {
  program: Program;
  path: NodePath;
  selectedRule: number | undefined;
}) {
  const edit = useApp((s) => s.edit);
  const select = useApp((s) => s.select);
  const node = nodeAt(program.root, path);
  if (!node || !isMap(node)) return null;
  const outer = alphabetAt(program, path).values;
  const [sx = '1', sy = '1', sz = '1'] = node.scale.trim().split(/\s+/);
  const setScale = (x: string, y: string) =>
    edit((p) => updateMap(p, path, { scale: `${x.trim()} ${y.trim()} ${sz}` }));

  return (
    <div className={styles.root}>
      <p className={styles.hint}>
        On its first step the map draws a new grid, {sx}× wide and {sy}× tall, in its own symbols.
        Its children then run on that grid, and the program ends after them.
      </p>
      <div className={styles.row}>
        <span className={styles.label}>Scale</span>
        <CommitField
          className={styles.factor}
          label="Width factor"
          value={sx}
          valid={validFactor}
          onCommit={(v) => setScale(v, sy)}
        />
        <span className={styles.muted}>×</span>
        <CommitField
          className={styles.factor}
          label="Height factor"
          value={sy}
          valid={validFactor}
          onCommit={(v) => setScale(sx, v)}
        />
        <span className={styles.muted}>e.g. 2 or 1/2</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Symbols</span>
        <CommitField
          className={styles.values}
          label="Map symbols"
          value={node.values}
          valid={(t) => t.length > 0 && new Set(t).size === t.length && !/[\s*/]/.test(t)}
          onCommit={(v) => edit((p) => updateMap(p, path, { values: v }))}
        />
        <PatternView pattern={node.values} values={node.values} />
      </div>

      <h3 className={styles.sectionTitle}>Translation rules</h3>
      {node.rules.length === 0 && (
        <p className={styles.hint}>
          Without rules the new grid is just filled with {node.values[0]}.
        </p>
      )}
      <ol className={styles.rules} aria-label="Map rules">
        {node.rules.map((rule, i) => (
          <li key={i} className={styles.ruleItem} data-selected={selectedRule === i || undefined}>
            <button
              type="button"
              className={styles.ruleSelect}
              aria-pressed={selectedRule === i}
              aria-label={`Edit map rule ${i + 1}: ${rule.in} to ${rule.out}`}
              onClick={() => select({ path, rule: i })}
            >
              <PatternView pattern={rule.in} values={outer} />
              <span aria-hidden>⇒</span>
              <PatternView pattern={rule.out} values={node.values} />
            </button>
            <span className={styles.ruleActions}>
              <button
                type="button"
                aria-label={`Move map rule ${i + 1} up`}
                disabled={i === 0}
                onClick={() =>
                  edit((p) => moveMapRule(p, path, i, i - 1), { select: { path, rule: i - 1 } })
                }
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move map rule ${i + 1} down`}
                disabled={i === node.rules.length - 1}
                onClick={() =>
                  edit((p) => moveMapRule(p, path, i, i + 1), { select: { path, rule: i + 1 } })
                }
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Delete map rule ${i + 1}`}
                onClick={() => edit((p) => removeMapRule(p, path, i), { select: { path } })}
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className={styles.add}
        onClick={() =>
          edit((p) => addMapRule(p, path), { select: { path, rule: node.rules.length } })
        }
      >
        + Add map rule
      </button>
      {selectedRule !== undefined && node.rules[selectedRule] && (
        <MapRuleEditor
          key={`${path.join('/')}#${selectedRule}`}
          program={program}
          path={path}
          index={selectedRule}
        />
      )}
    </div>
  );
}
