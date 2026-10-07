import type { AiImage } from '../../content/stage2Schema';
import { SceneArt } from './Art';
import s from './ai.module.css';

/**
 * Covered Up (§5.1 L2): the picture under a grid×grid of tiles. `order` is the reveal order and
 * the first `shown` tiles are lifted. Tiles are drawn in the same SVG, so they scale with it.
 */
export function CoveredBoard({
  image,
  title,
  grid,
  order,
  shown,
}: {
  image: AiImage;
  title: string;
  grid: number;
  order: readonly number[];
  shown: number;
}) {
  const size = 100 / grid;
  const lifted = new Set(order.slice(0, shown));
  return (
    <div className={s.frame} data-testid="covered" data-shown={shown}>
      <SceneArt image={image} title={title}>
        {Array.from({ length: grid * grid }, (_, i) => {
          const col = i % grid;
          const row = Math.floor(i / grid);
          return (
            <g key={i} className={s.tile} style={{ opacity: lifted.has(i) ? 0 : 1 }} aria-hidden="true">
              <rect
                x={col * size}
                y={row * size}
                width={size}
                height={size}
                fill={(row + col) % 2 ? '#5b3fd1' : '#6d4ee6'}
                stroke="#2b1a80"
                strokeWidth="0.6"
              />
              <text
                x={col * size + size / 2}
                y={row * size + size / 2 + 3.5}
                textAnchor="middle"
                fontSize="10"
                fontWeight="800"
                fill="#d9ccff"
              >
                ?
              </text>
            </g>
          );
        })}
      </SceneArt>
    </div>
  );
}
