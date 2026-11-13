import { expect, test, type Page } from '@playwright/test';
import { loadExample, xml } from './helpers';

function canvasColours(page: Page): Promise<string[]> {
  return page.getByLabel('Grid preview').evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const colours = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      colours.add(
        [data[i], data[i + 1], data[i + 2]].map((v) => v!.toString(16).padStart(2, '0')).join(''),
      );
    }
    return [...colours].sort();
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await loadExample(page, 'Basic');
  await expect(page.getByRole('treeitem', { name: 'one' })).toBeVisible();
});

test('build a rule visually and watch the engine run it', async ({ page }) => {
  const tree = page.getByRole('tree', { name: 'Program tree' });

  // A new symbol, then paint the rule's output with it by dragging.
  await page.getByRole('button', { name: '+ Add symbol' }).click();
  await page.getByRole('button', { name: 'Add R', exact: true }).click();
  await tree.getByRole('treeitem', { name: 'rule B to W' }).click();
  await page.getByRole('button', { name: 'Brush R' }).click();
  await page.getByRole('button', { name: 'Wider' }).click();
  const out = page.getByRole('grid', { name: 'Output pattern' });
  const box = (await out.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  // Input: B then anything.
  expect(await xml(page)).toBe('<one values="BWR" in="B*" out="RR"/>\n');

  await page.getByRole('button', { name: 'Run to end' }).click();
  await expect(page.getByText('Halted')).toBeVisible({ timeout: 15_000 });
  // Every cell ends up R (FF004D): with full symmetry a B always has a neighbour to pair with.
  await expect.poll(() => canvasColours(page)).toEqual(['ff004d']);
});

test('drag nodes from the toolbar and within the tree', async ({ page }) => {
  const tree = page.getByRole('tree', { name: 'Program tree' });
  await tree.getByRole('treeitem', { name: 'one' }).click();
  await page.getByRole('button', { name: 'Add all node' }).click();
  await page
    .getByRole('button', { name: 'Add sequence node' })
    .dragTo(tree.getByRole('treeitem', { name: 'markov' }));
  await tree
    .getByRole('treeitem', { name: 'all', exact: true })
    .dragTo(tree.getByRole('treeitem', { name: 'sequence' }));
  const seq = tree.getByRole('treeitem', { name: 'sequence' });
  const h = (await seq.boundingBox())!.height;
  await tree
    .getByRole('treeitem', { name: 'one', exact: true })
    .dragTo(seq, { targetPosition: { x: 20, y: h - 2 } });
  expect(await xml(page)).toBe(`<markov values="BW">
  <sequence>
    <all in="B" out="W"/>
  </sequence>
  <one in="B" out="W"/>
</markov>
`);

  // Ctrl+Z walks the history back to the start.
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
  expect(await xml(page)).toBe('<one values="BW" in="B" out="W"/>\n');
});

test('edits in XML show up in the tree and vice versa', async ({ page }) => {
  await page.getByRole('tab', { name: /XML/ }).click();
  await page
    .getByRole('textbox', { name: 'Program XML' })
    .fill('<sequence values="BW">\n  <all in="B" out="W" comment="paint it"/>\n</sequence>');
  await page.getByRole('tab', { name: 'Inspector' }).click();
  const node = page.getByRole('treeitem', { name: 'all paint it' });
  await expect(node).toBeVisible();
  await node.click();
  await page.getByPlaceholder('What does this step do?').fill('fill everything');
  expect(await xml(page)).toContain('comment="fill everything"');
});
