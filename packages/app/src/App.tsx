import { ENGINE_VERSION } from '@mj/engine';
import styles from './App.module.css';

/**
 * Application shell. Panels are placeholders until later roadmap phases:
 * program tree + inspector (phase 4), canvas preview + transport (phase 3).
 */
export function App() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>MarkovJunior Web</h1>
        <span className={styles.version}>engine v{ENGINE_VERSION}</span>
      </header>

      <aside className={styles.tree} aria-label="Program tree">
        <h2 className={styles.panelTitle}>Program</h2>
        <p className={styles.placeholder}>Node tree goes here.</p>
      </aside>

      <main className={styles.canvas} aria-label="Preview">
        <p className={styles.placeholder}>Canvas preview goes here.</p>
      </main>

      <aside className={styles.inspector} aria-label="Inspector">
        <h2 className={styles.panelTitle}>Inspector</h2>
        <p className={styles.placeholder}>Select a node or rule.</p>
      </aside>

      <footer className={styles.transport} aria-label="Transport">
        <p className={styles.placeholder}>Run / Pause / Step / Reset</p>
      </footer>
    </div>
  );
}
