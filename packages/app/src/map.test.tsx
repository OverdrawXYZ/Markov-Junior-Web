import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App';
import { useApp } from './store/app';

const xml = () => useApp.getState().source;
const tree = () => screen.getByRole('tree', { name: 'Program tree' });

beforeEach(async () => {
  useApp.setState(useApp.getInitialState(), true);
  render(<App />);
  await screen.findByRole('tree', { name: 'Program tree' });
  act(() => useApp.getState().loadExample('MarchingSquares'));
});

describe('maps in the editor', () => {
  it('shows the map, its scale and its rules in the tree', () => {
    const map = within(tree()).getByRole('treeitem', { name: 'map' });
    expect(map).toHaveTextContent('×3×3 → DA');
    expect(within(tree()).getAllByRole('treeitem', { name: /^map rule/ })).toHaveLength(6);
  });

  it('edits scale and symbols with validation', () => {
    fireEvent.click(within(tree()).getByRole('treeitem', { name: 'map' }));
    const width = screen.getByRole('textbox', { name: 'Width factor' });
    fireEvent.change(width, { target: { value: '0' } });
    expect(width).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(width, { target: { value: '2' } });
    fireEvent.blur(width);
    expect(xml()).toContain('<map scale="2 3 1" values="DA">');
    const symbols = screen.getByRole('textbox', { name: 'Map symbols' });
    fireEvent.change(symbols, { target: { value: 'DAE' } });
    fireEvent.keyDown(symbols, { key: 'Enter' });
    expect(xml()).toContain('values="DAE"');
    expect(screen.queryByRole('button', { name: 'Unwrap' })).toBeNull();
  });

  it('paints map rules in the outer and inner alphabets', () => {
    fireEvent.click(
      within(tree()).getByRole('treeitem', { name: 'map rule BB/BB to DDD/DDD/DDD' }),
    );
    const editor = screen.getByRole('region', { name: 'Map rule editor' });
    // Input brushes are the outer symbols, output brushes the map's.
    const inputBrushes = within(editor).getByRole('toolbar', { name: 'Input brushes' });
    const outputBrushes = within(editor).getByRole('toolbar', { name: 'Output brushes' });
    expect(within(inputBrushes).getByRole('button', { name: 'Brush W' })).toBeInTheDocument();
    expect(within(outputBrushes).queryByRole('button', { name: 'Brush W' })).toBeNull();
    fireEvent.click(within(inputBrushes).getByRole('button', { name: 'Brush W' }));
    fireEvent.click(within(editor).getByRole('gridcell', { name: 'input 1,1: B' }));
    fireEvent.click(within(outputBrushes).getByRole('button', { name: 'Brush A' }));
    fireEvent.click(within(editor).getByRole('gridcell', { name: 'output 2,2: D' }));
    expect(xml()).toContain('<rule in="BB/BW" out="DDD/DDD/DDA"/>');
    // The two sides resize independently.
    fireEvent.click(within(editor).getByRole('button', { name: 'Shorter output' }));
    expect(xml()).toContain('<rule in="BB/BW" out="DDD/DDD"/>');
  });

  it('can be added from the toolbar', () => {
    fireEvent.click(within(tree()).getByRole('treeitem', { name: 'sequence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add map node' }));
    expect(xml()).toContain('<map scale="2 2 1" values="BW"/>');
    fireEvent.click(screen.getByRole('button', { name: '+ Add map rule' }));
    expect(xml()).toContain('<rule in="B" out="WW/WW"/>');
  });
});
