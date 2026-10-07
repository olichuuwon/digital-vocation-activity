import blocklistJson from './blocklist.json';
import groupCopyJson from './groupCopy.json';
import groupNamesJson from './groupNames.json';
import { blocklistSchema, groupCopySchema, groupNamesSchema } from './groupSchema';

describe('group content', () => {
  it('groupCopy.json matches its schema (support text ≤ 15 words)', () => {
    const r = groupCopySchema.safeParse(groupCopyJson);
    if (!r.success) console.error(r.error.issues);
    expect(r.success).toBe(true);
  });

  it('groupNames.json and blocklist.json match their schemas', () => {
    expect(groupNamesSchema.safeParse(groupNamesJson).success).toBe(true);
    const b = blocklistSchema.parse(blocklistJson);
    expect(new Set(b.anywhere).size).toBe(b.anywhere.length);
    expect(new Set(b.words).size).toBe(b.words.length);
  });
});
