import { expect, type Page } from '@playwright/test';

/** Load a bundled example through the gallery. */
export async function loadExample(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Examples' }).click();
  await page
    .getByRole('dialog', { name: 'Examples' })
    .getByRole('button', { name: new RegExp(`^${name}:`) })
    .click();
  await expect(page.getByTestId('project-name')).toHaveText(name);
}

export async function xml(page: Page): Promise<string> {
  await page.getByRole('tab', { name: /XML/ }).click();
  const value = await page.getByRole('textbox', { name: 'Program XML' }).inputValue();
  await page.getByRole('tab', { name: 'Inspector' }).click();
  return value;
}
