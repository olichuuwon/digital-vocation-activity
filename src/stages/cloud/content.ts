import stage4CopyJson from '../../content/stage4Copy.json';
import { copy } from '../../content';
import { stage4CopySchema } from '../../content/stage4Schema';

// Parsed at import, like src/content/index.ts: bad content fails fast in dev, tests and the build.
export const c = stage4CopySchema.parse(stage4CopyJson);
/** Shared component copy (Continue, Hint, etc.). */
export const t = copy.components;
