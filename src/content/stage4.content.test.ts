import stage4CopyJson from './stage4Copy.json';
import { stage4CopySchema } from './stage4Schema';

describe('stage 4 content', () => {
  it('stage4Copy.json matches its schema (word limits included)', () => {
    const r = stage4CopySchema.safeParse(stage4CopyJson);
    if (!r.success) console.error(r.error.issues);
    expect(r.success).toBe(true);
  });
});
