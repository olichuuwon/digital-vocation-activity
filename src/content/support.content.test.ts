import supportCopyJson from './supportCopy.json';
import { supportCopySchema } from './supportSchema';

describe('support cards content', () => {
  it('supportCopy.json matches its schema (word limits included)', () => {
    const r = supportCopySchema.safeParse(supportCopyJson);
    if (!r.success) console.error(r.error.issues);
    expect(r.success).toBe(true);
  });
});
