import { fill } from '../../content';
import type { Block, BlockOp } from '../../content/stage3Schema';
import { c } from './content';

/** Icons next to block names (decorative; the name is the label). */
export const ICON: Record<BlockOp, string> = {
  forward: '⬆️',
  left: '↰',
  right: '↱',
  drop: '📦',
  repeat: '🔁',
  ifFlooded: '🌊',
  askAi: '🤖',
};

export function blockText(b: Block): string {
  if (b.op === 'repeat') return `${c.blocks.repeat} ${fill(c.editor.times, { n: b.n })}`;
  return c.blocks[b.op];
}
