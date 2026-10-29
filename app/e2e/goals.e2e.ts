import type { Page } from '@playwright/test';
import { accountId, closeMoments, continueButton, demoHome, expect, flowValue, goalRow, goNext, lei, progress, savingMoment, stepRuler, test, typeAmount } from './fixtures';

// "Obiectiv nou" is four questions, one per screen, like signup: what for, how much, by when, and
// the plan Kip works out. Then the goal page, where everything you can do with a goal is in plain view.

const step = (page: Page) => page.locator('main.start__step');
const preset = (page: Page, id: string) => page.locator(`.preset[data-preset="${id}"]`);
const nameField = (page: Page) => step(page).locator('form input');
const NEW_GOAL_URL = /\/goals\/new$/;
const GOAL_URL = /\/goals\/(?!new$)[^/]+$/;

/** YYYY-MM-DD in local time, `months` from today (the 31st becomes the month's last day, like the app). */
function monthsAhead(months: number): string {
  const d = new Date();
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function storedGoal(page: Page, name: string) {
  const id = await accountId(page);
  return page.evaluate(
    ([key, goal]) => (JSON.parse(localStorage.getItem(key) ?? '{}').goals ?? []).find((g: { name: string }) => g.name === goal) ?? null,
    [`kept.data.${id}`, name] as const,
  );
}

test.describe('New goal', () => {
  test('from home in four questions and a handful of taps; it lands on the goal and shows on home with its plan', async ({ page }) => {
    await demoHome(page);
    // every tap from home to the new goal is counted; two of them (a price chip, 6 luni) are optional
    let taps = 0;
    const tap = async (target: ReturnType<Page['locator']>) => {
      taps++;
      await target.click();
    };
    const next = async () => {
      taps++;
      await goNext(page);
    };

    await tap(page.locator('.cop a.cop__new'));
    await expect(page).toHaveURL(NEW_GOAL_URL);

    // 1. what for: Continue waits for a choice; a preset brings its name, which you can change
    await expect(progress(page)).toHaveAttribute('aria-valuenow', '1');
    await expect(progress(page)).toHaveAttribute('aria-valuemax', '4');
    await expect(step(page)).toHaveAttribute('data-step', 'what');
    await expect(page.locator('.preset')).toHaveCount(8);
    await expect(continueButton(page)).toBeDisabled();
    await tap(preset(page, 'concert'));
    await expect(preset(page, 'concert')).toHaveAttribute('aria-checked', 'true');
    await expect(nameField(page)).toHaveValue('Concert');
    await expect(continueButton(page)).toBeEnabled();
    await next();

    // 2. how much: the preset's price is already there; a quick chip sets another
    await expect(progress(page)).toHaveAttribute('aria-valuenow', '2');
    await expect(step(page)).toHaveAttribute('data-step', 'cost');
    await expect(stepRuler(page)).toHaveAttribute('aria-valuenow', '400');
    const chip500 = step(page).locator('.chip-row--even .chip', { hasText: /^500\s*lei$/ });
    await tap(chip500);
    await expect(chip500).toHaveAttribute('aria-pressed', 'true');
    await expect(stepRuler(page)).toHaveAttribute('aria-valuenow', '500');
    await next();

    // 3. by when: the preset's deadline is picked; 6 months is one tap
    await expect(progress(page)).toHaveAttribute('aria-valuenow', '3');
    await expect(step(page)).toHaveAttribute('data-step', 'when');
    await expect(page.locator('.when[data-when="3m"]')).toHaveAttribute('aria-checked', 'true');
    await tap(page.locator('.when[data-when="6m"]'));
    await expect(page.locator('.when[data-when="6m"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.whens [aria-checked="true"]')).toHaveCount(1);
    await next();

    // 4. the plan, worked out: one number, one line why, one button
    await expect(progress(page)).toHaveAttribute('aria-valuenow', '4');
    await expect(step(page)).toHaveAttribute('data-step', 'plan');
    const plan = page.locator('.planpv');
    await expect(plan.locator('.planpv__goaltext strong')).toHaveText('Concert');
    await expect(plan.locator('.planpv__goaltext')).toContainText(/500\s*lei · by /);
    await expect(plan.locator('.planpv__unit')).toHaveText('lei a week');
    await expect(plan.locator('.planpv__why')).toContainText(' by ');
    await expect(plan.locator('.planpv__why')).not.toHaveClass(/planpv__why--late/);
    const perWeek = await flowValue(plan.locator('number-flow-react.planpv__num'));
    expect(perWeek).toBeGreaterThan(0);
    expect(perWeek % 5, 'weekly plans round up to 5 lei').toBe(0);
    expect(perWeek * 27, 'about 26 weeks of it reach 500 lei').toBeGreaterThanOrEqual(500);
    await expect(plan.locator('.planpv__edit')).toHaveText(/Change amount/);
    await expect(continueButton(page)).toHaveText('Create goal');
    await tap(continueButton(page));

    // a short moment with Kip, then on to the new goal by itself
    const done = page.locator('.newgoal-done');
    await expect(done).toBeVisible();
    await expect(done.locator('.newgoal-done__title')).toHaveText('Done! Concert is on its way.');
    await expect(done.locator('.newgoal-done__sub')).toContainText(new RegExp(`${perWeek}\\s*lei a week`));
    await expect(page).toHaveURL(GOAL_URL, { timeout: 8_000 });
    expect(taps, 'taps from home to the new goal').toBeLessThanOrEqual(8);

    await expect(page.locator('#goal-name')).toHaveText('Concert');
    await expect(page.locator('.goal-plan')).toContainText(new RegExp(`${perWeek}\\s*lei every`));

    const saved = await storedGoal(page, 'Concert');
    expect(saved).toMatchObject({ icon: 'ticket', target: 500_00, targetDate: monthsAhead(6), status: 'active', plan: { amount: perWeek * 100, frequency: 'weekly' } });

    // home: its own row, with its icon and the plan in words
    await page.locator('.panel__close').click();
    await expect(page).toHaveURL(/\/home$/);
    const row = goalRow(page, 'Concert');
    await expect(row).toBeVisible();
    await expect(row.locator('.goal-tile svg')).toBeVisible();
    await expect(row.locator('.cop__plan')).toHaveText(new RegExp(`^${perWeek}\\s*lei a week$`));
    await expect(row.locator('.cop__amt')).toContainText(/0\s*lei\s*\/\s*500\s*lei/);
  });

  test('from Goals: "Altceva" asks for a name, answers survive a refresh, Back keeps them, X forgets them', async ({ page }) => {
    await demoHome(page);
    await page.goto('/goals');
    await page.locator('.page-head .btn--primary', { hasText: 'New goal' }).click();
    await expect(page).toHaveURL(NEW_GOAL_URL);

    // "Altceva" has no name to bring, so Continue waits for one
    await preset(page, 'other').click();
    await expect(nameField(page)).toBeFocused();
    await expect(nameField(page)).toHaveValue('');
    await expect(continueButton(page)).toBeDisabled();
    await nameField(page).fill('Bike');
    await expect(continueButton(page)).toBeEnabled();
    // a name you typed stays when you pick another tile (its price and pace come along)
    await preset(page, 'laptop').click();
    await expect(nameField(page)).toHaveValue('Bike');
    await goNext(page);
    await expect(stepRuler(page)).toHaveAttribute('aria-valuenow', '4000');
    await expect(step(page)).toContainText('How much does Bike cost?');

    // a refresh doesn't lose the answers
    await page.reload();
    await expect(step(page)).toHaveAttribute('data-step', 'cost');
    await expect(progress(page)).toHaveAttribute('aria-valuenow', '2');
    await expect(stepRuler(page)).toHaveAttribute('aria-valuenow', '4000');

    // Back goes one question back with everything still filled in
    const old = await step(page).elementHandle();
    await page.locator('.start__bar button[aria-label="Previous question"]').click();
    await page.waitForFunction((el) => !el?.isConnected, old);
    await expect(step(page)).toHaveAttribute('data-step', 'what');
    await expect(preset(page, 'laptop')).toHaveAttribute('aria-checked', 'true');
    await expect(nameField(page)).toHaveValue('Bike');
    await goNext(page);

    // an exact price, typed
    await typeAmount(page, '1234');
    await expect(stepRuler(page)).toHaveAttribute('aria-valuenow', '1234');
    await goNext(page);

    // "Alege o dată" opens a date field; a day in the past can't be the deadline
    await page.locator('.when[data-when="date"]').click();
    const date = step(page).locator('input[type="date"]');
    await expect(date).toBeVisible();
    await expect(continueButton(page)).toBeEnabled(); // a date four months out is filled in for you
    await date.fill('2020-01-01');
    await expect(step(page)).toContainText('Pick a day in the future.');
    await expect(continueButton(page)).toBeDisabled();
    const deadline = monthsAhead(12);
    await date.fill(deadline);
    await expect(continueButton(page)).toBeEnabled();
    await goNext(page);

    // the plan: your own amount if you want one; too little says when you'd finish instead, kindly
    const plan = page.locator('.planpv');
    await expect(plan.locator('.planpv__goaltext')).toContainText(/1,234\s*lei · by /);
    await plan.locator('.planpv__edit').click();
    const editor = plan.locator('.planpv__editor');
    await expect(editor.locator('[role="slider"]')).toBeVisible();
    await typeAmount(page, '5', editor);
    await expect(plan.locator('.planpv__why')).toHaveClass(/planpv__why--late/);
    await expect(plan.locator('.planpv__why')).toContainText('after your date');
    const reset = plan.locator('.planpv__reset');
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(plan.locator('.planpv__why')).not.toHaveClass(/planpv__why--late/);
    await plan.locator('.planpv__edit', { hasText: 'Done' }).click();
    await expect(plan.locator('.planpv__big')).toBeVisible();

    // X: back to Goals, nothing created, and the next "Obiectiv nou" starts from scratch
    await page.locator('.start__bar button[aria-label="Cancel the new goal"]').click();
    await expect(page).toHaveURL(/\/goals$/);
    expect(await storedGoal(page, 'Bike')).toBeNull();
    await page.locator('.page-head .btn--primary', { hasText: 'New goal' }).click();
    await expect(progress(page)).toHaveAttribute('aria-valuenow', '1');
    await expect(page.locator('.preset[aria-checked="true"]')).toHaveCount(0);
  });
});

test.describe('goal page', () => {
  test('save, withdraw, pause and resume; archive and delete ask first, in plain words', async ({ page }) => {
    await demoHome(page);
    const first = page.locator('.cop__goal').first();
    const name = (await first.locator('.cop__name').textContent())!.trim();
    await first.click();
    await expect(page).toHaveURL(GOAL_URL);
    await expect(page.locator('#goal-name')).toHaveText(name);

    // Depune: the sheet opens on this goal, first and picked
    const actions = page.locator('.goal-hero__actions');
    await expect(actions.locator('.btn--primary')).toHaveText(/Deposit/);
    await actions.locator('.btn--primary').click();
    let sheet = page.locator('.sheet-backdrop .sheet');
    const chips = sheet.locator('.saves__goals [role="radio"]');
    await expect(chips.first()).toHaveAttribute('aria-checked', 'true');
    await expect(chips.first().locator('.truncate')).toHaveText(name);
    await sheet.locator('.saves__amount input').fill('25');
    await sheet.locator('.savebtn--confirm').click();
    await expect(savingMoment(page)).toBeVisible();
    await closeMoments(page);

    // Retrage: says where from and how much is there, won't take more than that
    await actions.locator('.btn--secondary', { hasText: 'Withdraw' }).click();
    sheet = page.locator('.sheet-backdrop .sheet');
    await expect(sheet.locator('.saves__from')).toContainText(name);
    const max = lei(await sheet.locator('.saves__from strong.money').textContent());
    expect(max).toBeGreaterThan(10);
    const out = sheet.locator('.savebtn--out');
    await sheet.locator('.saves__amount input').fill(String(max + 1));
    await expect(sheet.locator('.saves__error')).toBeVisible();
    await expect(out).toBeDisabled();
    await sheet.locator('.saves__amount input').fill('10');
    await expect(sheet.locator('.saves__error')).toHaveCount(0);
    await expect(out).toHaveText(/^Withdraw 10\s*lei$/);
    await out.click();
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText(/Simulated withdrawal of 10\s*lei/);

    const history = page.locator('section[aria-labelledby="hist-h"]');
    await expect(history.locator('.tx-row__amount', { hasText: /^\+25\s*lei$/ }).first()).toBeVisible();
    await expect(history.locator('.tx-row__amount', { hasText: /^[−-]10\s*lei$/ }).first()).toBeAttached();

    // pause and resume, no questions asked: nothing is lost either way
    const more = page.locator('section[aria-labelledby="more-h"]');
    await more.locator('.list-row', { hasText: 'Pause' }).click();
    const banner = page.locator('.goal-hero .banner');
    await expect(banner).toContainText("It's paused");
    await expect(more.locator('.list-row', { hasText: 'Resume the goal' })).toBeVisible();
    await banner.locator('.banner__action', { hasText: 'Resume' }).click();
    await expect(banner).toHaveCount(0);
    await expect(more.locator('.list-row', { hasText: 'Pause' })).toBeVisible();

    // archive asks first; "Nu, lasă-l" leaves it as it was
    await more.locator('.list-row', { hasText: 'Archive' }).click();
    let dialog = page.locator('.sheet.dialog');
    await expect(dialog.locator('h2')).toHaveText(`Archive “${name}”?`);
    await expect(dialog.getByRole('button', { name: 'Yes, archive' })).toBeVisible();
    await dialog.getByRole('button', { name: 'No, leave it' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(more.locator('.list-row', { hasText: 'Archive' })).toBeVisible();

    // delete asks first, says the money stays, and the button says what it does
    await more.locator('.list-row', { hasText: 'Delete the goal' }).click();
    dialog = page.locator('.sheet.dialog');
    await expect(dialog.locator('h2')).toHaveText(`Delete “${name}”?`);
    await expect(dialog).toContainText('stays in your savings, without a goal');
    await expect(dialog.getByRole('button', { name: 'No, keep it' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Yes, delete it' }).click();
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.locator('.goal-card', { hasText: name })).toHaveCount(0);
  });

  test('Change plan and the edit sheet change the goal in place', async ({ page }) => {
    await demoHome(page);
    await page.locator('.cop__goal').first().click();
    await expect(page).toHaveURL(GOAL_URL);

    await page.locator('.goal-plan .btn--secondary', { hasText: 'Change plan' }).click();
    let sheet = page.locator('.sheet-backdrop .sheet');
    await expect(sheet.locator('h2')).toHaveText('Change plan');
    await typeAmount(page, '77', sheet);
    await expect(sheet.locator('.planedit__why')).toContainText('You save');
    await sheet.getByRole('button', { name: 'Save plan' }).click();
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText(/New plan: 77\s*lei/);
    await expect(page.locator('.goal-plan')).toContainText(/77\s*lei/);

    await page.locator('section[aria-labelledby="more-h"] .list-row', { hasText: 'Edit the name, amount or date' }).click();
    sheet = page.locator('.sheet-backdrop .sheet');
    await expect(sheet.locator('h2')).toHaveText('Edit goal');
    const nameInput = sheet.locator('input').first();
    await nameInput.fill('New laptop');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
    await expect(page.locator('#goal-name')).toHaveText('New laptop');
  });
});
