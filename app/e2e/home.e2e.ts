import { demoHome, expect, flowValue, test, TEXT } from './fixtures';

test.describe('home actions', () => {
  test('quick record into the main goal raises the goal card amount', async ({ page }) => {
    await demoHome(page);
    const card = page.locator('[data-tour="vault"]');
    const button = card.locator('.qr__btn');
    const amount = () => flowValue(card.locator('.goalc__amount number-flow-react'));

    await button.click();
    const open = card.locator('.qr--open');
    await expect(open).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(open.locator('.qr__input input')).toBeFocused();
    // the main goal is preselected
    await expect(open.locator('.qr__goal[role="radio"]').first()).toHaveAttribute('aria-checked', 'true');

    const before = await amount();
    await open.locator('.qr__input input').fill('37');
    await button.click(); // the same button now says Save
    await expect(page.locator('.party')).toBeVisible();
    await expect(card.locator('.qr--open')).toHaveCount(0);
    // demo transfers start pending and count once the simulated sync confirms them (~4 s);
    // the same sync also confirms the seed's pending 40 lei for this goal, hence "at least"
    await expect.poll(amount, { timeout: 15_000 }).toBeGreaterThanOrEqual(before + 37);
  });

  test('streak check-in plays the streak moment; Continue closes it', async ({ page }) => {
    await demoHome(page);
    const tile = page.locator('.streak2');
    await expect(tile.locator('.streak2__btn')).toBeVisible();
    const before = await flowValue(tile.locator('.streak2__count number-flow-react'));

    await tile.locator('.streak2__btn').click();
    const moment = page.locator('.streak-moment');
    await expect(moment).toBeVisible();
    await expect(moment).toHaveAttribute('role', 'dialog');
    await expect(moment.locator('.streak-hero__kip .seal')).toBeVisible();
    // the flame is a WebGL canvas (it degrades to an icon without WebGL2)
    await expect(moment.locator('.streak-hero__fire canvas')).toBeVisible();
    await expect(moment.locator('.streak-week')).toBeVisible();
    await expect(moment.locator('.streak-week__dot')).toHaveCount(7);
    await expect(moment.locator('.streak-week__dot.is-today')).toHaveClass(/\bis-done\b/);
    await expect.poll(() => flowValue(moment.locator('.streak-moment__num number-flow-react'))).toBe(before + 1);
    // Kip's dial steps aside while the moment plays
    await expect(page.locator('.dial__kip')).toBeHidden();

    const go = moment.locator('.streak-moment__go');
    await expect(go).toHaveCSS('opacity', '1'); // it fades in once the flame is lit
    await go.click();
    await expect(moment).toHaveCount(0);

    await expect(tile.locator('.streak2__btn')).toHaveCount(0); // today is ticked, so the button goes
    expect(await flowValue(tile.locator('.streak2__count number-flow-react'))).toBe(before + 1);
    await expect(page.locator('.dial__kip')).toBeVisible();
  });

  test('sleep on it: add a wish, skip the 48 h (demo), keep the money → it shows in Activity', async ({ page }) => {
    await demoHome(page);
    const wish = `Casti ${Date.now() % 100_000}`;

    await page.locator('.sleeprow').click();
    const sheet = page.locator('.sheet-backdrop .sheet');
    await expect(sheet.locator('.sleep')).toBeVisible();

    const fields = sheet.locator('.sleep__form input');
    await fields.nth(0).fill(wish);
    await fields.nth(1).fill('129');
    await sheet.locator('.sleep__form .btn--primary').click();

    const item = sheet.locator('.wish', { hasText: wish });
    await expect(item).toBeVisible();
    await expect(item).not.toHaveClass(/\bwish--awake\b/);
    await expect(fields.nth(0)).toHaveValue('');

    // demo accounts can skip the wait
    await item.locator('.wish__skip').click();
    await expect(item).toHaveClass(/\bwish--awake\b/);

    // "No, keep the money" → choose a goal → save
    await item.locator('.wish__actions .btn--primary').click();
    const keep = item.locator('.wish__keep');
    const chips = keep.locator('.qr__goal[role="radio"]');
    await expect(chips.first()).toHaveAttribute('aria-checked', 'true');
    const goalName = (await chips.nth(1).textContent())!.trim();
    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveAttribute('aria-checked', 'true');
    await keep.locator('.btn--primary').click();

    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
    await expect(page.locator('.party')).toBeVisible();

    // the kept money is a contribution noted "Slept on it: <wish>", towards the chosen goal
    await page.goto('/activity');
    const row = page.locator('section.panel .list-row', { hasText: wish });
    await expect(row).toHaveCount(1);
    const title = (await row.locator('.list-row__body > .strong').textContent())!.trim();
    const [prefix, rest] = title.split(/:\s*/, 2);
    expect(prefix, `note "${title}"`).toMatch(TEXT.sleptOnIt);
    expect(rest).toBe(wish);
    await expect(row.locator('.list-row__body > .subtle')).toContainText(goalName);
    await expect(row.locator('.list-row__end .money')).toHaveText(/^\+129\s*lei$/);
  });

  test('opening a sheet does not change the record button width (scrollbar regression)', async ({ page }) => {
    await demoHome(page);
    const button = page.locator('[data-tour="vault"] .qr__btn');
    const hasClassicScrollbar = await page.evaluate(() => window.innerWidth > document.documentElement.clientWidth);
    test.info().annotations.push({
      type: 'scrollbar',
      description: hasClassicScrollbar ? 'classic scrollbar present' : 'overlay scrollbar (phone): nothing to lose, so this is a weak check here',
    });
    // Note: documentElement.clientWidth does change (the scrollbar goes away) even with
    // scrollbar-gutter: stable, but layout keeps the gutter. What matters is the content, so
    // compare the button's box. Without the gutter the button widens on narrow layouts and
    // shifts sideways on wide, centred ones, so check both its width and its left edge.
    const box = async () => {
      const b = (await button.boundingBox())!;
      return { width: b.width, x: b.x };
    };

    const before = await box();
    expect(before.width).toBeGreaterThan(0);

    await page.locator('.sleeprow').click(); // any sheet locks scrolling; this one opens from home
    const backdrop = page.locator('.sheet-backdrop');
    await expect(backdrop.locator('.sheet')).toBeVisible();
    // the sheet locks page scrolling…
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    // …without the content underneath moving
    const open = await box();
    expect(open.width, 'record button width with the sheet open').toBeCloseTo(before.width, 1);
    expect(open.x, 'record button left edge with the sheet open').toBeCloseTo(before.x, 1);

    await page.keyboard.press('Escape');
    await expect(backdrop).toHaveCount(0);
    const after = await box();
    expect(after.width).toBeCloseTo(before.width, 1);
    expect(after.x).toBeCloseTo(before.x, 1);
  });
});
