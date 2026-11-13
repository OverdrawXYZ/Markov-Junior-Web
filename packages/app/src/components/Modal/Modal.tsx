import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Modal.module.css';

interface Props {
  title: string;
  onClose(): void;
  children: ReactNode;
  wide?: boolean;
}

/** Accessible modal dialog: Escape or the backdrop closes it, focus moves inside and back. */
export function Modal({ title, onClose, children, wide }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={styles.dialog}
        data-wide={wide || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
