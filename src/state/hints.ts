/**
 * No dead ends (CLAUDE.md rule 8, spec §2): after 2 failed attempts show a hint,
 * after 3 show the answer (with reduced score).
 */
export type HintLevel = 'none' | 'hint' | 'answer';

export const HINT_AFTER = 2;
export const ANSWER_AFTER = 3;

export function hintLevel(fails: number): HintLevel {
  if (fails >= ANSWER_AFTER) return 'answer';
  if (fails >= HINT_AFTER) return 'hint';
  return 'none';
}
