import { animate, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import type { RealityVisual } from '../content/schemas';

/*
 * Small decorative animations for Reality Check cards (§4.3, §5.3, §6.4, §7.2, §7.6).
 * All aria-hidden: the card text carries the meaning. framer-motion honours
 * MotionConfig reducedMotion="user" for transforms; counters jump straight to the end.
 */

const nf = new Intl.NumberFormat('en-SG');

function Counter({ from, to }: { from: number; to: number }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? to : from);
  useEffect(() => {
    if (reduce) return;
    const c = animate(from, to, { duration: 2.2, ease: 'easeIn', onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [from, to, reduce]);
  return <>{nf.format(n)}</>;
}

const Box = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>{children}</div>
);

function Pods({ count, colour = 'var(--cloud)', highlight }: { count: number; colour?: string; highlight?: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      {Array.from({ length: count }, (_, i) => (
        <motion.span
          key={i}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: i * 0.12 }}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: i === highlight ? 'var(--danger)' : colour,
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {i === highlight ? '✗' : ''}
        </motion.span>
      ))}
    </div>
  );
}

export function RealityVisualView({ visual, vars = {} }: { visual: RealityVisual; vars?: Record<string, number> }) {
  switch (visual) {
    case 'records-to-millions':
      return (
        <Box>
          <span style={{ fontSize: 14 }}>records cleaned</span>
          <strong style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums' }}>
            <Counter from={vars.handCleaned ?? 20} to={2_000_000} />
          </strong>
        </Box>
      );
    case 'training-curve':
      return (
        <svg viewBox="0 0 200 100" width="100%" height="120">
          <line x1="10" y1="90" x2="190" y2="90" stroke="currentColor" opacity="0.4" />
          <line x1="10" y1="90" x2="10" y2="10" stroke="currentColor" opacity="0.4" />
          <motion.path
            d="M10 85 C 50 70, 80 35, 190 18"
            fill="none"
            stroke="var(--ai)"
            strokeWidth="5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.8 }}
          />
          <text x="110" y="70" fontSize="12" fill="currentColor">
            accuracy ↑ with labels
          </text>
        </svg>
      );
    case 'night-road':
      return (
        <div style={{ width: '100%', background: '#0b1630', color: '#fff', borderRadius: 8, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🌙🛣️🌊</div>
          <div style={{ marginTop: 6, fontWeight: 700, border: '2px solid #fff', borderRadius: 6, display: 'inline-block', padding: '2px 8px' }}>
            AI: clear road · 91%
          </div>
        </div>
      );
    case 'blocks-to-python':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', width: '100%', fontSize: 13 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {['Repeat ×3', 'Move forward', 'Drop supplies'].map((b) => (
              <span key={b} style={{ background: 'var(--logic)', color: '#1a1200', borderRadius: 6, padding: '2px 6px', fontWeight: 700 }}>
                {b}
              </span>
            ))}
          </div>
          <span style={{ fontSize: 22 }}>→</span>
          <motion.pre initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ margin: 0, fontSize: 12 }}>
            {'for i in range(3):\n    move()\ndrop()'}
          </motion.pre>
        </div>
      );
    case 'test-maps': {
      const failing = vars.failing ?? 0;
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3, width: '100%', maxWidth: 260 }}>
          {Array.from({ length: 100 }, (_, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.015 }}
              style={{
                aspectRatio: '1',
                borderRadius: 3,
                fontSize: 9,
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                background: i < 100 - failing ? 'var(--data)' : 'var(--danger)',
              }}
            >
              {i < 100 - failing ? '✓' : '✗'}
            </motion.span>
          ))}
        </div>
      );
    }
    case 'pods':
      return <Pods count={6} />;
    case 'load-balancer':
      return (
        <Box>
          <span style={{ fontSize: 28 }}>👥👥👥</span>
          <span>⚖️ ↓ ↓ ↓</span>
          <Pods count={3} />
        </Box>
      );
    case 'autoscaler':
      return (
        <Box>
          <span>📈 busy → more pods</span>
          <Pods count={8} />
        </Box>
      );
    case 'self-healing':
      return (
        <Box>
          <Pods count={4} highlight={2} />
          <span>↻ replaced automatically</span>
          <Pods count={4} />
        </Box>
      );
    case 'rolling-update':
      return (
        <Box>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.span
                key={i}
                initial={{ background: 'var(--cloud)' }}
                animate={{ background: 'var(--data)' }}
                transition={{ delay: 0.5 + i * 0.5 }}
                style={{ width: 28, height: 28, borderRadius: 6, display: 'block' }}
              />
            ))}
          </div>
          <span>v1 → v2, a few at a time</span>
        </Box>
      );
    case 'sre-alerts':
      return (
        <Box>
          <span style={{ fontSize: 40 }}>📱🔕</span>
          <span>automation fixed 99 issues · 1 alert</span>
        </Box>
      );
  }
}
