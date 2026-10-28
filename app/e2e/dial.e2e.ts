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

  test('Kip stays put: dragging the home button does not move it', async ({ page }) => {
    await demoHome(page);
    const kip = page.locator('.dial__kip');
    const before = (await kip.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x - 120, before.y - 200, { steps: 12 });
    const during = (await kip.boundingBox())!;
    expect(during.x).toBeCloseTo(before.x, 0);
    expect(during.y).toBeCloseTo(before.y, 0);
    await page.mouse.up();
  });

});
