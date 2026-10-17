import type { Page } from '@playwright/test';

/**
 * Starts `stage` as a replay (free play after a finished run), which unlocks the bonus levels.
 * Seeds the saved run directly, then opens the stage with ?debug=1&stage=N.
 */
export async function startReplay(page: Page, stage: number) {
  await page.goto('/');
  await page.evaluate((stage) => {
    const run = {
      stage,
      levelIndex: 0,
      scores: {
        data: { accuracy: 0.9, fixedCount: 2, ruleChosen: true },
        ai: { labelAccuracy: 0.9, earlyGuessBonus: 0.5, auditCatch: 0.5, modelAccuracy: 0.85 },
        logic: { puzzlesSolved: 3, hintsUsed: 0, efficiency: 1, extraBlocks: 0 },
        cloud: { manualUptime: 0.7, autoUptime: 0.99, costEfficiency: 1 },
        finale: { familiesReached: 900, incidentsRouted: 8 },
      },
      stars: { data: 3, ai: 3, logic: 3, cloud: 3 },
      bestFamilies: 900,
      startedAt: Date.now(),
      replays: 1,
    };
    const settings = { theme: 'system', sound: false, relaxed: false };
    localStorage.setItem('ship-it', JSON.stringify({ state: { run, bestFamilies: 900, settings }, version: 1 }));
  }, stage);
  await page.goto(`/?debug=1&stage=${stage}`);
}
