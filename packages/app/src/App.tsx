import { useEffect } from 'react';
import { Canvas } from './components/Canvas/Canvas';
import { Header } from './components/Header/Header';
import { handleShortcut, importFile } from './editor/actions';
import { Inspector } from './components/Inspector/Inspector';
import { NodeTree } from './components/NodeTree/NodeTree';
import { PalettePanel } from './components/Palette/PalettePanel';
import { Transport } from './components/Transport/Transport';
import { XmlPanel } from './components/XmlPanel/XmlPanel';
import { startEngine, useApp, type Tab } from './store/app';
import styles from './App.module.css';

/** Global keyboard shortcuts, and dropping an .xml file anywhere on the page. */
function useGlobalInput() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => void handleShortcut(e);
    const isFileDrag = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const onDragOver = (e: DragEvent) => {
      if (isFileDrag(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) void importFile(file);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
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
  useGlobalInput();

  return (
    <div className={styles.shell}>
      <Header />

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
