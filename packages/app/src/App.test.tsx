import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from './App';
import { useApp } from './store/app';

// No Worker in jsdom: the engine runs in-process through the same host.
describe('App', () => {
  it('renders the panels and loads the default example', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'MarkovJunior Web' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Preview' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Program XML' })).toHaveValue(
      useApp.getState().source,
    );
    // The outline shows the program once it has been compiled.
    const tree = await screen.findByRole('list', { name: 'Program tree' });
    expect(within(tree).getAllByText('one')).toHaveLength(2);
    // The example autoplays.
    await waitFor(() => expect(useApp.getState().stepCount).toBeGreaterThan(0));
  });

  it('steps, resets and runs to the end', async () => {
    render(<App />);
    await screen.findByRole('list', { name: 'Program tree' });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(screen.getByTestId('step-count')).toHaveTextContent('Step 0'));
    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    await waitFor(() => expect(screen.getByTestId('step-count')).toHaveTextContent('Step 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Run to end' }));
    await waitFor(() => expect(screen.getByText('Halted')).toBeInTheDocument(), { timeout: 5000 });
    // 59×59 maze: 840 forward + 840 back + 1.
    expect(screen.getByTestId('step-count')).toHaveTextContent('Step 1,681');
  });

  it('shows errors with line numbers and keeps the last valid program', async () => {
    render(<App />);
    await screen.findByRole('list', { name: 'Program tree' });
    const editor = screen.getByRole('textbox', { name: 'Program XML' });
    fireEvent.change(editor, { target: { value: '<one values="BW" in="B" out="Q"/>' } });
    const errors = await screen.findByRole('list', { name: 'Errors' });
    expect(errors).toHaveTextContent('output symbol Q is not a value (line 1');
    expect(useApp.getState().program?.values).toBe('BRGW');
    expect(screen.getByRole('combobox')).toHaveValue('');

    fireEvent.change(editor, { target: { value: '<one values="BW" in="B" out="W"/>' } });
    await waitFor(() => expect(useApp.getState().program?.values).toBe('BW'));
    expect(screen.queryByRole('list', { name: 'Errors' })).toBeNull();
  });

  it('switches examples', async () => {
    render(<App />);
    await screen.findByRole('list', { name: 'Program tree' });
    act(() => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'River' } });
    });
    await waitFor(() => expect(useApp.getState().program?.values).toBe('BWRUGE'));
    expect(screen.getByRole('spinbutton', { name: 'Grid width' })).toHaveValue(80);
  });
});
