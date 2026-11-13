import { useState, type FormEvent } from 'react';
import { DEFAULT_PALETTE, type Program } from '@mj/engine';
import { useColor } from '../../hooks/usePalette';
import {
  addSymbol,
  addUnion,
  isReservedChar,
  moveSymbol,
  removeSymbol,
  removeUnion,
  renameSymbol,
  setOrigin,
  setUnionValues,
  symbolUsage,
} from '../../editor/ops';
import { useApp } from '../../store/app';
import styles from './PalettePanel.module.css';

const parseHex = (value: string) => parseInt(value.slice(1), 16);

function SymbolRow({ program, ch, index }: { program: Program; ch: string; index: number }) {
  const edit = useApp((s) => s.edit);
  const setPaletteColor = useApp((s) => s.setPaletteColor);
  const overridden = useApp((s) => s.palette[ch] !== undefined);
  const color = useColor();
  const [renaming, setRenaming] = useState<string | null>(null);
  const usage = symbolUsage(program, ch);
  const role =
    index === 0 ? 'fills the grid' : index === 1 && program.origin ? 'origin seed' : null;

  const commitRename = () => {
    if (renaming && renaming !== ch && !isReservedChar(program, renaming)) {
      edit((p) => renameSymbol(p, ch, renaming));
    }
    setRenaming(null);
  };

  return (
    <li className={styles.row}>
      <label className={styles.swatch} style={{ background: color(ch) }} title={`Colour of ${ch}`}>
        <input
          type="color"
          aria-label={`Colour of ${ch}`}
          value={color(ch)}
          onChange={(e) => setPaletteColor(ch, parseHex(e.target.value))}
        />
      </label>
      {renaming !== null ? (
        <input
          className={styles.rename}
          aria-label={`Rename ${ch}`}
          value={renaming}
          maxLength={1}
          autoFocus
          onChange={(e) => setRenaming(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setRenaming(null);
          }}
        />
      ) : (
        <button
          type="button"
          className={styles.letter}
          onClick={() => setRenaming(ch)}
          title="Rename everywhere"
        >
          {ch}
        </button>
      )}
      <span className={styles.meta}>
        {role && <span className={styles.role}>{role}</span>}
        {usage > 0 ? `${usage} use${usage === 1 ? '' : 's'}` : 'unused'}
      </span>
      <span className={styles.actions}>
        {overridden && (
          <button
            type="button"
            onClick={() => setPaletteColor(ch, null)}
            title="Reset colour"
            aria-label={`Reset colour of ${ch}`}
          >
            ↺
          </button>
        )}
        <button
          type="button"
          onClick={() => edit((p) => moveSymbol(p, ch, -1))}
          disabled={index === 0}
          aria-label={`Move ${ch} earlier`}
          title="Move earlier (the first symbol fills the grid)"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => edit((p) => moveSymbol(p, ch, 1))}
          disabled={index === program.values.length - 1}
          aria-label={`Move ${ch} later`}
          title="Move later"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={() => edit((p) => removeSymbol(p, ch))}
          disabled={usage > 0 || program.values.length === 1}
          aria-label={`Remove ${ch}`}
          title={usage > 0 ? 'In use — remove it from rules first' : 'Remove'}
        >
          ×
        </button>
      </span>
    </li>
  );
}

function AddSymbol({ program }: { program: Program }) {
  const edit = useApp((s) => s.edit);
  const color = useColor();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const suggestions = Object.keys(DEFAULT_PALETTE).filter((c) => !isReservedChar(program, c));

  const add = (ch: string) => {
    edit((p) => addSymbol(p, ch));
    setOpen(false);
    setCustom('');
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isReservedChar(program, custom)) add(custom);
  };

  if (!open) {
    return (
      <button type="button" className={styles.add} onClick={() => setOpen(true)}>
        + Add symbol
      </button>
    );
  }
  return (
    <div className={styles.picker} role="dialog" aria-label="Add symbol">
      <div className={styles.suggestions}>
        {suggestions.map((c) => (
          <button
            key={c}
            type="button"
            className={styles.suggestion}
            onClick={() => add(c)}
            aria-label={`Add ${c}`}
            title={c}
          >
            <span style={{ background: color(c) }} />
            {c}
          </button>
        ))}
      </div>
      <form className={styles.custom} onSubmit={onSubmit}>
        <input
          aria-label="Custom symbol"
          placeholder="Other…"
          value={custom}
          maxLength={1}
          onChange={(e) => setCustom(e.target.value)}
        />
        <button type="submit" disabled={isReservedChar(program, custom)}>
          Add
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </form>
    </div>
  );
}

function Unions({ program }: { program: Program }) {
  const edit = useApp((s) => s.edit);
  const color = useColor();
  const unions = program.unions ?? [];
  return (
    <div className={styles.unions}>
      <h3 className={styles.subTitle}>Unions</h3>
      {unions.length === 0 && (
        <p className={styles.hint}>
          A union is one character that matches several symbols in rule inputs.
        </p>
      )}
      <ul className={styles.list}>
        {unions.map((u, i) => (
          <li key={u.symbol} className={styles.row}>
            <span className={styles.unionSymbol}>{u.symbol}</span>
            <span className={styles.equals}>=</span>
            <span className={styles.members}>
              {[...program.values].map((ch) => {
                const on = u.values.includes(ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    className={styles.member}
                    aria-pressed={on}
                    aria-label={`${u.symbol} matches ${ch}`}
                    style={{ background: color(ch) }}
                    onClick={() =>
                      edit((p) =>
                        setUnionValues(
                          p,
                          i,
                          on
                            ? u.values.replace(ch, '')
                            : [...p.values]
                                .filter((c) => c === ch || u.values.includes(c))
                                .join(''),
                        ),
                      )
                    }
                  >
                    {ch}
                  </button>
                );
              })}
            </span>
            <span className={styles.actions}>
              <button
                type="button"
                onClick={() => edit((p) => removeUnion(p, i))}
                aria-label={`Remove union ${u.symbol}`}
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className={styles.add} onClick={() => edit((p) => addUnion(p))}>
        + Add union
      </button>
    </div>
  );
}

/** Alphabet, colours, unions and the origin setting. */
export function PalettePanel() {
  const program = useApp((s) => s.program);
  const edit = useApp((s) => s.edit);
  if (!program) return null;
  return (
    <section className={styles.root} aria-label="Symbols">
      <ul className={styles.list}>
        {[...program.values].map((ch, i) => (
          <SymbolRow key={ch} program={program} ch={ch} index={i} />
        ))}
      </ul>
      <AddSymbol program={program} />
      <label className={styles.origin}>
        <input
          type="checkbox"
          checked={program.origin ?? false}
          disabled={program.values.length < 2}
          onChange={(e) => edit((p) => setOrigin(p, e.target.checked))}
        />
        Seed the centre with <b className={styles.mono}>{program.values[1] ?? '—'}</b>
      </label>
      <Unions program={program} />
    </section>
  );
}
