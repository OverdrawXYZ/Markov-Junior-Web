import { expect, test } from '@playwright/test';
import { loadExample } from './helpers';

const longSearch = `<sequence values="BRWI">
  <one in="BBBBBBBB/BBBBBBBB/BBBBBBBB/BBBBBBBB/BBBBBBBB/BBBBBBBB/BBBBBBBB/BBBBBBBB" out="BBBBBBBR/BWWBBBBR/BWBBBBBR/BWBBBBBB/BWBBBBBB/BWBBBBBB/BWWBIIII/BBBBIIII" symmetry="()"/>
  <all search="True" depthCoefficient="1.0">
    <rule in="RB" out="BR"/>
    <rule in="RWB" out="BRW"/>
    <observe value="I" from="B" to="W"/>
    <observe value="B" to="BR"/>
    <observe value="W" to="BR"/>
    <observe value="R" to="BR"/>
  </all>
</sequence>`;

test('Sokoban plans its moves with search and solves the level', async ({ page }) => {
  await page.goto('/');
  await loadExample(page, 'Sokoban');
  await expect(page.getByText('Halted')).toBeVisible({ timeout: 30_000 });
});

test('a long search shows progress and can be stopped', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('spinbutton', { name: 'Grid width' }).fill('8');
  await page.getByRole('spinbutton', { name: 'Grid width' }).press('Enter');
  await page.getByRole('spinbutton', { name: 'Grid height' }).fill('8');
  await page.getByRole('spinbutton', { name: 'Grid height' }).press('Enter');
  await page.getByRole('tab', { name: /XML/ }).click();
  await page.getByRole('textbox', { name: 'Program XML' }).fill(longSearch);
  await expect(page.getByText(/Searching… [\d,]+ states/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Stop search' }).click();
  await expect(page.getByText('Paused')).toBeVisible();
  await expect(page.getByText(/Searching…/)).toHaveCount(0);
  // The engine works again after the restart.
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await expect(page.getByTestId('step-count')).toHaveText('Step 1');
});
