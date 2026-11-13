import { useEffect } from 'react';
import { ENGINE_VERSION } from '@mj/engine';
import { Canvas } from './components/Canvas/Canvas';
import { ProgramOutline } from './components/ProgramOutline/ProgramOutline';
import { Transport } from './components/Transport/Transport';
import { XmlPanel } from './components/XmlPanel/XmlPanel';
import { EXAMPLES } from './examples';
import { startEngine, useApp } from './store/app';
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

export function App() {
  useEffect(() => startEngine(), []);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>MarkovJunior Web</h1>
        <ExamplePicker />
        <span className={styles.version}>engine v{ENGINE_VERSION}</span>
      </header>

      <aside className={styles.tree} aria-label="Program tree">
        <h2 className={styles.panelTitle}>Program</h2>
        <ProgramOutline />
      </aside>

      <main className={styles.canvas} aria-label="Preview">
        <Canvas />
      </main>

      <aside className={styles.inspector} aria-label="XML">
        <h2 className={styles.panelTitle}>XML</h2>
        <XmlPanel />
      </aside>

      <footer className={styles.transport} aria-label="Transport">
        <Transport />
      </footer>
    </div>
  );
}
