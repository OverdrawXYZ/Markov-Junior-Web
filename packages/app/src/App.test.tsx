import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from './App';
import { useApp } from './store/app';

beforeEach(() => {
  useApp.setState(useApp.getInitialState(), true);
});

async function renderApp() {
  render(<App />);
  await screen.findByRole('tree', { name: 'Program tree' });
}

const openXml = () => fireEvent.click(screen.getByRole('tab', { name: /XML/ }));

// No Worker in jsdom: the engine runs in-process through the same host.
describe('App', () => {
  it('renders the panels and autoplays the default example', async () => {
    await renderApp();
    expect(screen.getByRole('heading', { name: 'MarkovJunior Web' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Preview' })).toBeInTheDocument();
    const tree = screen.getByRole('tree', { name: 'Program tree' });
    expect(within(tree).getAllByRole('treeitem', { name: 'one' })).toHaveLength(2);
    await waitFor(() => expect(useApp.getState().stepCount).toBeGreaterThan(0));
  });

  it('steps, resets and runs to the end', async () => {
    await renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(screen.getByTestId('step-count')).toHaveTextContent('Step 0'));
    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    await waitFor(() => expect(screen.getByTestId('step-count')).toHaveTextContent('Step 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Run to end' }));
    await waitFor(() => expect(screen.getByText('Halted')).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByTestId('step-count')).toHaveTextContent('Step 1,681');
  });

  it('shows XML errors with line numbers; the tree reflects the edited program', async () => {
    await renderApp();
    openXml();
    const editor = screen.getByRole('textbox', { name: 'Program XML' });
    fireEvent.change(editor, { target: { value: '<one values="BW" in="B" out="Q"/>' } });
    const errors = await screen.findByRole('list', { name: 'Errors' });
    expect(errors).toHaveTextContent('output symbol Q is not a value (line 1');
    expect(screen.getByRole('tab', { name: /XML/ })).toHaveTextContent('1');
    expect(screen.getByRole('treeitem', { name: 'one' })).toBeInTheDocument();

    fireEvent.change(editor, { target: { value: '<markov values="BW">' } });
    expect(await screen.findByText(/unclosed tag <markov>/)).toBeInTheDocument();
    expect(
      screen.getByText(/visual editor shows the last version that parsed/),
    ).toBeInTheDocument();
  });

  it('switches examples', async () => {
    await renderApp();
    act(() => {
      fireEvent.change(screen.getAllByRole('combobox')[0]!, { target: { value: 'River' } });
    });
    await waitFor(() => expect(useApp.getState().program?.values).toBe('BWRUGE'));
    expect(screen.getByRole('spinbutton', { name: 'Grid width' })).toHaveValue(80);
  });
});
