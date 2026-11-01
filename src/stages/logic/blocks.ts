import { fill } from '../../content';
import type { Block, BlockOp } from '../../content/stage3Schema';
import { c } from './content';
import type { IconName } from '../../components/Icon';

/** Icons next to block names (decorative; the name is the label). */
export const ICON: Record<BlockOp, IconName> = {
  forward: 'up',
  left: 'left',
  right: 'right',
  drop: 'box',
  repeat: 'repeat',
  ifFlooded: 'flood',
  askAi: 'bot',
};

export function blockText(b: Block): string {
  if (b.op === 'repeat') return `${c.blocks.repeat} ${fill(c.editor.times, { n: b.n })}`;
  return c.blocks[b.op];
}
