import stage3CopyJson from './stage3Copy.json';
import { stage3CopySchema } from './stage3Schema';

describe('stage 3 content', () => {
  it('stage3Copy.json matches its schema (word limits included)', () => {
    const r = stage3CopySchema.safeParse(stage3CopyJson);
    if (!r.success) console.error(r.error.issues);
    expect(r.success).toBe(true);
  });
});
