import { accountId, demoHome, enterDemo, expect, readStorage, settle, skipTour, test, TEXT, tourKey, vaultTotal } from './fixtures';

test.describe('getting in and out', () => {
  test('welcome → demo home loads with no console errors', async ({ page, consoleErrors }) => {
    await page.goto('/welcome');
    await expect(page.locator('.welcome')).toBeVisible();
    // the big Kip on the welcome screen is drawn with WebGL2 (it falls back to <img> poses without it)
    await expect(page.locator('.welcome .seal.seal--gl canvas.seal-canvas')).toBeVisible();

    await page.locator('.welcome .btn--ghost').click();
    await expect(page).toHaveURL(/\/home$/);

    // the demo home: vault with a non-zero total, the primary goal, streak and sleep-on-it tiles, Kip's dial
    await expect(page.locator('[data-tour="vault"]')).toBeVisible();
    await expect.poll(() => vaultTotal(page)).toBeGreaterThan(0);
    await expect(page.locator('.tile--wide[data-tour="goal"][data-feed-goal]')).toBeVisible();
    await expect(page.locator('.tile--streak[data-tour="streak"]')).toBeVisible();
    await expect(page.locator('.tile--sleep[data-tour="sleep"]')).toBeVisible();
    await expect(page.locator('.dial__kip')).toBeVisible();

    await skipTour(page);
    await settle(page, 500);
    expect(consoleErrors).toEqual([]);
  });

  test('sign out returns to welcome and guards the signed-in pages', async ({ page }) => {
    await demoHome(page);

    const out = page.locator('.home2__out a[href="/logout"]');
    await expect(out).toHaveText(TEXT.signOut);
    await out.click();

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.locator('.welcome')).toBeVisible();
    expect(await readStorage(page, 'kept.session')).toBeNull();

    // signed-in screens bounce back to welcome
    await page.goto('/home');
    await expect(page).toHaveURL(/\/welcome$/);

    // the demo account (and its "tour seen" flag) survives signing out: no tour the second time
    await page.locator('.welcome .btn--ghost').click();
    await expect(page).toHaveURL(/\/home$/);
    await settle(page);
    await expect(page.locator('.tour')).toBeHidden();
  });
});

test.describe('first-run tour', () => {
  const STOPS = ['[data-tour="vault"]', '[data-tour="goal"]', '[data-tour="streak"]', '[data-tour="sleep"]', '.dial__kip'];

  /** True when the tour's highlight frames the centre of the element this stop is about. */
  const holeFrames = (page: import('@playwright/test').Page, selector: string) =>
    page.evaluate((sel) => {
      const hole = document.querySelector('.tour__hole')?.getBoundingClientRect();
      const el = document.querySelector(sel)?.getBoundingClientRect();
      if (!hole || !el) return false;
      const cx = el.left + el.width / 2;
      const cy = el.top + el.height / 2;
      return cx > hole.left && cx < hole.right && cy > hole.top && cy < hole.bottom;
    }, selector);

  test('walks through all five stops and stays done after a reload', async ({ page }) => {
    await enterDemo(page);
    const tour = page.locator('.tour');
    await expect(tour).toBeVisible({ timeout: 6_000 });
    await expect(tour).toHaveAttribute('role', 'dialog');

    for (let i = 0; i < STOPS.length; i++) {
      const last = i === STOPS.length - 1;
      const dots = tour.locator('.tour__dots i');
      await expect(dots).toHaveCount(STOPS.length);
      await expect(dots.nth(i)).toHaveAttribute('data-on', 'true');
      await expect(tour.locator('.tour__dots i[data-on]')).toHaveCount(1);
      await expect.poll(() => holeFrames(page, STOPS[i]), { message: `stop ${i + 1} highlights ${STOPS[i]}` }).toBe(true);
      // Skip is offered on every stop but the last
      await expect(tour.locator('.tour__skip')).toHaveCount(last ? 0 : 1);

      const primary = tour.locator('.tour__card .btn--primary');
      await expect(primary).toHaveText(last ? TEXT.gotIt : TEXT.next);
      await primary.click();
    }

    await expect(tour).toBeHidden();
    expect(await readStorage(page, tourKey(await accountId(page)))).toBe('done');

    await page.reload();
    await expect(page.locator('[data-tour="vault"]')).toBeVisible();
    await settle(page);
    await expect(tour).toBeHidden();
  });

  test('Skip closes it for good; the header button replays it', async ({ page }) => {
    await enterDemo(page);
    await skipTour(page);
    expect(await readStorage(page, tourKey(await accountId(page)))).toBe('done');

    await page.reload();
    await expect(page.locator('[data-tour="vault"]')).toBeVisible();
    await settle(page);
    await expect(page.locator('.tour')).toBeHidden();

    // "How it works" in the header starts it again from the first stop; Escape closes it
    await page.locator('.home2__out .home2__tour').click();
    const tour = page.locator('.tour');
    await expect(tour).toBeVisible();
    await expect(tour.locator('.tour__dots i').first()).toHaveAttribute('data-on', 'true');
    await page.keyboard.press('Escape');
    await expect(tour).toBeHidden();
  });
});
