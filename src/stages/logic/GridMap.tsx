import { memo } from 'react';
import type { Dir } from '../../content/stage3Schema';
import s from './logic.module.css';

/*
 * Top-down Stage 3 map (§6.1), one SVG so it scales to any phone. Each tile is 10×10 units.
 * Houses show their need as an icon (not colour alone); "might flood" roads show a ⚠ marker until
 * the run reveals which road actually flooded.
 */

const ANGLE: Record<Dir, number> = { N: 0, E: 90, S: 180, W: 270 };
const NEED_ICON: Record<string, string> = { W: '💧', F: '🍚', M: '✚' };

export interface TruckPos {
  x: number;
  y: number;
  dir: Dir;
}

function Tile({ ch, x, y, flooded }: { ch: string; x: number; y: number; flooded: boolean }) {
  const X = x * 10;
  const Y = y * 10;
  if (ch === '.')
    return (
      <g>
        <rect x={X} y={Y} width="10" height="10" fill="#8fc46a" />
        {(x + y) % 3 === 0 && <circle cx={X + 5} cy={Y + 5} r="2.6" fill="#4f8f3a" />}
        {(x + y) % 3 === 1 && (
          <g>
            <circle cx={X + 4} cy={Y + 6} r="1.6" fill="#6aa84f" />
            <circle cx={X + 6} cy={Y + 5.6} r="1.9" fill="#5e9c45" />
          </g>
        )}
      </g>
    );
  return (
    <g>
      <rect x={X} y={Y} width="10" height="10" fill="#7d838c" />
      <rect x={X + 0.4} y={Y + 0.4} width="9.2" height="9.2" fill="none" stroke="#9aa1a9" strokeWidth="0.4" />
      {flooded && (
        <g>
          <rect x={X} y={Y} width="10" height="10" fill="#2f7fd0" />
          <path
            d={`M${X + 1} ${Y + 4} q1.5 -1.5 3 0 t3 0 t3 0 M${X + 1} ${Y + 7} q1.5 -1.5 3 0 t3 0 t3 0`}
            stroke="#dff0ff"
            strokeWidth="0.7"
            fill="none"
          />
        </g>
      )}
      {!flooded && /[abc]/.test(ch) && (
        <g>
          <rect x={X + 0.6} y={Y + 0.6} width="8.8" height="8.8" fill="none" stroke="#f1c40f" strokeWidth="0.7" strokeDasharray="1.4 1" />
          <text x={X + 5} y={Y + 6.8} fontSize="5" textAnchor="middle" fill="#ffe680">
            ⚠
          </text>
        </g>
      )}
    </g>
  );
}

function House({ x, y, need, delivered, wrong }: { x: number; y: number; need: string; delivered: boolean; wrong: boolean }) {
  const X = x * 10;
  const Y = y * 10;
  return (
    <g>
      <rect x={X + 1.5} y={Y + 4} width="7" height="5" fill={delivered ? '#e8f5e9' : '#f6e7c8'} stroke="#3b2f1a" strokeWidth="0.5" />
      <path d={`M${X + 0.8} ${Y + 4.2} L${X + 5} ${Y + 1} L${X + 9.2} ${Y + 4.2}z`} fill="#b5523b" stroke="#3b2f1a" strokeWidth="0.5" />
      <rect x={X + 4.2} y={Y + 6.2} width="1.6" height="2.8" fill="#6b4a2a" />
      {need !== 'H' && !delivered && (
        <g>
          <circle cx={X + 8.2} cy={Y + 2} r="2" fill="#fff" stroke="#3b2f1a" strokeWidth="0.4" />
          <text x={X + 8.2} y={Y + 3.1} fontSize="2.8" textAnchor="middle" fill={need === 'M' ? '#d63031' : '#1d2433'}>
            {NEED_ICON[need]}
          </text>
        </g>
      )}
      {delivered && (
        <g>
          <circle cx={X + 8.2} cy={Y + 2} r="2" fill={wrong ? '#fff3cd' : '#1e8e3e'} stroke="#1d2433" strokeWidth="0.4" />
          <text x={X + 8.2} y={Y + 3.1} fontSize="2.8" textAnchor="middle" fontWeight="900" fill={wrong ? '#8a5a00' : '#fff'}>
            {wrong ? '!' : '✓'}
          </text>
        </g>
      )}
    </g>
  );
}

export const GridMap = memo(function GridMap({
  grid,
  flood,
  truck,
  delivered,
  wrongDrops,
  crashed,
  label,
}: {
  grid: readonly string[];
  /** Active flood group, or null before a run reveals it. */
  flood: string | null;
  truck: TruckPos;
  /** "x,y" of houses that got supplies. */
  delivered: ReadonlySet<string>;
  /** "x,y" of houses the AI gave the wrong supply. */
  wrongDrops: ReadonlySet<string>;
  crashed: boolean;
  /** Accessible summary (the map is one image to screen readers; the text lives in `label`). */
  label: string;
}) {
  const size = grid.length;
  const tiles: { ch: string; x: number; y: number }[] = [];
  grid.forEach((row, y) => [...row].forEach((ch, x) => tiles.push({ ch, x, y })));
  return (
    <svg viewBox={`0 0 ${size * 10} ${size * 10}`} className={s.map} role="img" aria-label={label} data-testid="grid-map">
      {tiles.map(({ ch, x, y }) => (
        <Tile key={`${x},${y}`} ch={ch} x={x} y={y} flooded={ch === '~' || (flood !== null && ch === flood)} />
      ))}
      {tiles
        .filter((t) => t.ch === 'D')
        .map(({ x, y }) => (
          <g key="depot">
            <rect x={x * 10 + 1} y={y * 10 + 1} width="8" height="8" rx="1" fill="none" stroke="#fff" strokeWidth="0.6" strokeDasharray="1.5 1" />
            <text x={x * 10 + 5} y={y * 10 + 3.4} fontSize="2.6" textAnchor="middle" fill="#fff" fontWeight="800">
              DEPOT
            </text>
          </g>
        ))}
      {tiles
        .filter((t) => /[HWFM]/.test(t.ch))
        .map(({ ch, x, y }) => (
          <House key={`h${x},${y}`} x={x} y={y} need={ch} delivered={delivered.has(`${x},${y}`)} wrong={wrongDrops.has(`${x},${y}`)} />
        ))}
      <g
        className={s.truck}
        style={{ transform: `translate(${truck.x * 10 + 5}px, ${truck.y * 10 + 5}px) rotate(${ANGLE[truck.dir]}deg)` }}
        data-testid="truck"
        data-pos={`${truck.x},${truck.y},${truck.dir}`}
      >
        {/* Drawn pointing north; rotated to face `dir`. */}
        <rect x="-3" y="-1" width="6" height="5" rx="0.8" fill={crashed ? '#d63031' : '#E8950C'} stroke="#1d2433" strokeWidth="0.5" />
        <rect x="-2.4" y="-4" width="4.8" height="3.4" rx="0.8" fill="#fff" stroke="#1d2433" strokeWidth="0.5" />
        <path d="M0 -4.6 L1.6 -3 L-1.6 -3z" fill="#1d2433" />
        <circle cx="-3" cy="3" r="1" fill="#1d2433" />
        <circle cx="3" cy="3" r="1" fill="#1d2433" />
        <circle cx="-3" cy="-0.5" r="1" fill="#1d2433" />
        <circle cx="3" cy="-0.5" r="1" fill="#1d2433" />
      </g>
    </svg>
  );
});
