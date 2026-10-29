import type { Page } from '@playwright/test';
import { expect, goalRow, rowSaved, test } from './fixtures';

const NUMBER = '0712345678';
const CODE = '123456';

// Sign-up and onboarding, Duolingo-style: a typed greeting over the first question, age, why,
// "Let's make some routines" (lei a day), what that comes to in a week and in 3 months, the
// what you already have put aside and the day it puts you on, then the account: a Romanian phone number and a
// 6-digit code, then the name, friends from the contacts, being findable by number, income,
// notifications, Face ID, celebration and Home.
//
// The suite runs against a dev server with no Supabase project, so the account is local and the
// number is proven by the fixed code; nothing is sent anywhere. With Supabase the same screens call
// the auth-phone Edge Function and get a real session.

// role queries skip the step that's sliding out (it's aria-hidden while it animates away)
const main = (page: Page) => page.getByRole('contentinfo').getByRole('button').first();
// Kip types the question out; the heading's accessible name is the whole sentence from the start
const expectTitle = (page: Page, name: string) => expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
const progress = (page: Page) => page.getByRole('progressbar', { name: 'Setup progress' });

/** Welcome → the account screen: 21-25, saving for a trip, 10 lei a day, starting with 250 lei. */
async function planATrip(page: Page) {
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { name: 'Saving on a student budget? Totally doable.' })).toBeVisible();
  await page.getByRole('button', { name: 'Get started' }).click();

  // 1. the typed greeting sits over the first question for three seconds, then lets go
  const greeting = page.locator('.sr-only', { hasText: "Hi! I'm Kip." });
  await expect(greeting).toBeAttached();
  await expect(greeting).toHaveCount(0, { timeout: 6_000 });
  await expectTitle(page, 'How old are you?');
  await expect(main(page)).toBeDisabled();
  await page.getByRole('radio', { name: /21-25/ }).click();
  const before = Number(await progress(page).getAttribute('aria-valuenow'));
  await main(page).click();

  // 2. why: multi-select; "Something else" asks what
  await expectTitle(page, 'Why do you want to save?');
  expect(Number(await progress(page).getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  await page.getByRole('checkbox', { name: /A trip with friends/ }).click();
  await page.getByRole('checkbox', { name: /Something else/ }).click();
  await expect(page.getByLabel('Something else')).toBeVisible();
  await page.getByRole('checkbox', { name: /Something else/ }).click();
  await expect(main(page)).toHaveText("Let's start saving");
  await main(page).click();

  // 3. routines: the big words go first, then the daily amounts appear
  await expect(page.getByRole('radio', { name: /10 lei \/ day/ })).toBeVisible({ timeout: 6_000 });
  await page.getByRole('radio', { name: /10 lei \/ day/ }).click();
  await main(page).click();
  // frosted over the page: what that is in a week
  await expect(page.locator('.sr-only', { hasText: "That's 70 lei in your first week!" })).toBeAttached();
  await page.getByRole('button', { name: 'Continue' }).last().click();

  // 4. three months
  await expectTitle(page, "Here's what you can do in 3 months");
  await expect(page.getByText('You save 910 lei')).toBeVisible();
  await main(page).click();

  // 5. what you already have put aside: the ruler starts at nothing; this student has 250 lei
  await expectTitle(page, 'How much do you already have saved?');
  const ruler = page.getByRole('slider');
  await expect(ruler).toHaveAttribute('aria-valuenow', '0');
  await ruler.focus();
  for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowRight');
  await expect(ruler).toHaveAttribute('aria-valuenow', '250');
  await main(page).click();

  // 6. 250 lei at 10 lei a day puts you on day 25
  await expect(page.getByRole('heading', { name: "You're starting with 250 lei, so you begin on day 25." })).toBeVisible();
  await main(page).click();

  // 7. account: preview of the plan, no password anywhere
  await expectTitle(page, 'Your plan is ready. Save it.');
  await expect(page.getByRole('main')).toContainText('A trip with friends');
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
}

/** The phone number, typed the Romanian way behind the +40, then the code screen. */
async function phoneAndCode(page: Page) {
  const phone = page.getByLabel('Your phone number');
  await expect(phone).toHaveAttribute('inputmode', 'tel');
  await expect(phone).toHaveAttribute('autocomplete', 'tel');
  await expect(main(page)).toBeDisabled();
  await phone.click();
  await phone.pressSequentially(NUMBER);
  await expect(phone).toHaveValue('+40 712 345 678');
  await main(page).click();

  // the code: the number with an edit button, resend counts down, no code shown anywhere
  await expectTitle(page, 'Enter the code');
  await expect(page.getByText('0712 345 678')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change number' })).toBeVisible();
  await expect(page.getByText(/Resend code in 0:(30|29|28)/)).toBeVisible();
  await expect(page.getByText(CODE)).toHaveCount(0);
  const box = page.getByLabel('6-digit code');
  await expect(box).toHaveAttribute('inputmode', 'numeric');
  await expect(box).toHaveAttribute('autocomplete', 'one-time-code');
  // a wrong code clears the boxes and says so
  await box.fill('111111');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(box).toHaveValue('');
  // the right one submits on its own at the sixth digit
  await box.fill(CODE);
}

async function finishAfterAuth(page: Page, name: string, opts: { income: boolean; faceId: boolean }) {
  // 8. name
  await expectTitle(page, 'What should we call you?');
  await page.getByLabel('First name').fill(name);
  await main(page).click();

  // friends from the contacts: never mandatory
  await expectTitle(page, 'Find your friends who already save');
  await page.getByRole('button', { name: 'Later' }).click();
  // whether friends can find you by your number: a real choice, nothing picked for you
  await expectTitle(page, 'Can friends find you by your number?');
  await expect(main(page)).toBeDisabled();
  await page.getByRole('radio', { name: /Friends can find me by my number/ }).click();
  await main(page).click();

  // 9. money in
  await expectTitle(page, 'Where does your money come from?');
  if (opts.income) {
    await page.getByRole('checkbox', { name: /Part-time job/ }).click();
    await page.getByRole('checkbox', { name: /Scholarship/ }).click();
    await page.getByLabel(/About how much a month/).fill('1800');
    await main(page).click();
  } else {
    await page.getByRole('button', { name: 'Fill this in later' }).click();
  }

  // 10. notifications
  await expect(page.getByText('A trip with friends: 25% saved!')).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();

  // 11. Face ID
  await expectTitle(page, 'Open Kip with Face ID next time');
  await page.getByRole('button', { name: opts.faceId ? 'Allow' : 'Not now' }).click();

  // 12. celebration
  await expect(page.getByRole('heading', { name: `You're all set, ${name}!` })).toBeVisible();
  await page.getByRole('button', { name: "Let's go", exact: true }).click();

  // 13. the normal home straight away (no card asked for): the goal already holds what you had
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator('.first')).toHaveCount(0);
  const row = goalRow(page, 'A trip with friends');
  await expect(row).toBeVisible();
  expect(await rowSaved(row)).toBe(250);
}

const savedData = (page: Page) =>
  page.evaluate(() => {
    const id = JSON.parse(localStorage.getItem('kept.session') ?? 'null')?.accountId;
    return JSON.parse(localStorage.getItem(`kept.data.${id}`) ?? 'null');
  });

test('phone path: the number, its six-digit code, then the name; signing back in needs only the code', async ({ page, consoleErrors }) => {
  await planATrip(page);
  await phoneAndCode(page);
  await finishAfterAuth(page, 'Ana', { income: true, faceId: false });

  const data = await savedData(page);
  expect(data.onboarding.completed).toBe(true);
  expect(data.goals).toHaveLength(1);
  // the target the plan card showed: 250 lei already put aside + 10 lei a day for 91 days
  expect(data.goals[0]).toMatchObject({ name: 'A trip with friends', target: 116000, kind: 'travel', icon: 'beach' });
  expect(data.goals[0].plan).toMatchObject({ frequency: 'weekly', amount: 7000 });
  // what you already had is one manual entry on the goal; nothing done today, so no streak day
  expect(data.transactions).toHaveLength(1);
  expect(data.transactions[0]).toMatchObject({ type: 'contribution', amount: 25000, goalId: data.goals[0].id, note: 'What you already had', source: 'manual', status: 'confirmed' });
  expect(data.actions).toEqual([]);
  expect(data.setup).toMatchObject({ age: '21', dailyGoal: 1000, reasons: ['trip'], incomeSources: ['job', 'scholarship'], incomeMonthly: 180000, notifications: 'later', faceId: false });

  await page.goto('/logout');
  await page.goto('/signin');
  const number = page.getByLabel('Phone number');
  await number.click();
  await number.pressSequentially(NUMBER);
  await expect(number).toHaveValue('+40 712 345 678');
  await page.getByRole('button', { name: 'Text me a code' }).click();
  await page.getByLabel('6-digit code').fill(CODE);
  await expect(page).toHaveURL(/\/home$/);
  await expect(goalRow(page, 'A trip with friends')).toBeVisible();
  expect(consoleErrors.filter((e) => !e.includes('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing'))).toEqual([]);
});

test('Face ID: a passkey on this device; a fresh tab asks for it, and "Sign out" is always there', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'one run is enough');
  // a virtual platform authenticator stands in for Face ID
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  await planATrip(page);
  await phoneAndCode(page);
  await finishAfterAuth(page, 'Mihai', { income: false, faceId: true });
  expect((await savedData(page)).setup).toMatchObject({ incomeSkipped: true, faceId: true });

  // this tab stays open; once its unlock is forgotten, Kip asks for the face or finger
  await page.evaluate(() => sessionStorage.removeItem('kip.unlocked'));
  await page.reload();
  await expect(page.locator('main.lock')).toBeVisible();
  await page.getByRole('button', { name: /Unlock/ }).click();
  await expect(page.locator('main.lock')).toHaveCount(0);

  const other = await context.newPage();
  await other.goto('/home');
  await expect(other.locator('main.lock')).toBeVisible();
  await other.getByRole('button', { name: 'Sign out' }).click();
  await expect(other).toHaveURL(/\/welcome$/);
});
