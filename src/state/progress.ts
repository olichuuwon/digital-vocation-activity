import { hasBonus, levelsFor, stageContent } from '../content';
import type { Stage } from './types';

export interface Position {
  stage: Stage;
  levelIndex: number;
}

/** Where the run goes after the current level is finished. Stage 5 (finale) is terminal. */
export function nextPosition(pos: Position & { replays?: number }): Position {
  if (pos.stage === 0) return { stage: 1, levelIndex: 0 };
  if (pos.stage === 5) return pos;
  const content = stageContent(pos.stage);
  const count = content ? levelsFor(content, hasBonus(pos)).length : 0;
  if (pos.levelIndex + 1 < count) return { stage: pos.stage, levelIndex: pos.levelIndex + 1 };
  return { stage: (pos.stage + 1) as Stage, levelIndex: 0 };
}
