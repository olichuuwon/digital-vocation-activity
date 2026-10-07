import finaleJson from './finale.json';
import finaleCopyJson from './finaleCopy.json';
import { finaleCopySchema, finaleFileSchema } from './finaleSchema';

describe('finale content', () => {
  it('finaleCopy.json matches its schema and covers every incident and rank', () => {
    const r = finaleCopySchema.safeParse(finaleCopyJson);
    if (!r.success) console.error(r.error.issues);
    expect(r.success).toBe(true);
    const f = finaleFileSchema.parse(finaleJson);
    const c = finaleCopySchema.parse(finaleCopyJson);
    for (const i of f.incidents) expect(c.incidents[i.id]).toBeDefined();
    for (const k of f.ranks) expect(c.debrief.ranks[k.id]).toBeTruthy();
  });
});
