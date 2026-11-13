import { useEffect, useState } from 'react';
import { EXAMPLES, type Example } from '../../examples';
import { thumbnail } from '../../examples/thumbnails';
import { useApp } from '../../store/app';
import { Modal } from '../Modal/Modal';
import styles from './Gallery.module.css';

function Thumbnail({ example }: { example: Example }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void thumbnail(example).then((url) => live && setSrc(url));
    return () => {
      live = false;
    };
  }, [example]);
  return src ? (
    <img className={styles.thumb} src={src} alt="" />
  ) : (
    <span className={styles.thumb} data-loading aria-hidden />
  );
}

export function Gallery({ onClose }: { onClose(): void }) {
  const loadExample = useApp((s) => s.loadExample);
  const current = useApp((s) => s.exampleId);
  return (
    <Modal title="Examples" onClose={onClose} wide>
      <ul className={styles.grid}>
        {EXAMPLES.map((example) => (
          <li key={example.id}>
            <button
              type="button"
              className={styles.card}
              aria-current={current === example.id || undefined}
              aria-label={`${example.name}: ${example.description}`}
              onClick={() => {
                loadExample(example.id);
                onClose();
              }}
            >
              <Thumbnail example={example} />
              <span className={styles.name}>
                {example.name}
                {example.original && <span className={styles.tag}>new</span>}
              </span>
              <span className={styles.description}>{example.description}</span>
              <span className={styles.size}>
                {example.size} × {example.size}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.credit}>
        Examples marked <span className={styles.tag}>new</span> were written for this app. The
        others are from{' '}
        <a href="https://github.com/mxgmn/MarkovJunior" target="_blank" rel="noreferrer">
          MarkovJunior
        </a>{' '}
        by Maxim Gumin (MIT License).
      </p>
    </Modal>
  );
}
