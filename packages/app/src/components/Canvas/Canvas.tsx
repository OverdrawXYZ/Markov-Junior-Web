import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { ackFrame, effectivePalette, useApp } from '../../store/app';
import { exportPng } from '../../render/exportPng';
import { frames, type Frame } from '../../store/frames';
import { buildLut, paint } from '../../render/paint';
import { fitScale, zoomIn, zoomOut } from './zoom';
import styles from './Canvas.module.css';

const nextFrame: (cb: () => void) => void =
  typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16);

interface Hover {
  x: number;
  y: number;
  symbol: string;
}

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const zoom = useApp((s) => s.zoom);
  const setZoom = useApp((s) => s.setZoom);
  const fit = useApp((s) => s.fitScale);
  const setFit = (fitScale: number) => useApp.setState({ fitScale });
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);

  // Draw frames as they arrive, at most once per animation frame.
  useEffect(() => {
    let pending: Frame | null = frames.latest;
    let scheduled = false;
    let image: ImageData | null = null;
    let lut: Uint32Array | null = null;
    let lutFor = '';
    let disposed = false;

    const draw = () => {
      scheduled = false;
      const frame = pending;
      pending = null;
      if (disposed || !frame) return;
      const canvas = canvasRef.current;
      if (canvas) {
        if (canvas.width !== frame.width || canvas.height !== frame.height) {
          canvas.width = frame.width;
          canvas.height = frame.height;
          image = null;
        }
        setDims((d) =>
          d && d.w === frame.width && d.h === frame.height
            ? d
            : { w: frame.width, h: frame.height },
        );
        const ctx = canvas.getContext('2d');
        if (ctx) {
          image ??= ctx.createImageData(frame.width, frame.height);
          const overrides = useApp.getState().palette;
          const lutKey = frame.characters + JSON.stringify(overrides);
          if (!lut || lutFor !== lutKey) {
            lut = buildLut(frame.characters, effectivePalette(overrides));
            lutFor = lutKey;
          }
          paint(frame.state, lut, new Uint32Array(image.data.buffer));
          ctx.putImageData(image, 0, 0);
        }
      }
      ackFrame();
    };

    const schedule = () => {
      if (!scheduled) {
        scheduled = true;
        nextFrame(draw);
      }
    };
    if (pending) schedule();
    const unsubscribe = frames.subscribe((frame) => {
      pending = frame;
      schedule();
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  // Redraw when the user changes a colour.
  const palette = useApp((s) => s.palette);
  useEffect(() => {
    if (frames.latest) frames.publish(frames.latest);
  }, [palette]);

  // Keep the "fit" scale in sync with the panel size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !dims || typeof ResizeObserver === 'undefined') return;
    const PADDING = 32;
    const update = () =>
      setFit(fitScale(el.clientWidth - PADDING, el.clientHeight - PADDING, dims.w, dims.h));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [dims]);

  const scale = zoom === 'fit' ? fit : zoom;

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(e.deltaY < 0 ? zoomIn(scale) : zoomOut(scale));
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const frame = frames.latest;
    if (!frame) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * frame.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * frame.height);
    if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return setHover(null);
    setHover({ x, y, symbol: frame.characters[frame.state[x + y * frame.width]!] ?? '?' });
  };

  return (
    <div className={styles.root}>
      <div
        className={styles.viewport}
        ref={containerRef}
        onWheel={onWheel}
        data-panning={panning || undefined}
        onPointerDown={(e) => {
          // Drag to pan when the grid is larger than the panel.
          const el = e.currentTarget;
          if (
            e.button !== 0 ||
            (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)
          )
            return;
          el.setPointerCapture?.(e.pointerId);
          pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
          setPanning(true);
        }}
        onPointerMove={(e) => {
          if (!pan.current) return;
          e.currentTarget.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
          e.currentTarget.scrollTop = pan.current.top - (e.clientY - pan.current.y);
        }}
        onPointerUp={() => {
          pan.current = null;
          setPanning(false);
        }}
        onPointerCancel={() => {
          pan.current = null;
          setPanning(false);
        }}
      >
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          aria-label="Grid preview"
          style={dims ? { width: dims.w * scale, height: dims.h * scale } : undefined}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
        />
      </div>
      <div className={styles.bar}>
        <span className={styles.info}>
          {dims ? `${dims.w} × ${dims.h}` : '—'}
          {hover && (
            <>
              {' · '}
              <span data-testid="hover-info">
                ({hover.x}, {hover.y}) <b>{hover.symbol}</b>
              </span>
            </>
          )}
        </span>
        <span className={styles.zoom}>
          <button
            type="button"
            onClick={() => void exportPng()}
            disabled={!dims}
            title="Save the grid as a PNG image"
          >
            PNG
          </button>
          <button type="button" onClick={() => setZoom(zoomOut(scale))} aria-label="Zoom out">
            −
          </button>
          <button
            type="button"
            onClick={() => setZoom('fit')}
            aria-pressed={zoom === 'fit'}
            title="Fit to panel"
          >
            {zoom === 'fit' ? 'Fit' : `${Math.round(scale * 100)}%`}
          </button>
          <button type="button" onClick={() => setZoom(zoomIn(scale))} aria-label="Zoom in">
            +
          </button>
        </span>
      </div>
    </div>
  );
}
