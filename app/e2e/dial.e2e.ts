import { demoHome, DIAL, dialArc, dialSlices, expect, goViaDial, openDial, test } from './fixtures';

test.describe("Kip's dial", () => {
  test('opens a four-slice arc; Escape and tapping outside close it', async ({ page }) => {
    await demoHome(page);
    const kip = page.locator('.dial__kip');
    const arc = dialArc(page);
    await expect(kip).toHaveAttribute('aria-expanded', 'false');
    await expect(arc).toHaveCount(0);

    await openDial(page);
    await expect(arc).toBeVisible();
    // Home is the current slice, and only Home
    const slices = dialSlices(page);
    await expect(slices.nth(DIAL.home)).toHaveAttribute('aria-current', 'page');
    await expect(arc.locator('[aria-current="page"]')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(arc).toHaveCount(0);
    await expect(kip).toHaveAttribute('aria-expanded', 'false');

    // the frosted backdrop behind the arc closes it too
    await openDial(page);
    await page.locator('.dial-backdrop').click({ position: { x: 20, y: 20 } });
    await expect(arc).toHaveCount(0);
    await expect(page).toHaveURL(/\/home$/);
  });

  test('navigates to Goals, Activity, Profile and back Home', async ({ page }) => {
    await demoHome(page);
    const panel = page.locator('section.panel');
    const stage = page.locator('.hub-stage');

    for (const [slice, path] of [
      [DIAL.goals, '/goals'],
      [DIAL.activity, '/activity'],
      [DIAL.profile, '/profile'],
    ] as const) {
      await goViaDial(page, slice);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      // sections open as a modal panel over home, which is hidden from assistive tech meanwhile
      // (switching sections animates one panel out while the next comes in, so wait for one)
      await expect(panel).toHaveCount(1);
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute('aria-modal', 'true');
      await expect(stage).toHaveAttribute('aria-hidden', 'true');
      await expect(dialArc(page)).toHaveCount(0);

      // the dial marks where you are; tapping Kip again folds it away and leaves you there
      await openDial(page);
      await expect(dialSlices(page).nth(slice)).toHaveAttribute('aria-current', 'page');
      await page.locator('.dial__kip').click();
      await expect(dialArc(page)).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }

    await goViaDial(page, DIAL.home);
    await expect(page).toHaveURL(/\/home$/);
    await expect(panel).toHaveCount(0);
    await expect(stage).not.toHaveAttribute('aria-hidden', 'true');
  });

  test('over an open section, Escape closes the arc first and the panel second', async ({ page }) => {
    await demoHome(page);
    await goViaDial(page, DIAL.goals);
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.locator('section.panel')).toBeVisible();

    await openDial(page);
    await page.keyboard.press('Escape');
    await expect(dialArc(page)).toHaveCount(0);
    // only the top layer should go: the Goals panel is still open
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.locator('section.panel')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.locator('section.panel')).toHaveCount(0);
  });

  test('dragging Kip onto a goal opens the money sheet for that goal', async ({ page }) => {
    await demoHome(page);
    const tile = page.locator('.tile--wide[data-feed-goal]');
    await tile.scrollIntoViewIfNeeded();
    const goalId = await tile.getAttribute('data-feed-goal');
    expect(goalId).toBeTruthy();

    const kip = page.locator('.dial__kip');
    const from = (await kip.boundingBox())!;
    const to = (await tile.boundingBox())!;
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y - 24, { steps: 4 }); // past the drag threshold
    await page.mouse.move(end.x, end.y, { steps: 16 });

    // while Kip hovers the goal, the goal lights up and the dial is in feeding mode
    await expect(tile).toHaveClass(/\bis-feed-target\b/);
    await expect(page.locator('.dial')).toHaveClass(/\bdial--feeding\b/);

    await page.mouse.up();
    await expect(tile).not.toHaveClass(/\bis-feed-target\b/);

    const sheet = page.locator('.sheet-backdrop .sheet');
    await expect(sheet).toBeVisible();
    // "put it towards" is a custom Select; its hidden input carries the chosen goal id
    await expect(sheet.locator('input[name="bucket"]')).toHaveValue(goalId!);
    // a drag is not a tap: the navigation arc stayed shut
    await expect(dialArc(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/home$/);

    await page.keyboard.press('Escape');
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
  });
});
