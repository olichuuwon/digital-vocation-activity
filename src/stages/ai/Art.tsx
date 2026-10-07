import { memo, type ReactNode } from 'react';
import type { AiImage, Label } from '../../content/stage2Schema';

/*
 * Flat SVG scenes for Stage 2 (§5.4: in-repo illustrations, no licensing issues, tiny size).
 * Everything is drawn on a 100×100 canvas. The labelled item is drawn in a local 100×100 space
 * and stretched into `image.box`, so the box in the content file is the true bounding box.
 */

type Draw = (style: number) => ReactNode;

const INK = '#1d2433';

const item: Record<Label, Draw> = {
  water: (style) => {
    if (style === 1) {
      // Jerrycan
      return (
        <>
          <rect x="12" y="18" width="76" height="80" rx="10" fill="#2E8FE8" stroke={INK} strokeWidth="3" />
          <rect x="22" y="2" width="22" height="18" rx="4" fill="#cfe6ff" stroke={INK} strokeWidth="3" />
          <path d="M54 8 h24 v14 h-10 v-6 h-14z" fill="#1565c0" stroke={INK} strokeWidth="3" />
          <path d="M30 50 q8 -14 16 0 q-8 14 -16 0z" fill="#fff" opacity="0.85" />
        </>
      );
    }
    const n = style === 2 ? 1 : 3;
    const w = 100 / n;
    return (
      <>
        {Array.from({ length: n }, (_, i) => (
          <g key={i} transform={`translate(${i * w} 0)`}>
            <rect x={w * 0.3} y="0" width={w * 0.4} height="10" rx="2" fill="#0d47a1" stroke={INK} strokeWidth="2.5" />
            <rect x={w * 0.22} y="9" width={w * 0.56} height="10" fill="#cfe6ff" stroke={INK} strokeWidth="2.5" />
            <rect x={w * 0.1} y="18" width={w * 0.8} height="80" rx={w * 0.18} fill="#5aa9f0" stroke={INK} strokeWidth="2.5" />
            <rect x={w * 0.1} y="45" width={w * 0.8} height="22" fill="#fff" opacity="0.9" />
            <path d={`M${w * 0.5} 49 q-5 8 0 12 q5 -4 0 -12z`} fill="#2E8FE8" />
          </g>
        ))}
      </>
    );
  },
  food: (style) => {
    if (style === 1) {
      // Rice sack
      return (
        <>
          <path d="M18 14 q32 -14 64 0 l8 80 q-40 10 -80 0z" fill="#e8d3a0" stroke={INK} strokeWidth="3" />
          <path d="M30 14 q20 8 40 0" fill="none" stroke={INK} strokeWidth="3" />
          <ellipse cx="50" cy="56" rx="16" ry="20" fill="none" stroke="#8a5a14" strokeWidth="4" />
          <path d="M50 40 v32 M42 50 l8 6 l8 -6 M42 60 l8 6 l8 -6" stroke="#8a5a14" strokeWidth="3" fill="none" />
        </>
      );
    }
    if (style === 2) {
      // Stack of cans
      return (
        <>
          {[
            [6, 50],
            [52, 50],
            [29, 2],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <rect x={x} y={y} width="42" height="46" rx="5" fill="#f0a830" stroke={INK} strokeWidth="3" />
              <rect x={x} y={(y ?? 0) + 14} width="42" height="18" fill="#c0392b" />
              <circle cx={(x ?? 0) + 21} cy={(y ?? 0) + 23} r="5" fill="#fff" />
            </g>
          ))}
        </>
      );
    }
    // Cardboard ration box
    return (
      <>
        <path d="M4 26 l46 -22 l46 22 v70 h-92z" fill="#c8964f" stroke={INK} strokeWidth="3" />
        <path d="M4 26 h92 M50 4 v22" stroke={INK} strokeWidth="3" />
        <rect x="26" y="44" width="48" height="36" rx="4" fill="#f6e7c8" stroke={INK} strokeWidth="2.5" />
        <path d="M50 50 v24 M42 58 l8 6 l8 -6 M42 66 l8 6 l8 -6" stroke="#8a5a14" strokeWidth="3" fill="none" />
      </>
    );
  },
  'medical-kit': (style) => (
    <>
      <path d="M34 16 v-10 h32 v10" fill="none" stroke={INK} strokeWidth="5" />
      <rect x="2" y="16" width="96" height="82" rx="12" fill={style === 1 ? '#d63031' : '#ffffff'} stroke={INK} strokeWidth="3" />
      <path
        d="M40 30 h20 v16 h16 v20 h-16 v16 h-20 v-16 h-16 v-20 h16z"
        fill={style === 1 ? '#ffffff' : '#d63031'}
        stroke={style === 2 ? INK : 'none'}
        strokeWidth="2"
      />
    </>
  ),
  blanket: (style) => {
    const colours = [
      ['#8e6cc7', '#b9a2e3'],
      ['#2a9d8f', '#8fd3c8'],
      ['#c0392b', '#f0a69f'],
    ][style] ?? ['#8e6cc7', '#b9a2e3'];
    return (
      <>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x={i * 3} y={8 + i * 30} width={100 - i * 6} height="28" rx="10" fill={colours[i % 2]} stroke={INK} strokeWidth="3" />
            <path d={`M${10 + i * 3} ${22 + i * 30} h${80 - i * 6}`} stroke="#fff" strokeWidth="3" strokeDasharray="6 6" opacity="0.8" />
          </g>
        ))}
      </>
    );
  },
  tent: (style) => {
    const fill = ['#2E8FE8', '#E8950C', '#3c8d3f'][style] ?? '#2E8FE8';
    return (
      <>
        <path d="M2 96 L50 4 L98 96 Z" fill={fill} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <path d="M50 4 L50 96" stroke={INK} strokeWidth="2" opacity="0.5" />
        <path d="M50 44 L34 96 h32 Z" fill="#1d2433" opacity="0.8" />
        <path d="M0 98 h8 M92 98 h8" stroke={INK} strokeWidth="3" />
      </>
    );
  },
  generator: (style) => (
    <>
      <rect x="4" y="14" width="88" height="66" rx="6" fill={style === 1 ? '#c0392b' : style === 2 ? '#3c8d3f' : '#f1c40f'} stroke={INK} strokeWidth="3" />
      <rect x="14" y="26" width="36" height="28" rx="3" fill="#2d3436" />
      <circle cx="70" cy="40" r="11" fill="#fff" stroke={INK} strokeWidth="3" />
      <path d="M70 40 l6 -6" stroke={INK} strokeWidth="3" />
      <path d="M80 14 v-12 h12 v6" fill="none" stroke={INK} strokeWidth="4" />
      <path d="M14 62 h66" stroke={INK} strokeWidth="2" strokeDasharray="4 4" />
      <circle cx="20" cy="86" r="10" fill="#2d3436" stroke={INK} strokeWidth="3" />
      <circle cx="76" cy="86" r="10" fill="#2d3436" stroke={INK} strokeWidth="3" />
      <text x="32" y="46" fontSize="16" fill="#f1c40f" fontWeight="800">⚡</text>
    </>
  ),
  'clear-road': (style) => (
    <>
      <rect x="0" y="0" width="100" height="100" fill={style === 2 ? '#6b6f76' : '#55595f'} />
      <rect x="0" y="0" width="100" height="6" fill="#d9d9d9" />
      <rect x="0" y="94" width="100" height="6" fill="#d9d9d9" />
      <path d="M2 50 h96" stroke="#fff" strokeWidth="6" strokeDasharray="12 9" />
      {style === 1 && <path d="M70 20 l12 0 l-6 -10z" fill="#f1c40f" />}
    </>
  ),
  'flooded-road': (style) => (
    <>
      <rect x="0" y="0" width="100" height="100" fill="#55595f" />
      <rect x="0" y="0" width="100" height="6" fill="#d9d9d9" />
      <path d="M2 50 h96" stroke="#fff" strokeWidth="6" strokeDasharray="12 9" opacity="0.6" />
      <path
        d={
          style === 1
            ? 'M0 18 q12 -8 25 0 t25 0 t25 0 t25 0 V100 H0z'
            : style === 2
              ? 'M0 40 q12 -8 25 0 t25 0 t25 0 t25 0 V100 H0z'
              : 'M0 28 q12 -8 25 0 t25 0 t25 0 t25 0 V100 H0z'
        }
        fill="#3b82c4"
        opacity="0.88"
      />
      <path d="M8 62 q8 -6 16 0 M44 74 q8 -6 16 0 M70 56 q8 -6 16 0" stroke="#dff0ff" strokeWidth="3" fill="none" />
    </>
  ),
};

const decorDraw: Record<AiImage['decor'][number]['kind'], ReactNode> = {
  tree: (
    <>
      <rect x="-1.2" y="0" width="2.4" height="5" fill="#7a4f2a" />
      <circle cx="0" cy="-1.5" r="4" fill="#3c8d3f" />
    </>
  ),
  house: (
    <>
      <rect x="-4" y="-2" width="8" height="7" fill="#e9d8b4" stroke={INK} strokeWidth="0.4" />
      <path d="M-5 -2 L0 -6 L5 -2z" fill="#b5523b" />
    </>
  ),
  cloud: (
    <>
      <circle cx="-2.5" cy="0" r="2.6" fill="#fff" />
      <circle cx="1" cy="-1" r="3.2" fill="#fff" />
      <circle cx="4" cy="0.5" r="2.2" fill="#fff" />
    </>
  ),
  crate: (
    <>
      <rect x="-3.5" y="-3.5" width="7" height="7" fill="#b98545" stroke={INK} strokeWidth="0.5" />
      <path d="M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5" stroke={INK} strokeWidth="0.4" />
    </>
  ),
  puddle: <ellipse cx="0" cy="0" rx="5" ry="1.6" fill="#7fb7e6" opacity="0.8" />,
  lamp: (
    <>
      <rect x="-0.5" y="-5" width="1" height="10" fill="#555" />
      <circle cx="0" cy="-5.5" r="1.4" fill="#ffe08a" />
    </>
  ),
  sign: (
    <>
      <rect x="-0.4" y="0" width="0.8" height="5" fill="#555" />
      <path d="M0 -4 L4 0 L0 4 L-4 0z" fill="#f1c40f" stroke={INK} strokeWidth="0.4" />
    </>
  ),
  bush: (
    <>
      <circle cx="-2" cy="0" r="2.5" fill="#4caf50" />
      <circle cx="1.5" cy="-0.5" r="3" fill="#43a047" />
    </>
  ),
};

function Backdrop({ bg }: { bg: AiImage['bg'] }) {
  switch (bg) {
    case 'street':
      return (
        <>
          <rect width="100" height="45" fill="#bfe3ff" />
          <rect y="45" width="100" height="55" fill="#a7adb5" />
        </>
      );
    case 'field':
      return (
        <>
          <rect width="100" height="40" fill="#bfe3ff" />
          <rect y="40" width="100" height="60" fill="#9ccc65" />
        </>
      );
    case 'shelter':
      return (
        <>
          <rect width="100" height="55" fill="#f3e9d7" />
          <rect y="55" width="100" height="45" fill="#d7c4a3" />
          <path d="M0 55 h100" stroke="#b49a6f" strokeWidth="1" />
        </>
      );
    case 'warehouse':
      return (
        <>
          <rect width="100" height="60" fill="#d5d9de" />
          <path d="M0 15 h100 M0 32 h100" stroke="#a9b0b8" strokeWidth="2" />
          <rect y="60" width="100" height="40" fill="#9aa1a9" />
        </>
      );
  }
}

/** One Stage 2 scene. `title` is the accessible name (a visual clue, not the answer). */
export const SceneArt = memo(function SceneArt({
  image,
  title,
  children,
}: {
  image: AiImage;
  title?: string;
  /** Extra SVG drawn on top in canvas units (tiles, boxes). */
  children?: ReactNode;
}) {
  const [x, y, w, h] = image.box;
  const night = image.variant === 'night';
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <Backdrop bg={image.bg} />
      {image.decor.map((d, i) => (
        <g key={i} transform={`translate(${d.x} ${d.y}) scale(${d.s / 10})`}>
          {decorDraw[d.kind]}
        </g>
      ))}
      <g transform={`translate(${x} ${y}) scale(${w / 100} ${h / 100})`}>{item[image.label](image.style)}</g>
      {night && (
        <>
          <rect width="100" height="100" fill="#06112a" opacity="0.72" />
          <circle cx="86" cy="12" r="6" fill="#f4f1c9" opacity="0.9" />
        </>
      )}
      {children}
    </svg>
  );
});
