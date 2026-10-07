import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// public/sw.js isn't bundled or type-checked: a syntax error would silently stop all caching.
describe('service worker', () => {
  it('parses', () => {
    const src = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');
    expect(() => new Function('self', 'caches', 'fetch', src)).not.toThrow();
  });
});
