import vercel from '../../vercel.json';
import { allowConnect, siteHeaders } from './securityHeaders';

describe('security headers (vercel.json)', () => {
  const h = siteHeaders(vercel);
  const csp = h['Content-Security-Policy'] ?? '';
  const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `));

  it('sets a CSP that only runs our own scripts and talks only to Supabase', () => {
    expect(directive('default-src')).toBe("default-src 'self'");
    expect(directive('script-src')).toBe("script-src 'self'");
    expect(directive('connect-src')).toBe("connect-src 'self' https://*.supabase.co wss://*.supabase.co");
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(csp).not.toMatch(/unsafe-eval/);
  });

  it('blocks framing (clickjacking on /host) and MIME sniffing', () => {
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Permissions-Policy']).toContain('camera=()');
  });

  it('adds extra backend origins to connect-src only', () => {
    const out = allowConnect(csp, ['https://e2e-test.supabase.co/rest', 'ws://localhost:4174', undefined, 'not a url']);
    expect(out).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co https://e2e-test.supabase.co ws://localhost:4174;");
    expect(out.split(';').length).toBe(csp.split(';').length);
    expect(allowConnect(csp, [])).toBe(csp);
  });
});
