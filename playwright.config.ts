import { defineConfig, devices } from '@playwright/test';
import { E2E_SUPABASE_URL } from './e2e/supabaseMock';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    // Sandboxes with a pre-installed Chromium can point at it (PW_CHROMIUM_PATH=/opt/pw-browsers/chromium/...).
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'iphone-12', use: { ...devices['iPhone 12'], browserName: 'chromium' } },
    { name: 'pixel-5', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run build -- --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4173 --strictPort',
    port: 4173,
    // Never reuse a server: a locally running real-env preview could write to the real DB.
    reuseExistingServer: false,
    timeout: 120_000,
    // e2e builds talk to a fake Supabase host that specs mock with page.route (no real
    // backend in CI). Real env vars beat .env.local, so real keys never reach e2e builds.
    env: { VITE_SUPABASE_URL: E2E_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: 'sb_publishable_e2e' },
  },
});
