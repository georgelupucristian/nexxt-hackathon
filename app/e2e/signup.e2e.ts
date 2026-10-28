import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// /start asks one thing per screen: hello, name, kind, target, plan, tracking, reminder, account.

const continueButton = (page: Page) => page.locator('.start__foot .btn--primary');
const progress = (page: Page) => page.locator('.start__progress[role="progressbar"]');
const ruler = (page: Page) => page.locator('.start__step [role="slider"]');

/**
 * Press Continue and wait for the next question. Steps swap with AnimatePresence mode="wait", so
 * the old step stays in the DOM while it animates out; wait for it to go before touching anything.
 */
async function goNext(page: Page) {
  const old = await page.locator('main.start__step').elementHandle();
  await continueButton(page).click();
  await page.waitForFunction((el) => !el?.isConnected, old);
  await expect(page.locator('main.start__step')).toBeVisible();
}

/** Walk the signup flow up to the target amount step (step 4 of 8). */
async function toTargetStep(page: Page) {
  await page.goto('/start');
  await expect(progress(page)).toHaveAttribute('aria-valuenow', '1');
  await goNext(page);

  // name: Continue stays disabled until there's a name
  await expect(progress(page)).toHaveAttribute('aria-valuenow', '2');
  await expect(continueButton(page)).toBeDisabled();
  await page.locator('.start__step input').fill('Ana');
  await expect(continueButton(page)).toBeEnabled();
  await goNext(page);

  // kind: pick the first kind; it fills in a goal name
  await expect(progress(page)).toHaveAttribute('aria-valuenow', '3');
  const kind = page.locator('.start__step .choice[role="radio"]').first();
  await kind.click();
  await expect(kind).toHaveAttribute('aria-checked', 'true');
  await expect(continueButton(page)).toBeEnabled();
  await goNext(page);

  await expect(progress(page)).toHaveAttribute('aria-valuenow', '4');
  await expect(ruler(page)).toBeVisible();
}

/** Tap the big number, type an exact amount, press Enter. */
async function typeAmount(page: Page, value: string) {
  await page.locator('.start__step .ruler-readout').click();
  const input = page.locator('.start__step .ruler-type');
  await expect(input).toBeFocused();
  await page.keyboard.type(value);
  // typing replaces the old amount instead of appending to it
  await expect(input).toHaveValue(value);
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);
}

test.describe('signup amount ruler', () => {
  test('typing an exact amount sets the slider value; arrows snap to the 10 lei grid', async ({ page }) => {
    await toTargetStep(page);
    const slider = ruler(page);
    await expect(slider).toHaveAttribute('aria-valuenow', '3000');

    await typeAmount(page, '7');
    await expect(slider).toHaveAttribute('aria-valuenow', '7');
    await expect(slider).toHaveAttribute('aria-valuetext', /^7 lei$/);

    await typeAmount(page, '250');
    await expect(slider).toHaveAttribute('aria-valuenow', '250');

    // the target ruler moves 10 lei per tick
    await slider.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '260');
    await slider.press('ArrowLeft');
    await slider.press('ArrowLeft');
    await expect(slider).toHaveAttribute('aria-valuenow', '240');
    await slider.press('PageUp');
    await expect(slider).toHaveAttribute('aria-valuenow', '340');

    await goNext(page);
    await expect(progress(page)).toHaveAttribute('aria-valuenow', '5');
  });

  test('on the plan step the arrow keys move one leu and stop at the minimum', async ({ page }) => {
    await toTargetStep(page);
    await goNext(page);
    await expect(progress(page)).toHaveAttribute('aria-valuenow', '5');

    const slider = ruler(page);
    await expect(slider).toBeVisible();
    await typeAmount(page, '7');
    await expect(slider).toHaveAttribute('aria-valuenow', '7');

    await slider.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '8');
    await slider.press('ArrowUp');
    await expect(slider).toHaveAttribute('aria-valuenow', '9');
    await slider.press('ArrowLeft');
    await slider.press('ArrowDown');
    await expect(slider).toHaveAttribute('aria-valuenow', '7');

    await typeAmount(page, '1');
    await expect(slider).toHaveAttribute('aria-valuenow', '1');
    await slider.press('ArrowLeft');
    await expect(slider).toHaveAttribute('aria-valuenow', '1');
    await expect(slider).toHaveAttribute('aria-valuemin', '1');
  });
});
