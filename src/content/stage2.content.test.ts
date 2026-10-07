import aiImagesJson from './aiImages.json';
import stage2Json from './stage2.json';
import stage2CopyJson from './stage2Copy.json';
import { aiImagesFileSchema, LABELS, stage2CopySchema, stage2FileSchema } from './stage2Schema';
import {
  auditPoolProblems,
  buildBoxDeck,
  buildLabelDeck,
  buildTutorialDeck,
  indexImages,
  labelOptions,
  mulberry32,
} from '../stages/ai/logic';

const images = aiImagesFileSchema.parse(aiImagesJson).images;
const stage2 = stage2FileSchema.parse(stage2Json);
const byId = indexImages(images);

describe('stage 2 content', () => {
  it('stage2Copy.json matches its schema (word limits included)', () => {
    const r = stage2CopySchema.safeParse(stage2CopyJson);
    if (!r.success) console.error(r.error.issues);
    expect(r.success).toBe(true);
  });

  it('aiImages.json and stage2.json match their schemas', () => {
    expect(aiImagesFileSchema.safeParse(aiImagesJson).success).toBe(true);
    expect(stage2FileSchema.safeParse(stage2Json).success).toBe(true);
  });

  it('every image records a source and licence (§5.4)', () => {
    for (const i of images) expect(i.source && i.licence).toBeTruthy();
  });

  it('the audit pool can always deal a legal set and points at real images', () => {
    expect(auditPoolProblems(stage2.audit.pool, byId, stage2.audit)).toEqual([]);
  });

  it('the audit pool includes the night "clear road" mistake behind the Reality Check (§5.3)', () => {
    const night = stage2.audit.pool.filter((a) => {
      const img = byId.get(a.imageId)!;
      return img.variant === 'night' && img.label === 'flooded-road' && a.predicted === 'clear-road' && a.confidence >= stage2.audit.high;
    });
    expect(night.length).toBeGreaterThan(0);
  });

  it('decks deal from the real content for many seeds, never with night images in training', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      const tut = buildTutorialDeck(images, stage2.tutorial.count, rng);
      const l1 = buildLabelDeck(images, stage2.label.count, rng);
      const l2 = buildLabelDeck(images, stage2.covered.count, rng);
      const l3 = buildBoxDeck(images, stage2.box.count, rng);
      expect(tut).toHaveLength(stage2.tutorial.count);
      expect(l1).toHaveLength(stage2.label.count);
      expect(l2).toHaveLength(stage2.covered.count);
      expect(l3).toHaveLength(stage2.box.count);
      for (const img of [...tut, ...l1, ...l2]) expect(img.variant).toBe('day');
      for (const img of l1) {
        const opts = labelOptions(img.label, stage2.label.options, stage2.confusable, rng);
        expect(new Set(opts).size).toBe(stage2.label.options);
        expect(opts).toContain(img.label);
      }
    }
  });

  it('the field guide has an entry for every label (screen-reader alt text uses it)', () => {
    const copy = stage2CopySchema.parse(stage2CopyJson);
    for (const l of LABELS) expect(copy.fieldGuide.entries[l].length).toBeGreaterThan(5);
  });
});
