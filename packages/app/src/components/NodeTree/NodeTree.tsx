import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  isBranch,
  isConvolution,
  isRuleNode,
  nodeAt,
  type NodeDef,
  type NodePath,
  type Program,
} from '@mj/engine';
import {
  duplicateNode,
  insertNode,
  moveNode,
  moveRule,
  newNode,
  NODE_KINDS,
  parentOf,
  removeNode,
  removeRule,
  samePath,
} from '../../editor/ops';
import { describeField, KIND_HINT } from '../../editor/labels';
import { useApp, type Selection } from '../../store/app';
import { PatternView } from '../PatternView/PatternView';
import styles from './NodeTree.module.css';

const PATH_TYPE = 'application/x-mj-path';
const KIND_TYPE = 'application/x-mj-kind';

type DropPos = 'before' | 'after' | 'inside';
interface DropTarget {
  key: string;
  pos: DropPos;
}

const keyOf = (path: NodePath) => path.join('/');

/** Every selectable row (nodes and their rules) in display order. */
function flatten(node: NodeDef, path: NodePath, out: Selection[] = []): Selection[] {
  out.push({ path });
  if (isBranch(node)) node.children.forEach((c, i) => flatten(c, [...path, i], out));
  else node.rules.forEach((_, rule) => out.push({ path, rule }));
  return out;
}

const sameSelection = (a: Selection | null, b: Selection | null) =>
  !!a && !!b && samePath(a.path, b.path) && a.rule === b.rule;

/** Where a drop lands: the branch to insert into and the index there. */
function dropDestination(
  program: Program,
  path: NodePath,
  pos: DropPos,
): { parent: NodePath; index: number } {
  if (pos === 'inside') {
    const node = nodeAt(program.root, path);
    return { parent: path, index: node && isBranch(node) ? node.children.length : 0 };
  }
  if (path.length === 0) return { parent: [], index: pos === 'before' ? 0 : 1 };
  const i = path[path.length - 1]!;
  return { parent: parentOf(path), index: pos === 'before' ? i : i + 1 };
}

interface RowProps {
  node: NodeDef;
  path: NodePath;
  program: Program;
  drop: DropTarget | null;
  setDrop(d: DropTarget | null): void;
  onDrop(e: DragEvent, path: NodePath, pos: DropPos): void;
}

function NodeRow({ node, path, program, drop, setDrop, onDrop }: RowProps) {
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const edit = useApp((s) => s.edit);
  const key = keyOf(path);
  const active = useApp((s) => (s.activeNodePath ? keyOf(s.activeNodePath) : null));
  const issues = useApp((s) => s.issues);
  const nodeIssues = issues.filter((i) => i.path && keyOf(i.path) === key);
  const isSelected = sameSelection(selection, { path });
  const isCurrent = active === key;
  const onActivePath =
    active !== null && (key === '' || active === key || active.startsWith(`${key}/`));
  const branch = isBranch(node);
  const dropHere = drop?.key === key ? drop.pos : undefined;

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    const types = e.dataTransfer.types;
    if (!types.includes(PATH_TYPE) && !types.includes(KIND_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const f = (e.clientY - rect.top) / rect.height;
    let pos: DropPos = f < 0.5 ? 'before' : 'after';
    if (branch && f > 0.25 && f < 0.75) pos = 'inside';
    if (path.length === 0 && branch) pos = 'inside';
    if (dropHere !== pos) setDrop({ key, pos });
  };

  return (
    <li className={styles.item} role="none">
      <div
        className={styles.row}
        role="treeitem"
        aria-selected={isSelected}
        aria-level={path.length + 1}
        aria-label={`${node.kind}${node.comment ? ` ${node.comment}` : ''}`}
        data-selected={isSelected || undefined}
        data-active={onActivePath || undefined}
        data-current={isCurrent || undefined}
        data-drop={dropHere}
        draggable={path.length > 0}
        onClick={() => select({ path })}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData(PATH_TYPE, JSON.stringify(path));
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={onDragOver}
        onDragLeave={() => dropHere && setDrop(null)}
        onDrop={(e) => onDrop(e, path, dropHere ?? 'after')}
      >
        <span className={styles.kind} data-kind={node.kind} title={KIND_HINT[node.kind]}>
          {node.kind}
        </span>
        {node.comment && <span className={styles.comment}>{node.comment}</span>}
        {!branch && node.steps ? <span className={styles.meta}>×{node.steps}</span> : null}
        {'symmetry' in node && node.symmetry && (
          <span className={styles.meta}>{node.symmetry}</span>
        )}
        {isRuleNode(node) && node.fields && (
          <span className={styles.meta} title={node.fields.map(describeField).join('\n')}>
            {node.fields.length === 1 ? '1 field' : `${node.fields.length} fields`}
            {node.temperature ? ` · t=${node.temperature}` : ''}
          </span>
        )}
        {isConvolution(node) && (
          <span className={styles.meta}>
            {node.neighborhood === 'Moore' ? '8 neighbours' : '4 neighbours'}
            {node.periodic ? ' · wraps' : ''}
          </span>
        )}
        {nodeIssues.length > 0 && (
          <span
            className={styles.issue}
            title={nodeIssues.map((i) => i.message).join('\n')}
            aria-label="Has errors"
          >
            !
          </span>
        )}
        {isSelected && path.length > 0 && (
          <span className={styles.rowActions}>
            <button
              type="button"
              aria-label="Duplicate node"
              title="Duplicate"
              onClick={(e) => {
                e.stopPropagation();
                edit((p) => {
                  const res = duplicateNode(p, path);
                  return { program: res.program, selection: { path: res.path } };
                });
              }}
            >
              ⧉
            </button>
            <button
              type="button"
              aria-label="Delete node"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                edit((p) => removeNode(p, path), { select: { path: parentOf(path) } });
              }}
            >
              ×
            </button>
          </span>
        )}
      </div>
      {branch ? (
        node.children.length > 0 ? (
          <ul className={styles.children} role="group">
            {node.children.map((child, i) => (
              <NodeRow
                key={i}
                node={child}
                path={[...path, i]}
                program={program}
                drop={drop}
                setDrop={setDrop}
                onDrop={onDrop}
              />
            ))}
          </ul>
        ) : (
          <p className={styles.emptyBranch}>Empty — drag nodes here</p>
        )
      ) : (
        <ul className={styles.rules} role="group">
          {node.rules.map((rule, i) => {
            const sel = sameSelection(selection, { path, rule: i });
            const ruleIssue = nodeIssues.some((iss) => iss.rule === i);
            return (
              <li key={i} role="none">
                <div
                  className={styles.rule}
                  role="treeitem"
                  aria-selected={sel}
                  aria-level={path.length + 2}
                  aria-label={`rule ${rule.in} to ${rule.out}${'values' in rule && rule.values ? ` when ${rule.sum} ${rule.values}` : ''}`}
                  data-selected={sel || undefined}
                  onClick={() => select({ path, rule: i })}
                >
                  <PatternView
                    pattern={rule.in}
                    values={program.values}
                    label={`input ${rule.in}`}
                  />
                  <span className={styles.arrow} aria-hidden>
                    →
                  </span>
                  <PatternView
                    pattern={rule.out}
                    values={program.values}
                    label={`output ${rule.out}`}
                  />
                  {'values' in rule && rule.values !== undefined && (
                    <span className={styles.condition}>
                      if
                      <PatternView
                        pattern={[...rule.values].join('')}
                        values={program.values}
                        label={`counting ${rule.values}`}
                      />
                      <span className={styles.meta}>= {rule.sum}</span>
                    </span>
                  )}
                  {rule.p !== undefined && <span className={styles.meta}>p={rule.p}</span>}
                  {'symmetry' in rule && rule.symmetry && (
                    <span className={styles.meta}>{rule.symmetry}</span>
                  )}
                  {ruleIssue && <span className={styles.issue}>!</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** Editable program tree. */
export function NodeTree() {
  const program = useApp((s) => s.program);
  const selection = useApp((s) => s.selection);
  const edit = useApp((s) => s.edit);
  const select = useApp((s) => s.select);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const treeRef = useRef<HTMLUListElement>(null);

  if (!program) return <p className={styles.empty}>No program loaded.</p>;

  const add = (kind: NodeDef['kind'], parent: NodePath, index: number) =>
    edit((p) => {
      const res = insertNode(p, parent, index, newNode(kind, p));
      return { program: res.program, selection: { path: res.path } };
    });

  const addAtSelection = (kind: NodeDef['kind']) => {
    const sel = selection?.path ?? [];
    const target = nodeAt(program.root, sel);
    if (target && isBranch(target)) add(kind, sel, target.children.length);
    else if (sel.length === 0) add(kind, [], 1);
    else add(kind, parentOf(sel), sel[sel.length - 1]! + 1);
  };

  const onDrop = (e: DragEvent, path: NodePath, pos: DropPos) => {
    e.preventDefault();
    e.stopPropagation();
    setDrop(null);
    const { parent, index } = dropDestination(program, path, pos);
    const kind = e.dataTransfer.getData(KIND_TYPE) as NodeDef['kind'];
    if (kind) return add(kind, parent, index);
    const raw = e.dataTransfer.getData(PATH_TYPE);
    if (!raw) return;
    const from = JSON.parse(raw) as number[];
    edit((p) => {
      const res = moveNode(p, from, parent, index);
      return { program: res.program, selection: { path: res.path } };
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const rows = flatten(program.root, []);
    const i = rows.findIndex((r) => sameSelection(r, selection));
    const sel = selection;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.altKey) {
      e.preventDefault();
      const next =
        rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) select(next);
      return;
    }
    if (!sel) return;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.altKey) {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      if (sel.rule !== undefined) {
        const to = sel.rule + d;
        edit((p) => moveRule(p, sel.path, sel.rule!, to), { select: { path: sel.path, rule: to } });
      } else if (sel.path.length > 0) {
        const at = sel.path[sel.path.length - 1]!;
        edit((p) => {
          const res = moveNode(p, sel.path, parentOf(sel.path), d > 0 ? at + 2 : at - 1);
          return { program: res.program, selection: { path: res.path } };
        });
      }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (sel.rule !== undefined) {
        edit((p) => removeRule(p, sel.path, sel.rule!), { select: { path: sel.path } });
      } else if (sel.path.length > 0) {
        edit((p) => removeNode(p, sel.path), { select: { path: parentOf(sel.path) } });
      }
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.toolbar} role="toolbar" aria-label="Add node">
        <span className={styles.toolbarLabel}>Add</span>
        {NODE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={styles.addKind}
            data-kind={kind}
            draggable
            title={`${KIND_HINT[kind]}. Click to add, or drag into the tree.`}
            aria-label={`Add ${kind} node`}
            onClick={() => addAtSelection(kind)}
            onDragStart={(e) => {
              e.dataTransfer.setData(KIND_TYPE, kind);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            {kind}
          </button>
        ))}
      </div>
      <ul
        ref={treeRef}
        className={styles.tree}
        role="tree"
        aria-label="Program tree"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onDragEnd={() => setDrop(null)}
      >
        <NodeRow
          node={program.root}
          path={[]}
          program={program}
          drop={drop}
          setDrop={setDrop}
          onDrop={onDrop}
        />
      </ul>
      <p className={styles.hint}>Drag to reorder or nest · ↑↓ select · Alt+↑↓ move · Del remove</p>
    </div>
  );
}
