import aiImagesJson from '../../content/aiImages.json';
import stage2Json from '../../content/stage2.json';
import stage2CopyJson from '../../content/stage2Copy.json';
import { copy } from '../../content';
import { aiImagesFileSchema, stage2CopySchema, stage2FileSchema, type AiImage } from '../../content/stage2Schema';

// Parsed at import, like src/content/index.ts: bad content fails fast in dev, tests and the build.
export const images = aiImagesFileSchema.parse(aiImagesJson).images;
export const imagesById: ReadonlyMap<string, AiImage> = new Map(images.map((i) => [i.id, i]));
export const stage2 = stage2FileSchema.parse(stage2Json);
export const c = stage2CopySchema.parse(stage2CopyJson);
/** Shared component copy (Close, etc.). */
export const t = copy.components;
