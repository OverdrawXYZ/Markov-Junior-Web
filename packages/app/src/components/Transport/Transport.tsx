import { MAX_SIZE, MIN_SIZE, useApp } from '../../store/app';
import { SPEEDS, speedLabel } from '../../worker/protocol';
import { NumberField } from '../NumberField/NumberField';
import styles from './Transport.module.css';

export function Transport() {
  const mode = useApp((s) => s.mode);
  const halted = useApp((s) => s.halted);
  const stepCount = useApp((s) => s.stepCount);
  const loaded = useApp((s) => s.program !== null);
  const speedIndex = useApp((s) => s.speedIndex);
  const stepSize = useApp((s) => s.stepSize);
  const seed = useApp((s) => s.seed);
  const width = useApp((s) => s.width);
  const height = useApp((s) => s.height);
  const actions = useApp.getState();

  const running = mode !== 'paused';
  const status = halted
    ? 'Halted'
    : mode === 'toEnd'
      ? 'Running to end'
      : running
        ? 'Running'
        : 'Paused';
  const canAdvance = loaded && !halted;

  return (
    <div className={styles.root}>
      <div className={styles.group}>
        <button
          type="button"
          className={styles.primary}
          onClick={actions.togglePlay}
          disabled={!canAdvance && !running}
        >
          {running ? 'Pause' : 'Run'}
        </button>
        <button type="button" onClick={actions.step} disabled={!canAdvance}>
          Step
        </button>
        <NumberField
          className={styles.small}
          label="Steps per click"
          value={stepSize}
          min={1}
          onCommit={actions.setStepSize}
        />
        <button type="button" onClick={actions.runToEnd} disabled={!canAdvance || mode === 'toEnd'}>
          Run to end
        </button>
        <button type="button" onClick={actions.reset} disabled={!loaded}>
          Reset
        </button>
      </div>

      <div className={styles.status} aria-live="polite">
        <span
          className={styles.badge}
          data-state={halted ? 'halted' : running ? 'running' : 'paused'}
        >
          {status}
        </span>
        <span data-testid="step-count">Step {stepCount.toLocaleString('en-US')}</span>
      </div>

      <label className={styles.group}>
        <span className={styles.label}>Speed</span>
        <input
          type="range"
          min={0}
          max={SPEEDS.length - 1}
          value={speedIndex}
          onChange={(e) => actions.setSpeedIndex(Number(e.target.value))}
          aria-valuetext={speedLabel(SPEEDS[speedIndex]!)}
        />
        <span className={styles.speed}>{speedLabel(SPEEDS[speedIndex]!)}</span>
      </label>

      <div className={styles.group}>
        <span className={styles.label}>Seed</span>
        <NumberField
          className={styles.seed}
          label="Seed"
          value={seed}
          min={0}
          onCommit={actions.setSeed}
        />
        <button type="button" onClick={actions.randomizeSeed} title="Random seed">
          New seed
        </button>
      </div>

      <div className={styles.group}>
        <span className={styles.label}>Size</span>
        <NumberField
          className={styles.small}
          label="Grid width"
          value={width}
          min={MIN_SIZE}
          max={MAX_SIZE}
          onCommit={(w) => actions.setSize(w, height)}
        />
        <span className={styles.label}>×</span>
        <NumberField
          className={styles.small}
          label="Grid height"
          value={height}
          min={MIN_SIZE}
          max={MAX_SIZE}
          onCommit={(h) => actions.setSize(width, h)}
        />
      </div>
    </div>
  );
}
