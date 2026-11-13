import { isBranch, type NodeDef, type NodePath } from '@mj/engine';
import { useApp } from '../../store/app';
import { PatternView } from '../PatternView/PatternView';
import styles from './ProgramOutline.module.css';

const KIND_HINT: Record<NodeDef['kind'], string> = {
  one: 'apply one random match per step',
  all: 'apply all non-overlapping matches per step',
  prl: 'apply every match independently per step',
  markov: 'run the first child that can still progress',
  sequence: 'run children in order, each until done',
};

function NodeRow({
  node,
  path,
  active,
  values,
}: {
  node: NodeDef;
  path: NodePath;
  active: string | null;
  values: string;
}) {
  const key = path.join('/');
  const isActive =
    active !== null && (active === key || active.startsWith(key === '' ? '' : `${key}/`));
  const isCurrent = active === key;
  return (
    <li className={styles.node}>
      <div
        className={styles.row}
        data-active={isActive || undefined}
        data-current={isCurrent || undefined}
        aria-current={isCurrent ? 'step' : undefined}
      >
        <span className={styles.kind} data-kind={node.kind} title={KIND_HINT[node.kind]}>
          {node.kind}
        </span>
        {node.comment && <span className={styles.comment}>{node.comment}</span>}
        {!isBranch(node) && node.steps ? <span className={styles.meta}>×{node.steps}</span> : null}
        {node.symmetry && <span className={styles.meta}>{node.symmetry}</span>}
      </div>
      {isBranch(node) ? (
        node.children.length > 0 && (
          <ul className={styles.children}>
            {node.children.map((child, i) => (
              <NodeRow key={i} node={child} path={[...path, i]} active={active} values={values} />
            ))}
          </ul>
        )
      ) : (
        <ul className={styles.rules}>
          {node.rules.map((rule, i) => (
            <li key={i} className={styles.rule}>
              <PatternView pattern={rule.in} values={values} label={`input ${rule.in}`} />
              <span className={styles.arrow} aria-hidden>
                →
              </span>
              <PatternView pattern={rule.out} values={values} label={`output ${rule.out}`} />
              {rule.p !== undefined && <span className={styles.meta}>p={rule.p}</span>}
              {rule.symmetry && <span className={styles.meta}>{rule.symmetry}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Read-only view of the program tree. Highlights the node that ran last. */
export function ProgramOutline() {
  const program = useApp((s) => s.program);
  const active = useApp((s) => (s.activeNodePath ? s.activeNodePath.join('/') : null));
  if (!program) return <p className={styles.empty}>No valid program loaded.</p>;
  return (
    <div>
      <div className={styles.values} aria-label="Symbols">
        {[...program.values].map((ch, i) => (
          <span key={ch} className={styles.symbol} title={i === 0 ? `${ch} (initial fill)` : ch}>
            <PatternView pattern={ch} values={program.values} />
            {ch}
          </span>
        ))}
      </div>
      <ul className={styles.tree} aria-label="Program tree">
        <NodeRow node={program.root} path={[]} active={active} values={program.values} />
      </ul>
    </div>
  );
}
