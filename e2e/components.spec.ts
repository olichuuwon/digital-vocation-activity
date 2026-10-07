import { expect, test } from '@playwright/test';

test('component gallery opens every demo and returns', async ({ page }) => {
  await page.goto('/dev/components');
  await expect(page.getByRole('heading', { name: 'Component gallery' })).toBeVisible();
  const buttons = page.locator('main li button');
  const count = await buttons.count();
  expect(count).toBeGreaterThanOrEqual(15);
  for (let i = 0; i < count; i++) {
    await page.locator('main li button').nth(i).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Leave the demo by whichever exit it offers.
    for (let guard = 0; guard < 8; guard++) {
      if (await page.getByRole('heading', { name: 'Component gallery' }).isVisible()) break;
      const exit = page.getByRole('button', { name: /Back to gallery|Continue|Ready|Got it|Next|^Start|^Go|Let's/ }).first();
      if (await exit.count()) await exit.click();
      else await page.locator('main button, section button').last().click();
    }
    await expect(page.getByRole('heading', { name: 'Component gallery' })).toBeVisible();
  }
});

test('rulebook sheet opens, lists rules and closes with Esc', async ({ page }) => {
  await page.goto('/dev/components');
  await page.getByRole('button', { name: 'Rulebook + new rule' }).click();
  await page.getByRole('button', { name: 'Rulebook' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('rule')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('gallery has no horizontal scroll at 360px with 200% text', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/dev/components');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  for (const name of [/Clean the Data/, /Meet Kubernetes/, 'Stars: 3']) {
    await page.getByRole('button', { name }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, String(name)).toBe(false);
    await page.goto('/dev/components');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  }
});
