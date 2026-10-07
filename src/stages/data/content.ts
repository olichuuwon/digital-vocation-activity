import recordsJson from '../../content/records.json';
import stage1Json from '../../content/stage1.json';
import stage1CopyJson from '../../content/stage1Copy.json';
import { recordsFileSchema, stage1CopySchema, stage1FileSchema } from '../../content/stage1Schema';

// Parsed at import, like src/content/index.ts: bad content fails fast in dev, tests and the build.
export const records = recordsFileSchema.parse(recordsJson).records;
export const stage1 = stage1FileSchema.parse(stage1Json);
export const c = stage1CopySchema.parse(stage1CopyJson);
