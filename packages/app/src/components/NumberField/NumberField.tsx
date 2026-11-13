import { useState, type KeyboardEvent } from 'react';

interface Props {
  value: number;
  onCommit(value: number): void;
  min?: number;
  max?: number;
  label: string;
  className?: string | undefined;
}

/**
 * Number input that only commits on blur or Enter, so typing "128" doesn't
 * trigger work for "1" and "12" along the way. Escape reverts.
 */
export function NumberField({ value, onCommit, min, max, label, className }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (draft.trim() !== '' && Number.isFinite(n) && n !== value) onCommit(n);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setDraft(null);
  };

  return (
    <input
      type="number"
      className={className}
      aria-label={label}
      value={draft ?? String(value)}
      min={min}
      max={max}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}
