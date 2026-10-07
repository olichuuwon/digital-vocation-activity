import stagesJson from './stages.json';
import copyJson from './copy.json';
import { copySchema, stagesFileSchema, type StageContent } from './schemas';
import type { Mode } from '../state/types';

// Parsed at import so bad content fails fast in dev, tests and the build.
export const stages: StageContent[] = stagesFileSchema.parse(stagesJson).stages;
export const copy = copySchema.parse(copyJson);

export function levelsFor(stage: StageContent, mode: Mode) {
  return mode === 'full' ? stage.levels : stage.levels.filter((l) => !l.bonus);
}

export function stageContent(stage: number): StageContent | undefined {
  return stages.find((s) => s.stage === stage);
}

/** Fills `{name}` placeholders in copy strings. Unknown placeholders are left as-is. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
