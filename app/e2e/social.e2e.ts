import type { Page } from '@playwright/test';
import { demoHome, expect, test } from './fixtures';

// Friends, colonies and freezes: the spec's demo script, steps 1 to 7, from a fresh phone sign-up on
// a server without a backend. Such an account is local, so its social layer is the simulated mock
// (lib/social/repo.ts), seeded per account; the demo account gets the same story (second test).
// The onboarding steps match both languages while their translation lands.

const main = (page: Page) => page.getByRole('contentinfo').getByRole('button').first();
const expectTitle = (page: Page, name: string) => expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
const moment = (page: Page) => page.locator('.soc-moment');

/** Welcome → a new account by phone, up to the contacts screen. */
async function signUpToContacts(page: Page) {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Hai să începem' }).click();
  await expect(page.locator('.sr-only', { hasText: 'Salut! Eu sunt Kip.' })).toHaveCount(0, { timeout: 6_000 });
  await page.getByRole('radio', { name: /21-25/ }).click();
  await main(page).click();
  await page.getByRole('checkbox', { name: /Vacanță cu prietenii/ }).click();
  await main(page).click();
  await page.getByRole('radio', { name: /^10 lei/ }).click({ timeout: 8_000 });
  await main(page).click();
  await page.getByRole('button', { name: 'Continuă' }).last().click();
  await expectTitle(page, 'Uite ce poți realiza în 3 luni!');
  await main(page).click();
  await expectTitle(page, 'Cât ai deja pus deoparte?');
  await main(page).click();
  await expect(page.getByRole('heading', { name: /Pornești din ziua 1/ })).toBeVisible();
  await main(page).click();
  const phone = page.getByLabel('Numărul tău de telefon');
  await phone.click();
  await phone.pressSequentially('0712345678');
  await main(page).click();
  await page.getByLabel('Codul de 6 cifre').fill('123456');
  await expectTitle(page, 'Cum să-ți spunem?');
  await page.getByLabel('Prenume').fill('Alex');
  await main(page).click();
  await expectTitle(page, 'Ca să-ți găsești prietenii care economisesc deja');
}

test('demo script, steps 1 to 7: contacts, a friend in danger, a freeze, a rescue, the shared goal, the profile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'one run is enough');
  test.setTimeout(150_000);

  // 1. onboarding: "Permite accesul" finds the 5 people from the contacts who use Kip
  await signUpToContacts(page);
  await expect(page.getByRole('button', { name: 'Mai târziu' })).toBeVisible();
  await page.getByRole('button', { name: 'Permite accesul' }).click();
  const found = page.getByTestId('found-row');
  await expect(found).toHaveCount(5);
  await expect(found).toContainText(['Ana Popescu', 'Mihai Ionescu', 'Ioana Marin', 'Radu Stan', 'Elena Dobre']);
  // adding sends a request; Mihai had already asked, so that one is a friendship straight away
  // adding sends a request; Ana and Mihai had already asked, so both are friendships straight away
  await page.getByRole('button', { name: 'Add Ana Popescu' }).click();
  await expect(found.filter({ hasText: 'Ana Popescu' })).toContainText("You're friends");
  await page.getByRole('button', { name: 'Add Mihai Ionescu' }).click();
  await expect(found.filter({ hasText: 'Mihai Ionescu' })).toContainText("You're friends");
  await main(page).click();
  await expectTitle(page, 'Te pot găsi prietenii după număr?');
  await page.getByRole('radio', { name: /Prietenii mă pot găsi după număr/ }).click();
  await main(page).click();
  await page.getByRole('button', { name: 'Completez mai târziu' }).click();
  await page.getByRole('button', { name: 'Nu acum' }).click();
  await page.getByRole('button', { name: 'Nu acum' }).click();
  await page.getByRole('button', { name: 'Hai', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator('.tour')).toBeVisible({ timeout: 6_000 });
  await page.locator('.tour__skip').click();

  // the people icon next to the bell
  await page.getByTestId('friends-link').click();
  await expect(page).toHaveURL(/\/friends$/);
  await expect(page.getByRole('button', { name: 'View as…' })).toHaveCount(0);

  // 2. all 30 friends; Ana pinned on top as "At risk"; search by name
  await expect(page.getByTestId('friend-count')).toHaveText('30 friends');
  const rows = page.getByTestId('friend-row');
  await expect(rows.first()).toContainText('Ana Popescu');
  await expect(rows.first()).toContainText('At risk');
  await expect(rows.nth(1)).toHaveAttribute('data-danger', 'true');
  await page.getByRole('button', { name: 'Name A-Z' }).click();
  await expect(rows.first()).toContainText('Ana Popescu');
  await page.getByLabel('Search by name').fill('ioa');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Ioana Marin');
  await page.getByLabel('Search by name').fill('');

  // the colony waits for Ana before anyone helps
  await page.goto('/colonies/c_foculetul');
  await expect(page.getByTestId('colony-danger')).toHaveCount(1);
  const colonyStreak = Number(await page.getByTestId('colony-streak').textContent());

  // 3. Ana's request: "Can you spare a freeze?"
  await page.goto('/friends?tab=requests');
  const ask = page.getByTestId('freeze-ask');
  await expect(ask).toContainText('Ana Popescu');
  await expect(ask).toContainText('Can you spare a freeze?');

  // 4. the warning, then the gift: 1 -> 0, back on a date
  await expect(page.getByTestId('freeze-count')).toHaveText('1');
  await ask.getByRole('button', { name: 'Give them your freeze' }).click();
  await expect(page.getByTestId('give-warning')).toHaveText(/^If you give away your freeze, you're unprotected until \d+ \p{L}+\.$/u);
  await page.locator('.dialog').getByRole('button', { name: 'Give your freeze' }).click();
  await expect(moment(page)).toContainText('You saved Ana!');
  await moment(page).getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('freeze-count')).toHaveText('0');
  await expect(page.getByTestId('freeze-chip')).toContainText(/Recharges on \d+ \p{L}+/u);

  // 5. simulated Ana saves right away: the freeze works, the colony keeps its streak
  await expect(page.getByText('Ana put money aside. Your freeze saved their streak.')).toBeVisible();
  await page.goto('/colonies/c_foculetul');
  await expect(page.getByTestId('colony-streak')).toHaveText(String(colonyStreak + 1));
  await expect(page.getByTestId('colony-danger')).toHaveCount(0);

  // 6. a deposit into the shared goal takes it past 50%: the shared celebration
  await page.goto('/shared-goal/sg_vama');
  await expect(page.getByTestId('shared-pct')).toHaveText('46%');
  await page.getByRole('button', { name: 'Deposit' }).click();
  const sheet = page.locator('.sheet-backdrop .sheet');
  await expect(sheet).toContainText('Demo');
  await sheet.locator('.saves__amount input').fill('100');
  await sheet.getByRole('button', { name: /^Deposit 100/ }).click();
  await expect(moment(page)).toContainText('50%');
  await expect(moment(page)).toContainText('Halfway to «Vama Veche»');
  await moment(page).getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('shared-pct')).toHaveText('51%');

  // 7. the profile counts toward the next 1-week Freeze (a new account starts at 0 days)
  await page.goto('/profile');
  await expect(page.getByTestId('week-freeze-line')).toHaveText('1-week Freeze: 45 more days until the next one (45 days in a row)');
  await expect(page.getByTestId('saves-tally')).toContainText('1 / 0');
});

test('the demo account finds the same friends from Friends → Invite; no emojis or dashes in the copy', async ({ page }) => {
  await demoHome(page);
  await page.getByTestId('friends-link').click();
  await expect(page.getByTestId('friend-count')).toHaveText('28 friends');
  await page.getByRole('tab', { name: /Invite/ }).click();
  await expect(page.getByText('When a friend joins with your link, your 1-day Freeze recharges right away.')).toBeVisible();
  await page.getByRole('button', { name: 'Allow access' }).click();
  await expect(page.getByTestId('found-row')).toHaveCount(5);
  // the 7 people without Kip can be invited; their numbers stay on the device
  await expect(page.getByRole('list', { name: 'Invite' }).getByRole('listitem')).toHaveCount(7);
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/[\u2013\u2014]/);
  expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  // the streak rules: the two freezes instead of "Îngheață ziua de azi"
  await page.goto('/profile/streaks');
  await expect(page.getByRole('heading', { name: /1-day Freeze/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /1-week Freeze/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Freeze today|Îngheață ziua de azi/ })).toHaveCount(0);
});
