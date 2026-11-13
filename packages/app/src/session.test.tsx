import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import { exportScale } from './render/exportPng';
import { useApp } from './store/app';
import { encodeShare, loadProject, STORAGE_KEY } from './store/persist';
import { AUTOSAVE_MS, hydrate, startAutosave } from './store/session';

const custom = '<one values="BY" in="B" out="Y" comment="custom"/>';

beforeEach(() => {
  useApp.setState(useApp.getInitialState(), true);
  localStorage.clear();
  history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('restoring a session', () => {
  it('prefers a share link, then removes it from the URL', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ source: '<one values="BW" in="B" out="W"/>', width: 9, height: 9, seed: 1 }),
    );
    const encoded = await encodeShare({
      source: custom,
      width: 33,
      height: 21,
      seed: 77,
      palette: { Y: 0xabcdef },
    });
    history.replaceState(null, '', `/#p=${encoded}`);
    expect(await hydrate()).toBe('share');
    const s = useApp.getState();
    expect(s.program?.values).toBe('BY');
    expect([s.width, s.height, s.seed]).toEqual([33, 21, 77]);
    expect(s.palette).toEqual({ Y: 0xabcdef });
    expect(s.name).toBe('Shared program');
    expect(s.past).toEqual([]);
    expect(location.hash).toBe('');
  });

  it('falls back to the autosave, and ignores broken links', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ source: custom, width: 12, height: 10, seed: 5 }),
    );
    history.replaceState(null, '', '/#p=zgarbage');
    expect(await hydrate()).toBe('saved');
    expect(useApp.getState().program?.values).toBe('BY');
    expect(useApp.getState().name).toBe('Untitled');
  });

  it('keeps the default example when there is nothing to restore', async () => {
    expect(await hydrate()).toBe('default');
    expect(useApp.getState().exampleId).toBe('MazeBacktracker');
  });

  it('recognises a saved example by its source', async () => {
    useApp.getState().loadExample('River');
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ source: useApp.getState().source, width: 80, height: 80, seed: 2 }),
    );
    useApp.setState(useApp.getInitialState(), true);
    await hydrate();
    expect(useApp.getState().exampleId).toBe('River');
    expect(useApp.getState().name).toBe('River');
  });
});

describe('autosave', () => {
  it('saves shortly after the project changes', () => {
    vi.useFakeTimers();
    const stop = startAutosave();
    useApp.getState().openSource(custom);
    useApp.getState().setSeed(42);
    expect(loadProject()).toBeNull();
    vi.advanceTimersByTime(AUTOSAVE_MS);
    expect(loadProject()).toMatchObject({ source: custom, seed: 42 });
    stop();
  });

  it('ignores changes that are not part of the project', () => {
    vi.useFakeTimers();
    const stop = startAutosave();
    useApp.getState().setTab('xml');
    vi.advanceTimersByTime(AUTOSAVE_MS);
    expect(loadProject()).toBeNull();
    stop();
  });
});

describe('header actions', () => {
  beforeEach(async () => {
    render(<App />);
    await screen.findByRole('tree', { name: 'Program tree' });
  });

  it('opens an .xml file (undoably) and names the project after it', async () => {
    const input = document.getElementById('open-file-input') as HTMLInputElement;
    const file = new File([custom], 'my-cave.xml', { type: 'application/xml' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(useApp.getState().program?.values).toBe('BY'));
    expect(screen.getByTestId('project-name')).toHaveTextContent('my-cave');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useApp.getState().program?.values).toBe('BRGW');
  });

  it('shows a share link that decodes to the current project', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const input = await screen.findByDisplayValue(/#p=z/);
    const url = new URL((input as HTMLInputElement).value);
    history.replaceState(null, '', `/${url.hash}`);
    const before = useApp.getState().source;
    useApp.setState(useApp.getInitialState(), true);
    useApp.getState().openSource(custom);
    await act(() => hydrate());
    expect(useApp.getState().source).toBe(before);
  });

  it('closes dialogs with Escape', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('keyboard shortcuts', () => {
  beforeEach(async () => {
    render(<App />);
    await screen.findByRole('tree', { name: 'Program tree' });
    await waitFor(() => expect(useApp.getState().mode).not.toBe('paused'));
  });

  it('Space pauses and resumes', async () => {
    fireEvent.keyDown(document.body, { key: ' ' });
    await waitFor(() => expect(useApp.getState().mode).toBe('paused'));
    fireEvent.keyDown(document.body, { key: ' ' });
    await waitFor(() => expect(useApp.getState().mode).not.toBe('paused'));
  });

  it('N picks a new seed, R resets, ? shows help, G opens examples', async () => {
    const seed = useApp.getState().seed;
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(useApp.getState().seed).not.toBe(seed);
    fireEvent.keyDown(document.body, { key: 'r' });
    await waitFor(() => expect(useApp.getState().stepCount).toBe(0));
    fireEvent.keyDown(document.body, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'g' }); // ignored while a dialog is open
    expect(screen.queryByRole('dialog', { name: 'Examples' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(document.body, { key: 'g' });
    expect(screen.getByRole('dialog', { name: 'Examples' })).toBeInTheDocument();
  });

  it('zoom keys change the canvas zoom', () => {
    fireEvent.keyDown(document.body, { key: '+' });
    expect(useApp.getState().zoom).toBe(2);
    fireEvent.keyDown(document.body, { key: 'f' });
    expect(useApp.getState().zoom).toBe('fit');
  });

  it('does not fire while typing in a field', () => {
    const seed = useApp.getState().seed;
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Seed' }), { key: 'n' });
    expect(useApp.getState().seed).toBe(seed);
  });
});

describe('PNG export', () => {
  it('upscales to at least 512px without exceeding 4096px', () => {
    expect(exportScale(59, 59)).toBe(9);
    expect(exportScale(512, 100)).toBe(1);
    expect(exportScale(1024, 1024)).toBe(1);
    expect(exportScale(1, 1)).toBe(512);
  });
});
