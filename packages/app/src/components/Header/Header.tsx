import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ENGINE_VERSION } from '@mj/engine';
import { importFile, openFilePicker, saveXml, SHORTCUTS } from '../../editor/actions';
import { currentProject, useApp } from '../../store/app';
import { shareUrl } from '../../store/persist';
import { Gallery } from '../Gallery/Gallery';
import { Modal } from '../Modal/Modal';
import styles from './Header.module.css';

function ShareDialog({ onClose }: { onClose(): void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void shareUrl(currentProject()).then(async (link) => {
      if (!live) return;
      setUrl(link);
      try {
        await navigator.clipboard.writeText(link);
        if (live) setCopied('yes');
      } catch {
        if (live) setCopied('no');
      }
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => input.current?.select(), [url]);

  return (
    <Modal title="Share" onClose={onClose}>
      <p className={styles.text}>
        This link contains the whole program, grid size, seed and colours — anyone who opens it sees
        the same result. Nothing is uploaded.
      </p>
      <div className={styles.shareRow}>
        <input
          ref={input}
          readOnly
          value={url ?? 'Creating link…'}
          aria-label="Share link"
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          disabled={!url}
          onClick={() => {
            if (!url) return;
            navigator.clipboard.writeText(url).then(
              () => setCopied('yes'),
              () => setCopied('no'),
            );
          }}
        >
          Copy
        </button>
      </div>
      <p className={styles.status} role="status" data-ok={copied === 'yes' || undefined}>
        {copied === 'yes'
          ? 'Copied to the clipboard.'
          : copied === 'no'
            ? 'Select the link and copy it.'
            : ''}
      </p>
      {url && url.length > 8000 && (
        <p className={styles.warning}>
          This program is large; some apps may cut off links this long.
        </p>
      )}
    </Modal>
  );
}

function ShortcutsDialog({ onClose }: { onClose(): void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <table className={styles.shortcuts}>
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.label}>
              <td>
                {s.keys.map((k, i) => (
                  <span key={i}>
                    {i > 0 && '+'}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </td>
              <td>{s.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.text}>
        In the program tree: <kbd>↑</kbd>
        <kbd>↓</kbd> select, <kbd>Alt</kbd>+<kbd>↑</kbd>
        <kbd>↓</kbd> move, <kbd>Del</kbd> remove. On a Mac, use <kbd>⌘</kbd> for <kbd>Ctrl</kbd>.
      </p>
    </Modal>
  );
}

export function Header() {
  const name = useApp((s) => s.name);
  const edited = useApp((s) => s.exampleId === null);
  const canUndo = useApp((s) => s.past.length > 0);
  const canRedo = useApp((s) => s.future.length > 0);
  const dialog = useApp((s) => s.dialog);
  const { undo, redo, setDialog } = useApp.getState();
  const close = () => setDialog(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void importFile(file);
    e.target.value = '';
  };

  return (
    <header className={styles.header}>
      <h1 className={styles.title}>MarkovJunior Web</h1>
      <span
        className={styles.project}
        title={edited ? 'Edited — saved automatically in this browser' : undefined}
      >
        <span className={styles.name} data-testid="project-name">
          {name}
        </span>
        {edited && <span className={styles.edited}>edited</span>}
      </span>
      <nav className={styles.actions} aria-label="Project">
        <button type="button" onClick={() => setDialog('gallery')}>
          Examples
        </button>
        <button
          type="button"
          onClick={openFilePicker}
          title="Open a MarkovJunior .xml file (Ctrl+O)"
        >
          Open
        </button>
        <button type="button" onClick={saveXml} title="Download the program as .xml (Ctrl+S)">
          Save
        </button>
        <button type="button" onClick={() => setDialog('share')} title="Get a link to this program">
          Share
        </button>
        <span className={styles.sep} />
        <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
        <button
          type="button"
          onClick={() => setDialog('shortcuts')}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          ?
        </button>
      </nav>
      <span className={styles.version}>engine v{ENGINE_VERSION}</span>
      <input
        id="open-file-input"
        type="file"
        accept=".xml,application/xml,text/xml"
        hidden
        onChange={onFile}
      />
      {dialog === 'gallery' && <Gallery onClose={close} />}
      {dialog === 'share' && <ShareDialog onClose={close} />}
      {dialog === 'shortcuts' && <ShortcutsDialog onClose={close} />}
    </header>
  );
}
