import { useEffect } from 'react';
import { ENGINE_VERSION } from '@mj/engine';
import { Canvas } from './components/Canvas/Canvas';
import { Inspector } from './components/Inspector/Inspector';
import { NodeTree } from './components/NodeTree/NodeTree';
import { PalettePanel } from './components/Palette/PalettePanel';
import { Transport } from './components/Transport/Transport';
import { XmlPanel } from './components/XmlPanel/XmlPanel';
import { EXAMPLES } from './examples';
import { startEngine, useApp, type Tab } from './store/app';
import styles from './App.module.css';

function ExamplePicker() {
  const exampleId = useApp((s) => s.exampleId);
  const loadExample = useApp((s) => s.loadExample);
  const current = EXAMPLES.find((e) => e.id === exampleId);
  return (
    <label className={styles.picker}>
      <span className={styles.pickerLabel}>Example</span>
      <select
        value={exampleId ?? ''}
        onChange={(e) => loadExample(e.target.value)}
        title={current?.description}
      >
        {exampleId === null && <option value="">Custom program</option>}
        {EXAMPLES.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function UndoRedo() {
  const canUndo = useApp((s) => s.past.length > 0);
  const canRedo = useApp((s) => s.future.length > 0);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  return (
    <span className={styles.history}>
      <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        Redo
      </button>
    </span>
  );
}

/** Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y), except inside text fields, which have their own undo. */
function useUndoShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useApp.getState().undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        useApp.getState().redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'inspector', label: 'Inspector' },
  { id: 'xml', label: 'XML' },
];

function SidePanel() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const errorCount = useApp((s) =>
    s.parseErrors.length > 0 ? s.parseErrors.length : s.issues.length,
  );
  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label="Editor views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className={styles.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'xml' && errorCount > 0 && <span className={styles.badge}>{errorCount}</span>}
          </button>
        ))}
      </div>
      <div
        className={styles.tabPanel}
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'inspector' ? <Inspector /> : <XmlPanel />}
      </div>
    </>
  );
}

export function App() {
  useEffect(() => startEngine(), []);
  useUndoShortcuts();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>MarkovJunior Web</h1>
        <ExamplePicker />
        <UndoRedo />
        <span className={styles.version}>engine v{ENGINE_VERSION}</span>
      </header>

      <aside className={styles.tree} aria-label="Program">
        <details className={styles.symbols} open>
          <summary className={styles.panelTitle}>Symbols</summary>
          <PalettePanel />
        </details>
        <h2 className={styles.panelTitle}>Program</h2>
        <NodeTree />
      </aside>

      <main className={styles.canvas} aria-label="Preview">
        <Canvas />
      </main>

      <aside className={styles.inspector} aria-label="Editor">
        <SidePanel />
      </aside>

      <footer className={styles.transport} aria-label="Transport">
        <Transport />
      </footer>
    </div>
  );
}
