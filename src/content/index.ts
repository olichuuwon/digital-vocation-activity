import stagesJson from './stages.json';
import copyJson from './copy.json';
import briefingsJson from './briefings.json';
import rulebookJson from './rulebook.json';
import realityChecksJson from './realityChecks.json';
import flagsJson from './flags.json';
import {
  briefingsFileSchema,
  copySchema,
  flagsSchema,
  realityChecksFileSchema,
  rulebookFileSchema,
  stagesFileSchema,
  type Briefing,
  type RealityCheckContent,
  type StageContent,
} from './schemas';
import type { Mode } from '../state/types';

// Parsed at import so bad content fails fast in dev, tests and the build.
export const stages: StageContent[] = stagesFileSchema.parse(stagesJson).stages;
export const copy = copySchema.parse(copyJson);
export const briefings = briefingsFileSchema.parse(briefingsJson).briefings;
export const rulebook = rulebookFileSchema.parse(rulebookJson);
export const realityChecks = realityChecksFileSchema.parse(realityChecksJson).checks;
export const flags = flagsSchema.parse(flagsJson);

export function briefingFor(stage: number): Briefing | undefined {
  return briefings.find((b) => b.stage === stage);
}

export function realityCheck(id: RealityCheckContent['id']): RealityCheckContent {
  const c = realityChecks.find((r) => r.id === id);
  if (!c) throw new Error(`Missing reality check ${id}`);
  return c;
}

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
