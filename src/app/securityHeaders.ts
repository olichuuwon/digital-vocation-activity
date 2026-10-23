// The security headers live in vercel.json (the production host). `vite preview` serves the
// same ones so the e2e suite runs under the real Content-Security-Policy. Pure, for tests.

interface VercelHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/** The headers vercel.json sets on every path. */
export function siteHeaders(vercel: { headers?: VercelHeaderRule[] }): Record<string, string> {
  const rule = vercel.headers?.find((h) => h.source === '/(.*)');
  return Object.fromEntries((rule?.headers ?? []).map((h) => [h.key, h.value]));
}

/** Adds origins to the CSP's connect-src (a local Supabase stand-in or the e2e relay). */
export function allowConnect(csp: string, urls: (string | undefined)[]): string {
  const extra = urls.flatMap((u) => {
    if (!u) return [];
    try {
      return [new URL(u).origin];
    } catch {
      return [];
    }
  });
  if (!extra.length) return csp;
  return csp
    .split(';')
    .map((d) => (d.trim().startsWith('connect-src ') ? `${d.trim()} ${extra.join(' ')}` : d.trim()))
    .join('; ');
}
