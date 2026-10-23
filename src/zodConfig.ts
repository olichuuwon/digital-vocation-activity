import { z } from 'zod/v4';

// Every `import … from 'zod'` resolves here (vite.config.ts alias), so this runs before any schema
// parses, whatever order the bundle's chunks load in. The site's Content-Security-Policy forbids
// eval, so zod must not probe for it with `new Function`: the browser would still report the
// caught attempt as a violation.
z.config({ jitless: true });

export * from 'zod/v4';
export { z };
