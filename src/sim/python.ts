// Stage 3 Reality Check (spec §6.4): the player's block program as real Python. Pure.
import type { Program } from '../content/stage3Schema';

export interface PythonOptions {
  /** Spaces per indent level. Default 4. */
  indent?: number;
}

const SIMPLE_LINE = {
  forward: 'move_forward()',
  left: 'turn_left()',
  right: 'turn_right()',
  drop: 'drop_supplies()',
  askAi: 'drop(ai.what_does_this_house_need())',
} as const;

/** Python source lines for a block program. An empty program (or body) is `pass`. */
export function toPython(program: Program, opts: PythonOptions = {}): string[] {
  const unit = ' '.repeat(opts.indent ?? 4);
  const out: string[] = [];
  const emit = (list: Program, depth: number): void => {
    const pad = unit.repeat(depth);
    if (list.length === 0) {
      out.push(`${pad}pass`);
      return;
    }
    for (const b of list) {
      if (b.op === 'repeat') {
        out.push(`${pad}for _ in range(${b.n}):`);
        emit(b.body, depth + 1);
      } else if (b.op === 'ifFlooded') {
        out.push(`${pad}if road_ahead_is_flooded():`);
        emit(b.then, depth + 1);
        if (b.else.length > 0) {
          out.push(`${pad}else:`);
          emit(b.else, depth + 1);
        }
      } else out.push(`${pad}${SIMPLE_LINE[b.op]}`);
    }
  };
  emit(program, 0);
  return out;
}
