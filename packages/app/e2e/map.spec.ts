import { expect, test } from '@playwright/test';
import { loadExample } from './helpers';

test('a map node switches the preview to its rescaled grid and alphabet', async ({ page }) => {
  await page.goto('/');
  await loadExample(page, 'Marching squares');
  await expect(page.getByText('Halted')).toBeVisible({ timeout: 15_000 });
  // Started at 20×20 in B/W; the map draws a 3× grid in D/A.
  await expect(page.getByText('60 × 60')).toBeVisible();
  await expect
    .poll(() => page.getByLabel('Grid preview').evaluate((el) => (el as HTMLCanvasElement).width))
    .toBe(60);
  // Reset goes back to the original grid.
  await page.keyboard.press('r');
  await expect(page.getByText('20 × 20')).toBeVisible();
});
