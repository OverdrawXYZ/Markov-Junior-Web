import { expect, test } from '@playwright/test';

test('app shell loads without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'MarkovJunior Web' })).toBeVisible();
  await expect(page.getByRole('main', { name: 'Preview' })).toBeVisible();
  expect(errors).toEqual([]);
});
