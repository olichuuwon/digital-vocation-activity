import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { AiImage, Box } from '../../content/stage2Schema';
import { dragCorner, moveBox, resizeBox } from '../../sim/iou';
import { SceneArt } from './Art';
import { fill } from '../../content';
import { c } from './content';
import s from './ai.module.css';

const STEP = 6;

const readout = ([x, y, w, h]: Box) =>
  fill(c.a11y.boxReadout, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Drag = { kind: 'move'; lastX: number; lastY: number } | { kind: Corner };

/**
 * Draw the Box (§5.1 L3): drag the box body to move it and the corner handles to resize it.
 * Every drag has button twins (move ←↑↓→, wider/narrower/taller/shorter) (§10), so a pointer is
 * never required. `truth` (after 3 misses) shows the right box as a dashed outline.
 */
export function BoxDrawer({
  image,
  title,
  box,
  onChange,
  truth,
}: {
  image: AiImage;
  title: string;
  box: Box;
  onChange: (b: Box) => void;
  truth?: Box;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [x, y, w, h] = box;
  const readoutId = useId();
  const [said, setSaid] = useState(() => readout(box));

  const toCanvas = (e: ReactPointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return { cx: ((e.clientX - r.left) / r.width) * 100, cy: ((e.clientY - r.top) / r.height) * 100 };
  };
  const begin = (e: ReactPointerEvent, kind: Drag['kind']) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (kind === 'move') {
      const { cx, cy } = toCanvas(e);
      drag.current = { kind: 'move', lastX: cx, lastY: cy };
    } else drag.current = { kind };
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { cx, cy } = toCanvas(e);
    if (d.kind === 'move') {
      onChange(moveBox(box, cx - d.lastX, cy - d.lastY));
      drag.current = { kind: 'move', lastX: cx, lastY: cy };
    } else {
      onChange(dragCorner(box, d.kind, cx, cy));
    }
  };
  const end = () => {
    if (drag.current) setSaid(readout(box));
    drag.current = null;
  };
  /** A discrete change (key or button): apply it and speak the new box. */
  const change = (b: Box) => {
    onChange(b);
    setSaid(readout(b));
  };

  const corners: [Corner, number, number][] = [
    ['tl', x, y],
    ['tr', x + w, y],
    ['bl', x, y + h],
    ['br', x + w, y + h],
  ];

  const nudge: [string, () => Box][] = [
    [c.box.left, () => moveBox(box, -STEP, 0)],
    [c.box.up, () => moveBox(box, 0, -STEP)],
    [c.box.down, () => moveBox(box, 0, STEP)],
    [c.box.right, () => moveBox(box, STEP, 0)],
    [c.box.narrower, () => resizeBox(box, -STEP, 0)],
    [c.box.wider, () => resizeBox(box, STEP, 0)],
    [c.box.shorter, () => resizeBox(box, 0, -STEP)],
    [c.box.taller, () => resizeBox(box, 0, STEP)],
  ];

  return (
    <>
      <div
        ref={frame}
        className={`${s.frame} ${s.boxFrame}`}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
        data-testid="box-frame"
        // Keyboard twin of dragging (§10): arrows move, Shift + arrows resize.
        // role="application": screen readers pass arrow keys through (in browse mode a "group"
        // would swallow them). One small control; the nudge buttons are a full alternative.
        tabIndex={0}
        role="application"
        aria-label={c.box.keys}
        aria-describedby={readoutId}
        onKeyDown={(e) => {
          const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
          if (!d || e.altKey || e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          change(e.shiftKey ? resizeBox(box, d[0]! * STEP, d[1]! * STEP) : moveBox(box, d[0]! * STEP, d[1]! * STEP));
        }}
        data-box={box.map((n) => Math.round(n)).join(',')}
      >
        <SceneArt image={image} title={title}>
          {truth && (
            <g data-testid="truth-box" fill="none">
              {/* Black under-stroke keeps the dashed outline visible on any backdrop (1.4.11). */}
              <rect x={truth[0]} y={truth[1]} width={truth[2]} height={truth[3]} stroke="#000" strokeWidth="2.2" />
              <rect x={truth[0]} y={truth[1]} width={truth[2]} height={truth[3]} stroke="#fff" strokeWidth="1.2" strokeDasharray="3 2" />
            </g>
          )}
          <rect x={x} y={y} width={w} height={h} fill="rgb(124 77 255 / 0.18)" stroke="#000" strokeWidth="1.6" />
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="transparent"
            stroke="#ffd400"
            strokeWidth="0.9"
            style={{ cursor: 'move' }}
            onPointerDown={(e) => begin(e, 'move')}
          />
          {corners.map(([k, cx, cy]) => (
            <g key={k} className={s.handle} onPointerDown={(e) => begin(e, k)}>
              <circle cx={cx} cy={cy} r="9" fill="transparent" />
              <circle cx={cx} cy={cy} r="3" fill="#ffd400" stroke="#000" strokeWidth="1" />
            </g>
          ))}
        </SceneArt>
      </div>
      {/* Spoken after a key, a nudge or the end of a drag (not on every pointer move). */}
      <p className="visually-hidden" aria-live="polite" id={readoutId}>
        {said}
        {truth && ` ${fill(c.a11y.truthReadout, { x: Math.round(truth[0]), y: Math.round(truth[1]), w: Math.round(truth[2]), h: Math.round(truth[3]) })}`}
      </p>
      <p className={s.keysHint}>{c.box.keysVisible}</p>
      <div className={s.nudge} role="group" aria-label={`${c.box.move} / ${c.box.resize}`}>
        {nudge.map(([label, f]) => (
          <button key={label} type="button" onClick={() => change(f())}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
