import { useColor } from '../../hooks/usePalette';
import styles from './PatternView.module.css';

interface Props {
  pattern: string;
  /** Alphabet; any other character (union, `*`) is drawn as a labelled cell. */
  values: string;
  label?: string;
}

/** A rule pattern drawn as a small grid of coloured cells. */
export function PatternView({ pattern, values, label }: Props) {
  const color = useColor();
  const rows = pattern.split('/');
  const width = Math.max(...rows.map((r) => r.length));
  return (
    <span
      className={styles.grid}
      style={{ gridTemplateColumns: `repeat(${width}, var(--cell))` }}
      role="img"
      aria-label={label ?? pattern}
      title={pattern}
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) => {
          const key = `${x},${y}`;
          if (ch === '*') return <span key={key} className={`${styles.cell} ${styles.wildcard}`} />;
          if (values.includes(ch)) {
            return <span key={key} className={styles.cell} style={{ background: color(ch) }} />;
          }
          return (
            <span key={key} className={`${styles.cell} ${styles.union}`}>
              {ch}
            </span>
          );
        }),
      )}
    </span>
  );
}
