import { useState } from 'react';
import { isConvolution, nodeAt, parseSum, type NodePath, type Program } from '@mj/engine';
import { describeConvolutionRule } from '../../editor/labels';
import { scopedProgram, updateRule } from '../../editor/ops';
import { useColor } from '../../hooks/usePalette';
import { useApp } from '../../store/app';
import styles from './ConvolutionEditor.module.css';

type Patch = Parameters<typeof updateRule>[3];

function SymbolPicker({
  program,
  value,
  onPick,
  label,
}: {
  program: Program;
  value: string;
  onPick(ch: string): void;
  label: string;
}) {
  const color = useColor();
  return (
    <span className={styles.picker} role="radiogroup" aria-label={label}>
      {[...program.values].map((ch) => (
        <button
          key={ch}
          type="button"
          role="radio"
          aria-checked={value === ch}
          aria-label={`${label} ${ch}`}
          className={styles.symbol}
          onClick={() => onPick(ch)}
        >
          <span style={{ background: color(ch) }} />
          {ch}
        </button>
      ))}
    </span>
  );
}

interface Props {
  program: Program;
  path: NodePath;
  index: number;
}

export function ConvolutionEditor({ program: fullProgram, path, index }: Props) {
  const program = scopedProgram(fullProgram, path);
  const edit = useApp((s) => s.edit);
  const color = useColor();
  const node = nodeAt(program.root, path);
  const rule = node && isConvolution(node) ? node.rules[index] : undefined;
  const [sumDraft, setSumDraft] = useState<string | null>(null);
  if (!node || !isConvolution(node) || !rule) return null;

  const key = `${path.join('/')}#${index}`;
  const neighbours = node.neighborhood === 'Moore' ? 8 : 4;
  const update = (patch: Patch, coalesce?: string) =>
    edit((p) => updateRule(p, path, index, patch), coalesce === undefined ? {} : { coalesce });

  const conditional = rule.values !== undefined;
  const sumText = sumDraft ?? rule.sum ?? '';
  const sumError = conditional
    ? (() => {
        const parsed = parseSum(sumText);
        return typeof parsed === 'string' ? parsed : null;
      })()
    : null;

  return (
    <section className={styles.root} aria-label="Convolution rule editor">
      <p className={styles.summary} data-testid="rule-summary">
        {describeConvolutionRule(rule, neighbours)}
      </p>

      <div className={styles.field}>
        <span className={styles.label}>When a cell is</span>
        <SymbolPicker
          program={program}
          value={rule.in}
          label="Input"
          onPick={(ch) => update({ in: ch })}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>it becomes</span>
        <SymbolPicker
          program={program}
          value={rule.out}
          label="Output"
          onPick={(ch) => update({ out: ch })}
        />
      </div>

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={conditional}
          onChange={(e) =>
            update(
              e.target.checked
                ? { values: program.values[1] ?? program.values[0] ?? '', sum: '1..8' }
                : { values: undefined, sum: undefined },
            )
          }
        />
        Only depending on its neighbours
      </label>

      {conditional && (
        <>
          <div className={styles.field}>
            <span className={styles.label}>Count</span>
            <span className={styles.members} role="group" aria-label="Counted symbols">
              {[...program.values].map((ch) => {
                const on = rule.values!.includes(ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    className={styles.member}
                    aria-pressed={on}
                    aria-label={`Count ${ch}`}
                    style={{ background: color(ch) }}
                    onClick={() => {
                      const next = [...program.values]
                        .filter((c) => (c === ch ? !on : rule.values!.includes(c)))
                        .join('');
                      if (next) update({ values: next });
                    }}
                  >
                    {ch}
                  </button>
                );
              })}
            </span>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>Totals</span>
            <input
              className={styles.sum}
              aria-label="Neighbour totals"
              aria-invalid={sumError !== null}
              value={sumText}
              placeholder="e.g. 3 or 0,1,4..8"
              onChange={(e) => {
                const text = e.target.value;
                setSumDraft(text);
                if (typeof parseSum(text) !== 'string') update({ sum: text }, `sum-${key}`);
              }}
              onBlur={() => setSumDraft(null)}
            />
            <span className={styles.muted}>of {neighbours}</span>
          </label>
          {sumError && <p className={styles.error}>{sumError}</p>}
        </>
      )}

      <label className={styles.field}>
        <span className={styles.label}>Probability</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={rule.p ?? 1}
          aria-label="Probability"
          onChange={(e) =>
            update(
              { p: Number(e.target.value) === 1 ? undefined : Number(e.target.value) },
              `p-${key}`,
            )
          }
        />
        <span className={styles.num}>{(rule.p ?? 1).toFixed(2)}</span>
      </label>
    </section>
  );
}
