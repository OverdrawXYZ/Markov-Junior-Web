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
  act(() => useApp.getState().loadExample('ConnectedCaves'));
});

describe('paths in the editor', () => {
  it('shows and explains a path node', () => {
    const node = within(tree()).getByRole('treeitem', { name: 'path' });
    expect(node).toHaveTextContent('W → A via D');
    fireEvent.click(node);
    expect(screen.getByTestId('path-summary')).toHaveTextContent(
      'Each step draws a A path from the nearest W to A, through D.',
    );
    expect(screen.queryByRole('combobox', { name: 'Node symmetry' })).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'Max steps' })).toBeNull();
  });

  it('edits endpoints and options', () => {
    fireEvent.click(within(tree()).getByRole('treeitem', { name: 'path' }));
    fireEvent.click(screen.getByRole('button', { name: 'Through W' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow diagonal steps' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Start from the farthest' }));
    fireEvent.click(screen.getByRole('button', { name: 'Paint D' }));
    expect(xml()).toContain(
      '<path from="W" to="A" on="DW" color="D" longest="True" edges="True"/>',
    );
    // Painting with the start symbol is the default, so the attribute goes away.
    fireEvent.click(screen.getByRole('button', { name: 'Paint W' }));
    expect(xml()).toContain('<path from="W" to="A" on="DW" longest="True" edges="True"/>');
    expect(screen.getByTestId('path-summary')).toHaveTextContent('diagonal steps allowed');
  });

  it('can be added from the toolbar', () => {
    fireEvent.click(within(tree()).getByRole('treeitem', { name: 'sequence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add path node' }));
    expect(xml()).toContain('<path from="A" to="W" on="D"/>');
    expect(useApp.getState().issues).toEqual([]);
  });
});
