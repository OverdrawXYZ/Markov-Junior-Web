import { useApp } from '../store/app';
import { zoomIn, zoomOut } from '../components/Canvas/zoom';
import { exportPng } from '../render/exportPng';
import { baseName, download, slug } from '../util/files';

export interface Shortcut {
  keys: string[];
  label: string;
  /** Matches a keydown event (modifiers checked by the matcher). */
  match(e: KeyboardEvent): boolean;
  run(): void;
}

const plain = (e: KeyboardEvent) => !e.ctrlKey && !e.metaKey && !e.altKey;
const mod = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.altKey;
const app = () => useApp.getState();

export function saveXml(): void {
  const { source, name } = app();
  download(`${slug(name)}.xml`, new Blob([source], { type: 'application/xml' }));
}

/** Read an .xml file into the editor (undoable). */
export async function importFile(file: File): Promise<void> {
  const text = await file.text();
  app().openSource(text, { name: baseName(file.name) });
}

export function openFilePicker(): void {
  document.getElementById('open-file-input')?.click();
}

const currentScale = () => {
  const { zoom, fitScale } = app();
  return zoom === 'fit' ? fitScale : zoom;
};

export const SHORTCUTS: Shortcut[] = [
  {
    keys: ['Space'],
    label: 'Run / pause',
    match: (e) => plain(e) && e.key === ' ',
    run: () => app().togglePlay(),
  },
  { keys: ['.'], label: 'Step', match: (e) => plain(e) && e.key === '.', run: () => app().step() },
  {
    keys: ['E'],
    label: 'Run to end',
    match: (e) => plain(e) && e.key.toLowerCase() === 'e',
    run: () => app().runToEnd(),
  },
  {
    keys: ['R'],
    label: 'Reset',
    match: (e) => plain(e) && e.key.toLowerCase() === 'r',
    run: () => app().reset(),
  },
  {
    keys: ['N'],
    label: 'New seed',
    match: (e) => plain(e) && e.key.toLowerCase() === 'n',
    run: () => app().randomizeSeed(),
  },
  {
    keys: ['+'],
    label: 'Zoom in',
    match: (e) => plain(e) && (e.key === '+' || e.key === '='),
    run: () => app().setZoom(zoomIn(currentScale())),
  },
  {
    keys: ['−'],
    label: 'Zoom out',
    match: (e) => plain(e) && (e.key === '-' || e.key === '_'),
    run: () => app().setZoom(zoomOut(currentScale())),
  },
  {
    keys: ['F'],
    label: 'Fit to panel',
    match: (e) => plain(e) && e.key.toLowerCase() === 'f',
    run: () => app().setZoom('fit'),
  },
  {
    keys: ['P'],
    label: 'Save as PNG',
    match: (e) => plain(e) && e.key.toLowerCase() === 'p',
    run: () => void exportPng(),
  },
  {
    keys: ['G'],
    label: 'Examples',
    match: (e) => plain(e) && e.key.toLowerCase() === 'g',
    run: () => app().setDialog('gallery'),
  },
  {
    keys: ['Ctrl', 'O'],
    label: 'Open .xml file',
    match: (e) => mod(e) && e.key.toLowerCase() === 'o',
    run: openFilePicker,
  },
  {
    keys: ['Ctrl', 'S'],
    label: 'Save .xml file',
    match: (e) => mod(e) && e.key.toLowerCase() === 's',
    run: saveXml,
  },
  {
    keys: ['Ctrl', 'Z'],
    label: 'Undo',
    match: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === 'z',
    run: () => app().undo(),
  },
  {
    keys: ['Ctrl', 'Shift', 'Z'],
    label: 'Redo',
    match: (e) =>
      mod(e) && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y'),
    run: () => app().redo(),
  },
  {
    keys: ['?'],
    label: 'Show shortcuts',
    match: (e) => e.key === '?' && !e.ctrlKey && !e.metaKey,
    run: () => app().setDialog('shortcuts'),
  },
];

/** Keys typed into these elements belong to them, not to the app. */
const OWN_KEYS = 'input, textarea, select, [contenteditable="true"]';

export function handleShortcut(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.repeat) return false;
  const target = e.target instanceof Element ? e.target : null;
  // Ctrl/Cmd shortcuts work everywhere except text fields (which have their own undo etc.).
  if (target?.closest(OWN_KEYS)) return false;
  // Let Space activate a focused button, as usual.
  if (e.key === ' ' && target?.closest('button, [role="button"], a')) return false;
  // While a dialog is open, only Escape (handled by the dialog) applies.
  if (app().dialog !== null) return false;
  const shortcut = SHORTCUTS.find((s) => s.match(e));
  if (!shortcut) return false;
  e.preventDefault();
  shortcut.run();
  return true;
}
