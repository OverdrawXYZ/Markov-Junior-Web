import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import {
  effectiveSymmetry,
  isRuleNode,
  nodeAt,
  ruleVariants,
  SYMMETRY_NAMES,
  type NodePath,
  type Program,
  type RuleDef,
} from '@mj/engine';
import { cellAt, patternSize, resizePattern, setCell, updateRule } from '../../editor/ops';
import { useColor } from '../../hooks/usePalette';
import { MAX_PATTERN, SYMMETRY_LABELS } from '../../editor/labels';
import { useApp } from '../../store/app';
import { PatternView } from '../PatternView/PatternView';
import styles from './RuleEditor.module.css';

type Side = 'in' | 'out';
type RulePatch = Parameters<typeof updateRule>[3];

interface GridProps {
  pattern: string;
  side: Side;
  values: string;
  onPaint(x: number, y: number, erase: boolean): void;
  onStrokeStart(): void;
}

/** A pattern you can paint by clicking or dragging. Right-click paints `*`. */
function PaintGrid({ pattern, side, values, onPaint, onStrokeStart }: GridProps) {
  const color = useColor();
  const { w, h } = patternSize(pattern);
  const stroke = useRef<{ last: string; erase: boolean } | null>(null);

  const cellFromEvent = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * w);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * h);
    return x >= 0 && y >= 0 && x < w && y < h ? { x, y } : null;
  };

  const paintAt = (e: PointerEvent<HTMLDivElement>) => {
    const cell = cellFromEvent(e);
    if (!cell || !stroke.current) return;
    const key = `${cell.x},${cell.y}`;
    if (key === stroke.current.last) return;
    stroke.current.last = key;
    onPaint(cell.x, cell.y, stroke.current.erase);
  };

  return (
    <div
      className={styles.grid}
      role="grid"
      aria-label={side === 'in' ? 'Input pattern' : 'Output pattern'}
      style={{ gridTemplateColumns: `repeat(${w}, var(--cell))` }}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.button !== 2) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        onStrokeStart();
        stroke.current = { last: '', erase: e.button === 2 || e.altKey };
        paintAt(e);
      }}
      onPointerMove={(e) => stroke.current && paintAt(e)}
      onPointerUp={() => (stroke.current = null)}
      onPointerCancel={() => (stroke.current = null)}
      onContextMenu={(e: MouseEvent) => e.preventDefault()}
    >
      {Array.from({ length: h }, (_, y) => (
        <div key={y} role="row" className={styles.gridRow}>
          {Array.from({ length: w }, (_, x) => {
            const ch = cellAt(pattern, x, y) ?? '*';
            const isValue = values.includes(ch);
            return (
              <button
                key={x}
                type="button"
                role="gridcell"
                tabIndex={-1}
                className={styles.cell}
                data-wildcard={ch === '*' || undefined}
                style={isValue ? { background: color(ch) } : undefined}
                aria-label={`${side === 'in' ? 'input' : 'output'} ${x},${y}: ${ch}`}
                // Pointer painting is handled by the grid; this covers keyboard activation.
                onClick={(e) => {
                  if (e.detail !== 0) return;
                  onStrokeStart();
                  onPaint(x, y, false);
                }}
              >
                {!isValue && ch !== '*' ? ch : ''}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Brushes({
  program,
  brush,
  setBrush,
}: {
  program: Program;
  brush: string;
  setBrush(b: string): void;
}) {
  const color = useColor();
  const unions = program.unions ?? [];
  const item = (ch: string, label: string, style?: CSSProperties, inputOnly = false) => (
    <button
      key={ch}
      type="button"
      className={styles.brush}
      aria-pressed={brush === ch}
      aria-label={`Brush ${label}`}
      title={inputOnly ? `${label} (inputs only)` : label}
      onClick={() => setBrush(ch)}
    >
      <span className={styles.brushSwatch} style={style} data-wildcard={ch === '*' || undefined}>
        {style ? '' : ch === '*' ? '' : ch}
      </span>
      {ch}
    </button>
  );
  return (
    <div className={styles.brushes} role="toolbar" aria-label="Brushes">
      {[...program.values].map((ch) => item(ch, ch, { background: color(ch) }))}
      {unions.map((u) => item(u.symbol, `${u.symbol} = ${u.values}`, undefined, true))}
      {item('*', '* (any / unchanged)')}
    </div>
  );
}

interface Props {
  program: Program;
  path: NodePath;
  index: number;
}

/** Visual editor for one rule: paint input and output, resize, symmetry, probability. */
export function RuleEditor({ program, path, index }: Props) {
  const edit = useApp((s) => s.edit);
  const node = nodeAt(program.root, path);
  const rule = node && isRuleNode(node) ? node.rules[index] : undefined;
  const [brushChoice, setBrush] = useState(program.values[1] ?? program.values[0] ?? '*');
  const strokeId = useRef(0);
  if (!node || !isRuleNode(node) || !rule) return null;

  const isUnion = (ch: string) => (program.unions ?? []).some((u) => u.symbol === ch);
  const brush =
    brushChoice === '*' || program.values.includes(brushChoice) || isUnion(brushChoice)
      ? brushChoice
      : '*';
  const { w, h } = patternSize(rule.in);
  const inherited = effectiveSymmetry(program, path);
  const effective = rule.symmetry ?? inherited;
  const variants = ruleVariants(rule, effective);
  const key = `${path.join('/')}#${index}`;

  const update = (patch: (r: RuleDef) => RulePatch | null, coalesce?: string) =>
    edit(
      (p) => {
        const n = nodeAt(p.root, path);
        const r = n && isRuleNode(n) ? n.rules[index] : undefined;
        const changes = r && patch(r);
        return changes ? updateRule(p, path, index, changes) : p;
      },
      coalesce === undefined ? {} : { coalesce },
    );

  const paint = (side: Side) => (x: number, y: number, erase: boolean) => {
    const ch = erase ? '*' : brush;
    if (side === 'out' && isUnion(ch)) return;
    update(
      (r) => (cellAt(r[side], x, y) === ch ? null : { [side]: setCell(r[side], x, y, ch) }),
      `stroke-${strokeId.current}`,
    );
  };

  const resize = (nw: number, nh: number) => {
    if (nw < 1 || nh < 1 || nw > MAX_PATTERN || nh > MAX_PATTERN) return;
    update((r) => ({ in: resizePattern(r.in, nw, nh), out: resizePattern(r.out, nw, nh) }));
  };

  const showP = node.kind === 'prl' || rule.p !== undefined;

  return (
    <section className={styles.root} aria-label="Rule editor">
      <Brushes program={program} brush={brush} setBrush={setBrush} />
      <p className={styles.hint}>Click or drag to paint · right-click paints * </p>
      <div className={styles.patterns}>
        <figure className={styles.side}>
          <figcaption>Find</figcaption>
          <PaintGrid
            pattern={rule.in}
            side="in"
            values={program.values}
            onPaint={paint('in')}
            onStrokeStart={() => strokeId.current++}
          />
        </figure>
        <span className={styles.arrow} aria-hidden>
          →
        </span>
        <figure className={styles.side}>
          <figcaption>Replace with</figcaption>
          <PaintGrid
            pattern={rule.out}
            side="out"
            values={program.values}
            onPaint={paint('out')}
            onStrokeStart={() => strokeId.current++}
          />
        </figure>
      </div>

      <div className={styles.controls}>
        <span className={styles.size}>
          <span className={styles.label}>Width</span>
          <button
            type="button"
            onClick={() => resize(w - 1, h)}
            disabled={w <= 1}
            aria-label="Narrower"
          >
            −
          </button>
          <span className={styles.num}>{w}</span>
          <button
            type="button"
            onClick={() => resize(w + 1, h)}
            disabled={w >= MAX_PATTERN}
            aria-label="Wider"
          >
            +
          </button>
        </span>
        <span className={styles.size}>
          <span className={styles.label}>Height</span>
          <button
            type="button"
            onClick={() => resize(w, h - 1)}
            disabled={h <= 1}
            aria-label="Shorter"
          >
            −
          </button>
          <span className={styles.num}>{h}</span>
          <button
            type="button"
            onClick={() => resize(w, h + 1)}
            disabled={h >= MAX_PATTERN}
            aria-label="Taller"
          >
            +
          </button>
        </span>
        <button
          type="button"
          onClick={() =>
            update((r) => {
              // Unions can't appear in outputs; they become "unchanged".
              const out = [...r.in].map((c) => (isUnion(c) ? '*' : c)).join('');
              return out === r.out ? null : { out };
            })
          }
          title="Copy the input pattern into the output"
        >
          Copy input → output
        </button>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Symmetry</span>
        <select
          value={rule.symmetry ?? ''}
          onChange={(e) => update(() => ({ symmetry: e.target.value || undefined }))}
        >
          <option value="">Inherit — {SYMMETRY_LABELS[inherited] ?? inherited}</option>
          {SYMMETRY_NAMES.map((name) => (
            <option key={name} value={name}>
              {name} {SYMMETRY_LABELS[name]}
            </option>
          ))}
        </select>
      </label>

      {showP && (
        <label className={styles.field}>
          <span className={styles.label}>Probability</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={rule.p ?? 1}
            aria-label="Probability"
            onChange={(e) => update(() => ({ p: Number(e.target.value) }), `p-${key}`)}
          />
          <span className={styles.num}>{(rule.p ?? 1).toFixed(2)}</span>
          {rule.p !== undefined && (
            <button
              type="button"
              onClick={() => update(() => ({ p: undefined }))}
              title="Back to the default (1)"
            >
              ↺
            </button>
          )}
        </label>
      )}

      <div className={styles.variants}>
        <span className={styles.label}>
          Applies as {variants.length} variant{variants.length === 1 ? '' : 's'}
        </span>
        <ul className={styles.variantList} aria-label="Symmetry variants">
          {variants.map((v, i) => (
            <li key={i} className={styles.variant}>
              <PatternView pattern={v.in} values={program.values} />
              <span className={styles.arrow} aria-hidden>
                →
              </span>
              <PatternView pattern={v.out} values={program.values} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
