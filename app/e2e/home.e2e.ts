import { demoHome, expect, flowValue, goalRow, rowSaved, savingMoment, test, TEXT } from './fixtures';

test.describe('home actions', () => {
  test('Save money: the sheet opens on the main goal, and the saving shows on its row', async ({ page }) => {
    await demoHome(page);
    await page.locator('.savebtn--fun').click();
    const sheet = page.locator('.sheet-backdrop .sheet');
    await expect(sheet.locator('.saves')).toBeVisible();
    await expect(sheet.locator('.saves__amount input')).toBeFocused();

    // where it goes is already picked: the main goal, first in the row of chips
    const chips = sheet.locator('.saves__goals [role="radio"]');
    await expect(chips.first()).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.locator('.saves__goals [aria-checked="true"]')).toHaveCount(1);
    const goalName = (await chips.first().locator('.truncate').textContent())!.trim();
    const row = goalRow(page, goalName);
    const before = await rowSaved(row);

    // one button, and it says what will happen
    const confirm = sheet.locator('.savebtn--confirm');
    await expect(confirm).toBeDisabled();
    await expect(confirm).toHaveText('Enter an amount');
    await sheet.locator('.saves__amount input').fill('37');
    await expect(confirm).toHaveText(/^Save 37\s*lei$/);
    await confirm.click();

    await expect(savingMoment(page)).toBeVisible();
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
    // demo transfers start pending and count once the simulated sync confirms them (~4 s);
    // the same sync also confirms the seed's pending 40 lei for this goal, hence "at least"
    await expect.poll(() => rowSaved(row), { timeout: 15_000 }).toBeGreaterThanOrEqual(before + 37);
  });

  test('a quick amount fills the sum, and "No goal" is one tap away', async ({ page }) => {
    await demoHome(page);
    await page.locator('.savebtn--fun').click();
    const sheet = page.locator('.sheet-backdrop .sheet');
    const quick = sheet.locator('.saves__quick button');
    await expect(quick.first()).toBeVisible();
    const label = (await quick.nth(1).textContent())!.trim();
    await quick.nth(1).click();
    await expect(quick.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.locator('.savebtn--confirm')).toHaveText(`Save ${label}`);

    const none = sheet.locator('.saves__goals .saves__none');
    await none.click();
    await expect(none).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.locator('.saves__goals [aria-checked="true"]')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
  });

  test('putting money aside lights today and grows the streak; there is nothing to tick by hand', async ({ page }) => {
    await demoHome(page);
    const tile = page.locator('.streakd');
    const today = tile.locator('.streakd__day.is-now');
    // nothing put aside yet today: today's dot is open and the card has no button to tick it
    await expect(today).not.toHaveClass(/\bis-done\b/);
    await expect(tile.locator('button, [role="button"]')).toHaveCount(0);
    await expect(tile.locator('.streakd__done')).toHaveCount(0);
    const before = await flowValue(tile.locator('.streakd__title number-flow-react'));

    await page.locator('.savebtn--fun').click();
    const sheet = page.locator('.sheet-backdrop .sheet');
    await sheet.locator('.saves__amount input').fill('12');
    await sheet.locator('.savebtn--confirm').click();

    // the saving grows the run, so the streak moment plays once the celebration steps aside
    const moment = page.locator('.streak-moment');
    const partyGo = page.locator('.celebrate__go');
    await expect(async () => {
      if (await partyGo.isVisible()) await partyGo.click({ timeout: 2_000 }).catch(() => {});
      await expect(moment).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 25_000 });
    const slow = { timeout: 20_000 };
    await expect(moment).toHaveAttribute('role', 'dialog');
    // Kip stands in front of the same Noto flame as the streak card
    await expect(moment.locator('.smh__kip .seal')).toBeVisible();
    await expect(moment.locator('img.smh__flame')).toBeVisible();
    await expect(moment.locator('.smw__day')).toHaveCount(7);
    await expect(moment.locator('.smw__day.is-today')).toHaveClass(/\bis-today-done\b/);
    await expect(moment.locator('.smw__day.is-today img.smw__icon')).toBeVisible(slow);
    await expect(moment.locator('.smw__fine')).toHaveText('A day counts when you save something.');
    await expect.poll(() => flowValue(moment.locator('.streak-moment__num number-flow-react'))).toBe(before + 1);
    // Kip's dial steps aside while the moment plays
    await expect(page.locator('.dial__kip')).toBeHidden();

    const go = moment.locator('.streak-moment__go');
    await expect(go).toHaveCSS('opacity', '1', slow); // it fades in once the flame is lit
    await go.click();
    await expect(moment).toHaveCount(0, slow);

    // back on home: today's dot has its flame, a line says why, and the count went up by one
    await expect(today).toHaveClass(/\bis-done\b/);
    await expect(today.locator('img.streakd__dayfire')).toBeVisible();
    await expect(tile.locator('.streakd__done')).toHaveText(/You saved today/);
    expect(await flowValue(tile.locator('.streakd__title number-flow-react'))).toBe(before + 1);
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

    // "Nu, pun banii deoparte" → choose a goal (the main one is picked already) → save
    await expect(item.locator('.wish__actions .btn--primary')).toHaveText('No, save the money');
    await item.locator('.wish__actions .btn--primary').click();
    const keep = item.locator('.wish__keep');
    const chips = keep.locator('.saves__goals [role="radio"]');
    await expect(chips.first()).toHaveAttribute('aria-checked', 'true');
    const goalName = (await chips.nth(1).locator('.truncate').textContent())!.trim();
    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveAttribute('aria-checked', 'true');
    await keep.locator('.btn--primary').click();

    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
    await expect(savingMoment(page)).toBeVisible();

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

  test('opening a sheet does not change the Save money button width (scrollbar regression)', async ({ page }) => {
    await demoHome(page);
    const button = page.locator('.savebtn--fun');
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
    expect(open.width, 'button width with the sheet open').toBeCloseTo(before.width, 1);
    expect(open.x, 'button left edge with the sheet open').toBeCloseTo(before.x, 1);

    await page.keyboard.press('Escape');
    await expect(backdrop).toHaveCount(0);
    const after = await box();
    expect(after.width).toBeCloseTo(before.width, 1);
    expect(after.x).toBeCloseTo(before.x, 1);
  });
});
