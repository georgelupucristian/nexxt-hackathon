import { accountId, demoHome, enterDemo, expect, readStorage, settle, skipTour, test, TEXT, tourKey } from './fixtures';

test.describe('getting in and out', () => {
  test('welcome → demo home loads with no console errors', async ({ page, consoleErrors }) => {
    await page.goto('/welcome');
    await expect(page.getByRole('heading', { name: 'Saving on a student budget? Totally doable.' })).toBeVisible();
    // Kip's video plays behind the welcome screen
    await expect(page.locator('video').first()).toBeAttached();

    await page.locator('.onb__demo').click();
    await expect(page).toHaveURL(/\/home$/);

    // the demo home, top to bottom: the streak card, the goals card (this month, the ring, one row
    // per goal with its plan, "New goal"), the one money button, recent activity, "Sleep on it"
    await expect(page.locator('.streakd[data-tour="streak"]')).toBeVisible();
    const goals = page.locator('.cop');
    await expect(goals.locator('[data-tour="vault"]')).toBeVisible();
    await expect(goals.locator('.cop__ring[data-tour="goal"]')).toBeVisible();
    await expect(goals.locator('.cop__goal').first()).toBeVisible();
    await expect(goals.locator('.cop__goal .goal-tile').first()).toBeVisible();
    await expect(goals.locator('.cop__plan').first()).toHaveText(/lei a (week|month)|Save when you can/);
    await expect(goals.locator('a.cop__new')).toHaveAttribute('href', '/goals/new');
    await expect(page.locator('.savebtn--fun[data-tour="save"]')).toBeVisible();
    await expect(page.locator('.txl')).toBeVisible();
    await expect(page.locator('.sleeprow[data-tour="sleep"]')).toBeAttached();
    // Kip appears once on home, inside the ring (the flames on done days and goal pictures aren't Kip)
    await expect(page.locator('.home6 img[src*="/mascot/pose-"]')).toHaveCount(1);
    await expect(page.locator('.cop__kip img')).toBeVisible();
    await expect(page.locator('.dial__kip')).toBeVisible();
    // the header is the wordmark, reminders and the tour button; signing out lives in Profile
    await expect(page.locator('.top7 .top7__brand')).toHaveText('Kip');
    await expect(page.locator('.home6 a[href="/logout"]')).toHaveCount(0);

    await skipTour(page);
    await settle(page, 500);
    expect(consoleErrors).toEqual([]);
  });

  test('sign out returns to welcome and guards the signed-in pages', async ({ page }) => {
    await demoHome(page);
    // not a main action on home any more (it moved to Profile); the route still signs you out
    await expect(page.locator('.hub-stage').getByText(TEXT.signOut)).toHaveCount(0);
    await page.goto('/logout');

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('heading', { name: 'Saving on a student budget? Totally doable.' })).toBeVisible();
    expect(await readStorage(page, 'kept.session')).toBeNull();

    // signed-in screens bounce back to welcome
    await page.goto('/home');
    await expect(page).toHaveURL(/\/welcome$/);

    // the demo account (and its "tour seen" flag) survives signing out: no tour the second time
    await page.locator('.onb__demo').click();
    await expect(page).toHaveURL(/\/home$/);
    await settle(page);
    await expect(page.locator('.tour')).toBeHidden();
  });
});

test.describe('first-run tour', () => {
  // The tour points at what's on home, top to bottom: the week, the goals card, a goal row,
  // "New goal", the money button, the activity list, "Sleep on it", then Kip's dial. A stop
  // whose target isn't on the page is left out; the demo home has all eight.
  const STOPS = [
    '[data-testid="friends-link"]',
    '.top7__icon[aria-label="Reminders"]',
    '.top7__icon[aria-label="How it works"]',
    '[data-tour="streak"] .streakd__week',
    '[data-tour="vault"]',
    '.cop__goal',
    '.cop__new',
    '[data-tour="save"]',
    '.txl',
    '[data-tour="sleep"]',
    '.dial__kip',
  ];

  /** True when the tour's spotlight frames the centre of the element this stop is about. */
  const holeFrames = (page: import('@playwright/test').Page, selector: string) =>
    page.evaluate((sel) => {
      const hole = document.querySelector('.tour__hole')?.getBoundingClientRect();
      const el = document.querySelector(sel)?.getBoundingClientRect();
      if (!hole || !el) return false;
      const cx = el.left + el.width / 2;
      const cy = el.top + el.height / 2;
      return cx > hole.left && cx < hole.right && cy > hole.top && cy < hole.bottom;
    }, selector);

  test('walks through every stop and stays done after a reload', async ({ page }) => {
    await enterDemo(page);
    const tour = page.locator('.tour');
    await expect(tour).toBeVisible({ timeout: 6_000 });
    await expect(tour).toHaveAttribute('role', 'dialog');

    const bar = tour.locator('.tour__segs');
    const segs = tour.locator('.tour__seg');
    await expect(segs).toHaveCount(STOPS.length);
    await expect(bar).toHaveAttribute('aria-valuemax', String(STOPS.length));

    for (let i = 0; i < STOPS.length; i++) {
      const last = i === STOPS.length - 1;
      // the bar fills up to the current stop
      await expect(bar).toHaveAttribute('aria-valuenow', String(i + 1));
      await expect(tour.locator('.tour__seg[data-on]')).toHaveCount(i + 1);
      await expect.poll(() => holeFrames(page, STOPS[i]), { message: `stop ${i + 1} highlights ${STOPS[i]}` }).toBe(true);
      // Skip is offered on every stop but the last
      await expect(tour.locator('.tour__skip')).toHaveCount(last ? 0 : 1);

      const next = tour.locator('.tour__next');
      await expect(next).toHaveText(last ? /^Done$/ : TEXT.next);
      await next.click();
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

    // the "?" in the header starts it again from the first stop; Escape closes it
    await page.locator('.top7 button.top7__icon[aria-label="How it works"]').click();
    const tour = page.locator('.tour');
    await expect(tour).toBeVisible();
    await expect(tour.locator('.tour__segs')).toHaveAttribute('aria-valuenow', '1');
    await expect(tour.locator('.tour__seg').first()).toHaveAttribute('data-on', 'true');
    await expect(tour.locator('.tour__seg[data-on]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(tour).toBeHidden();
  });
});
