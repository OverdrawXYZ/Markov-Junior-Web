import {
  DEFAULT_SYMMETRY,
  effectiveSymmetry,
  isBranch,
  isConvolution,
  isRuleNode,
  nodeAt,
  type Neighborhood,
  SYMMETRY_NAMES,
  type NodeDef,
  type NodePath,
  type Program,
} from '@mj/engine';
import {
  addRule,
  duplicateNode,
  duplicateRule,
  kindFamily,
  moveNode,
  moveRule,
  parentOf,
  removeNode,
  removeRule,
  setKind,
  unwrapNode,
  updateNode,
  wrapNode,
} from '../../editor/ops';
import { KIND_HINT, SYMMETRY_LABELS } from '../../editor/labels';
import { useApp } from '../../store/app';
import { NumberField } from '../NumberField/NumberField';
import { PatternView } from '../PatternView/PatternView';
import { ConvolutionEditor } from '../ConvolutionEditor/ConvolutionEditor';
import { RuleEditor } from '../RuleEditor/RuleEditor';
import styles from './Inspector.module.css';

function NodeActions({ program, path, node }: { program: Program; path: NodePath; node: NodeDef }) {
  const edit = useApp((s) => s.edit);
  const isRoot = path.length === 0;
  const index = path[path.length - 1] ?? 0;
  const parent = isRoot ? undefined : nodeAt(program.root, parentOf(path));
  const siblings = parent && isBranch(parent) ? parent.children.length : 1;
  const move = (to: number) =>
    edit((p) => {
      const res = moveNode(p, path, parentOf(path), to);
      return { program: res.program, selection: { path: res.path } };
    });

  return (
    <div className={styles.actions}>
      <button type="button" onClick={() => move(index - 1)} disabled={isRoot || index === 0}>
        Move up
      </button>
      <button
        type="button"
        onClick={() => move(index + 2)}
        disabled={isRoot || index >= siblings - 1}
      >
        Move down
      </button>
      <button
        type="button"
        disabled={isRoot}
        onClick={() =>
          edit((p) => {
            const res = duplicateNode(p, path);
            return { program: res.program, selection: { path: res.path } };
          })
        }
      >
        Duplicate
      </button>
      <button
        type="button"
        onClick={() => edit((p) => wrapNode(p, path, 'markov'), { select: { path: [...path, 0] } })}
      >
        Wrap in markov
      </button>
      <button
        type="button"
        onClick={() =>
          edit((p) => wrapNode(p, path, 'sequence'), { select: { path: [...path, 0] } })
        }
      >
        Wrap in sequence
      </button>
      {isBranch(node) && (
        <button
          type="button"
          onClick={() => edit((p) => unwrapNode(p, path), { select: isRoot ? { path: [] } : null })}
          disabled={isRoot && node.children.length !== 1}
          title="Replace this node with its children"
        >
          Unwrap
        </button>
      )}
      <button
        type="button"
        className={styles.danger}
        disabled={isRoot}
        onClick={() => edit((p) => removeNode(p, path), { select: { path: parentOf(path) } })}
      >
        Delete
      </button>
    </div>
  );
}

function RuleList({
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
  if (!node || isBranch(node)) return null;
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Rules</h3>
      <ol className={styles.rules} aria-label="Rules">
        {node.rules.map((rule, i) => (
          <li key={i} className={styles.ruleItem} data-selected={selectedRule === i || undefined}>
            <button
              type="button"
              className={styles.ruleSelect}
              onClick={() => select({ path, rule: i })}
              aria-label={`Edit rule ${i + 1}: ${rule.in} to ${rule.out}`}
              aria-pressed={selectedRule === i}
            >
              <PatternView pattern={rule.in} values={program.values} />
              <span aria-hidden>→</span>
              <PatternView pattern={rule.out} values={program.values} />
            </button>
            <span className={styles.ruleActions}>
              <button
                type="button"
                aria-label={`Move rule ${i + 1} up`}
                disabled={i === 0}
                onClick={() =>
                  edit((p) => moveRule(p, path, i, i - 1), { select: { path, rule: i - 1 } })
                }
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move rule ${i + 1} down`}
                disabled={i === node.rules.length - 1}
                onClick={() =>
                  edit((p) => moveRule(p, path, i, i + 1), { select: { path, rule: i + 1 } })
                }
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Duplicate rule ${i + 1}`}
                onClick={() =>
                  edit((p) => duplicateRule(p, path, i), { select: { path, rule: i + 1 } })
                }
              >
                ⧉
              </button>
              <button
                type="button"
                aria-label={`Delete rule ${i + 1}`}
                onClick={() => edit((p) => removeRule(p, path, i), { select: { path } })}
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
        onClick={() => edit((p) => addRule(p, path), { select: { path, rule: node.rules.length } })}
      >
        + Add rule
      </button>
    </div>
  );
}

function NoSelection({ program }: { program: Program }) {
  const issues = useApp((s) => s.issues);
  return (
    <div className={styles.empty}>
      <p>Select a node or rule in the program tree to edit it.</p>
      <ul className={styles.tips}>
        <li>
          <b>one</b>, <b>all</b> and <b>prl</b> nodes hold rules: <em>find</em> a pattern,{' '}
          <em>replace</em> it.
        </li>
        <li>
          <b>markov</b> and <b>sequence</b> nodes decide which child runs next.
        </li>
        <li>The program stops when nothing can run any more.</li>
      </ul>
      <p className={styles.muted}>
        {program.values.length} symbols ·{' '}
        {issues.length === 0
          ? 'no errors'
          : `${issues.length} error${issues.length === 1 ? '' : 's'}`}
      </p>
    </div>
  );
}

/** Properties of the selected node, its rules, and the rule editor. */
export function Inspector() {
  const program = useApp((s) => s.program);
  const selection = useApp((s) => s.selection);
  const issues = useApp((s) => s.issues);
  const edit = useApp((s) => s.edit);
  if (!program) return null;
  if (!selection) return <NoSelection program={program} />;
  const { path } = selection;
  const node = nodeAt(program.root, path);
  if (!node) return <NoSelection program={program} />;

  const key = path.join('/');
  const nodeIssues = issues.filter(
    (i) =>
      i.path?.join('/') === key &&
      (selection.rule === undefined || i.rule === undefined || i.rule === selection.rule),
  );
  const family = kindFamily(node.kind);
  const conv = isConvolution(node);
  // What this node would get from its ancestors if it set no symmetry itself.
  const inheritedForNode =
    path.length === 0 ? DEFAULT_SYMMETRY : effectiveSymmetry(program, parentOf(path));

  return (
    <div className={styles.root}>
      {nodeIssues.length > 0 && (
        <ul className={styles.issues} aria-label="Problems">
          {nodeIssues.map((i, n) => (
            <li key={n}>
              {i.message}
              {i.rule !== undefined && ` (rule ${i.rule + 1})`}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.section}>
        <label className={styles.field}>
          <span className={styles.label}>Node</span>
          <select
            value={node.kind}
            onChange={(e) => edit((p) => setKind(p, path, e.target.value as NodeDef['kind']))}
            aria-label="Node kind"
          >
            {family.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <p className={styles.kindHint}>{KIND_HINT[node.kind]}.</p>

        <label className={styles.field}>
          <span className={styles.label}>Comment</span>
          <input
            type="text"
            value={node.comment ?? ''}
            placeholder="What does this step do?"
            onChange={(e) =>
              edit((p) => updateNode(p, path, { comment: e.target.value }), {
                coalesce: `comment-${key}`,
              })
            }
          />
        </label>

        {!isBranch(node) && (
          <label className={styles.field}>
            <span className={styles.label}>Max steps</span>
            <NumberField
              label="Max steps"
              value={node.steps ?? 0}
              min={0}
              onCommit={(n) =>
                edit((p) => updateNode(p, path, { steps: n > 0 ? Math.round(n) : undefined }))
              }
            />
            <span className={styles.muted}>
              0 = until {conv ? 'nothing changes' : 'no matches'}
            </span>
          </label>
        )}

        {conv ? (
          <>
            <label className={styles.field}>
              <span className={styles.label}>Neighbours</span>
              <select
                value={node.neighborhood}
                aria-label="Neighbourhood"
                onChange={(e) =>
                  edit((p) => updateNode(p, path, { neighborhood: e.target.value as Neighborhood }))
                }
              >
                <option value="Moore">8 around (Moore)</option>
                <option value="VonNeumann">4 sides (von Neumann)</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Edges</span>
              <span className={styles.check}>
                <input
                  type="checkbox"
                  checked={node.periodic ?? false}
                  onChange={(e) => edit((p) => updateNode(p, path, { periodic: e.target.checked }))}
                />
                Wrap around
              </span>
            </label>
          </>
        ) : (
          <label className={styles.field}>
            <span className={styles.label}>Symmetry</span>
            <select
              value={node.symmetry ?? ''}
              aria-label="Node symmetry"
              onChange={(e) =>
                edit((p) => updateNode(p, path, { symmetry: e.target.value || undefined }))
              }
            >
              <option value="">
                Inherit — {SYMMETRY_LABELS[inheritedForNode] ?? inheritedForNode}
              </option>
              {SYMMETRY_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name} {SYMMETRY_LABELS[name]}
                </option>
              ))}
            </select>
          </label>
        )}

        <NodeActions program={program} path={path} node={node} />
      </div>

      {!isBranch(node) && <RuleList program={program} path={path} selectedRule={selection.rule} />}

      {conv && selection.rule !== undefined && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Rule {selection.rule + 1}</h3>
          <ConvolutionEditor
            key={`${key}#${selection.rule}`}
            program={program}
            path={path}
            index={selection.rule}
          />
        </div>
      )}
      {isRuleNode(node) && selection.rule !== undefined && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Rule {selection.rule + 1}</h3>
          <RuleEditor
            key={`${key}#${selection.rule}`}
            program={program}
            path={path}
            index={selection.rule}
          />
        </div>
      )}
      {!isBranch(node) && selection.rule === undefined && node.rules.length > 0 && (
        <p className={styles.muted}>Pick a rule above to edit it.</p>
      )}
    </div>
  );
}
