import stage3Json from '../../content/stage3.json';
import stage3CopyJson from '../../content/stage3Copy.json';
import { copy } from '../../content';
import { stage3CopySchema, stage3FileSchema } from '../../content/stage3Schema';

// Parsed at import, like src/content/index.ts: bad content fails fast in dev, tests and the build.
export const stage3 = stage3FileSchema.parse(stage3Json);
export const c = stage3CopySchema.parse(stage3CopyJson);
/** Shared component copy (Close, Hint, etc.). */
export const t = copy.components;
