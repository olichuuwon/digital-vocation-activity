import { m, useReducedMotion } from 'framer-motion';
import { stages } from '../../content';
import { ICONS } from '../../components/icons';
import s from './CityMap.module.css';

/**
 * Home visual: the flooded city with the supply route through the four teams, in play order.
 * Decorative (the tagline says the same in words). The route line is the game's signature: the
 * same line runs through the stage strip at the top of every stage.
 */
const ROUTE = 'M20 64 H118 V120 H210 V64 H300';
const STOPS: [number, number][] = [
  [70, 64],
  [118, 104],
  [178, 120],
  [210, 92],
];

/** Small houses: [x, y, w, h]. Kept off the roads (y 64, 120; x 118, 210). */
const BLOCKS: [number, number, number, number][] = [
  [12, 18, 22, 16], [40, 24, 16, 12], [64, 16, 26, 20], [96, 26, 14, 10],
  [128, 14, 20, 16], [154, 22, 26, 14], [186, 16, 16, 18], [222, 20, 24, 14], [254, 14, 18, 20], [280, 24, 26, 12],
  [12, 80, 18, 14], [36, 86, 26, 12], [70, 78, 18, 18], [94, 88, 14, 10],
  [128, 76, 22, 14], [156, 82, 18, 12], [180, 74, 16, 16],
  [222, 78, 18, 16], [246, 84, 24, 12], [278, 76, 22, 18],
  [222, 132, 20, 12], [250, 136, 18, 10], [276, 130, 26, 14],
];

export function CityMap() {
  const still = useReducedMotion();
  return (
    <svg className={s.map} viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect className={s.ground} x="0" y="0" width="320" height="200" rx="16" />
      {/* Roads */}
      <g className={s.road}>
        <path d="M0 64 H320 M0 120 H320 M118 0 V200 M210 0 V200" />
      </g>
      {BLOCKS.map(([x, y, w, h], i) => (
        <rect key={i} className={s.house} x={x} y={y} width={w} height={h} rx="2" />
      ))}
      {/* Floodwater over the low half of the city */}
      <path
        className={s.water}
        d="M0 132 C 30 124, 56 142, 90 136 S 150 150, 196 146 S 262 166, 320 156 V200 H0 Z"
      />
      <g className={s.wave}>
        <path d="M18 160 q8 -5 16 0 t16 0 M84 176 q8 -5 16 0 t16 0 M160 166 q8 -5 16 0 t16 0 M236 184 q8 -5 16 0 t16 0" />
      </g>
      {/* The supply route */}
      <path className={s.routeCasing} d={ROUTE} />
      <m.path
        className={s.route}
        d={ROUTE}
        initial={still ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      />
      {/* Depot (start) and the families (end) */}
      <rect className={s.depot} x="8" y="56" width="16" height="16" rx="4" />
      <ICONS.truck x="10" y="58" width="12" height="12" className={s.depotIcon} strokeWidth={2} />
      <circle className={s.goal} cx="300" cy="64" r="10" />
      <ICONS.flag x="293" y="57" width="14" height="14" className={s.goalIcon} strokeWidth={2} />
      {/* The four teams, in play order */}
      {stages.map((st, i) => {
        const [x, y] = STOPS[i]!;
        const Icon = ICONS[st.icon];
        return (
          <m.g
            key={st.stage}
            initial={still ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: 0.4 + i * 0.15 }}
          >
            <circle cx={x} cy={y} r="11" fill={`var(--${st.discipline})`} className={s.stop} />
            <Icon x={x - 6} y={y - 6} width="12" height="12" color={st.discipline === 'logic' ? '#1a1200' : '#fff'} strokeWidth={2.25} />
          </m.g>
        );
      })}
    </svg>
  );
}
