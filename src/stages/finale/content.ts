import finaleJson from '../../content/finale.json';
import finaleCopyJson from '../../content/finaleCopy.json';
import { copy } from '../../content';
import { finaleCopySchema, finaleFileSchema } from '../../content/finaleSchema';

// Parsed at import, like src/content/index.ts: bad content fails fast in dev, tests and the build.
export const finale = finaleFileSchema.parse(finaleJson);
export const c = finaleCopySchema.parse(finaleCopyJson);
export const t = copy.components;
