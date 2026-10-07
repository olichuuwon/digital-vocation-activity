import { expect, test } from '@playwright/test';

// Booth Wi-Fi drops (§11): after one visit the service worker has cached every built file, so a
// phone that goes offline can still open screens it hasn't seen yet (they load on demand).
test.use({ serviceWorkers: 'allow' });

test('after the first visit, a later stage opens offline', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play solo' })).toBeVisible();
  // Wait for the service worker to install and precache the build.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const keys = await caches.keys();
      const cache = keys.length ? await caches.open(keys[0]!) : null;
      const files: string[] = await fetch('/precache.json').then((r) => r.json());
      const cachedCount = cache ? (await cache.keys()).length : 0;
      if (cachedCount >= files.length) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('precache did not finish');
  });

  await context.setOffline(true);
  // Stage 3's code was never loaded online: it must come from the precache.
  await page.goto('/?debug=1&stage=3');
  await expect(page.getByRole('button', { name: 'Start building' })).toBeVisible();
  await page.getByRole('button', { name: 'Start building' }).click();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await context.setOffline(false);
});
