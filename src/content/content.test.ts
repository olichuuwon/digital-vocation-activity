import stagesJson from './stages.json';
import copyJson from './copy.json';
import { copySchema, stagesFileSchema } from './schemas';
import { fill, levelsFor, stages } from './index';
import briefingsJson from './briefings.json';
import rulebookJson from './rulebook.json';
import realityChecksJson from './realityChecks.json';
import { briefingsFileSchema, REALITY_DEFAULTS, realityChecksFileSchema, rulebookFileSchema } from './schemas';

describe('content', () => {
  it('stages.json matches its schema', () => {
    expect(stagesFileSchema.safeParse(stagesJson).success).toBe(true);
  });

  it('copy.json matches its schema', () => {
    expect(copySchema.safeParse(copyJson).success).toBe(true);
  });

  it('has stages 1–4 in order with unique level ids', () => {
    expect(stages.map((s) => s.stage)).toEqual([1, 2, 3, 4]);
    const ids = stages.flatMap((s) => s.levels.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('booth mode drops bonus levels only', () => {
    for (const s of stages) {
      expect(levelsFor(s, 'full')).toHaveLength(s.levels.length);
      expect(levelsFor(s, 'booth').every((l) => !l.bonus)).toBe(true);
      expect(levelsFor(s, 'booth').length).toBeGreaterThan(0);
    }
  });
});

describe('fill', () => {
  it('replaces known placeholders and leaves unknown ones', () => {
    expect(fill('Top 50 on {date}', { date: '7 Oct 2026' })).toBe('Top 50 on 7 Oct 2026');
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });

  it('briefings, rulebook and reality checks match their schemas (word limits included)', () => {
    for (const [name, schema, json] of [
      ['briefings', briefingsFileSchema, briefingsJson],
      ['rulebook', rulebookFileSchema, rulebookJson],
      ['realityChecks', realityChecksFileSchema, realityChecksJson],
    ] as const) {
      const r = schema.safeParse(json);
      expect(r.success, `${name}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it('has one briefing per stage and rules 1–5 in order', () => {
    expect(briefingsFileSchema.parse(briefingsJson).briefings.map((b) => b.stage).sort()).toEqual([1, 2, 3, 4]);
    expect(rulebookFileSchema.parse(rulebookJson).rules.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('every Reality Check placeholder has a default', () => {
    const known = Object.keys(REALITY_DEFAULTS);
    for (const check of realityChecksFileSchema.parse(realityChecksJson).checks) {
      for (const card of check.cards) {
        for (const [, name] of `${card.title ?? ''} ${card.body}`.matchAll(/\{(\w+)\}/g)) {
          expect(known, `${check.id}: {${name}}`).toContain(name);
        }
      }
    }
  });
});
