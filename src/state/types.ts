// Game state shape from spec §3.1. All score values are normalised 0–1 unless noted.
export type Mode = 'booth' | 'full';
export type Stage = 0 | 1 | 2 | 3 | 4 | 5; // 0 = prologue, 5 = finale
export type Discipline = 'data' | 'ai' | 'logic' | 'cloud';
export type StarCount = 0 | 1 | 2 | 3;

export interface Scores {
  data: { accuracy: number; fixedCount: number; ruleChosen: boolean };
  ai: { labelAccuracy: number; earlyGuessBonus: number; auditCatch: number; modelAccuracy: number };
  /** hintsUsed and extraBlocks feed logicScore (§3.2); extraBlocks = blocks over par, summed. */
  logic: { puzzlesSolved: number; hintsUsed: number; efficiency: number; extraBlocks: number };
  cloud: { manualUptime: number; autoUptime: number; costEfficiency: number };
  finale: { familiesReached: number; incidentsRouted: number };
}

export interface GameState {
  mode: Mode;
  stage: Stage;
  levelIndex: number;
  scores: Scores;
  stars: Record<Discipline, StarCount>;
  bestFamilies: number;
  startedAt: number;
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  sound: boolean; // off by default (§3.3)
  relaxed: boolean; // ×1.5 timers (§10)
}
