import { test as base, expect, type Locator, type Page } from '@playwright/test';

/*
 * Shared fixtures and helpers.
 *
 * Selectors lean on structure (CSS classes, roles, aria-*, data-*) because the UI copy is being
 * translated to Romanian. Where text has to be matched, the regexes accept both languages.
 */

export const TEXT = {
  next: /^next$/i,
  gotIt: /^got it$/i,
  signOut: /^sign out$/i,
  sleptOnIt: /^sleep on it$/i,
};

interface Fixtures {
  /** console.error messages and uncaught exceptions, collected from the start of the test */
  consoleErrors: string[];
  /** auto: stop Vite's HMR socket so edits made while tests run can't reload pages mid-test */
  freezeHmr: void;
  /** auto: Google Fonts with a short timeout, so a flaky network can't stall page loads */
  externalFonts: void;
  /** auto: any uncaught exception in the page fails the test */
  failOnPageError: void;
  /** auto: the desktop project tests the app itself, not the laptop phone frame around it (src/frame) */
  noPhoneFrame: void;
}

export const test = base.extend<Fixtures>({
  freezeHmr: [
    async ({ context }, use) => {
      // The Vite client opens ws://host/?token=…; a routed socket that never connects to the
      // server looks open to the page but never delivers an update. E2E_LIVE_HMR=1 turns this off.
      if (!process.env.E2E_LIVE_HMR) await context.routeWebSocket(/\/\?token=/, () => {});
      await use();
    },
    { auto: true },
  ],

  externalFonts: [
    async ({ context }, use) => {
      // index.html links Google Fonts. When DNS or the network is down, the stylesheet request
      // holds the load event for ~20 s and logs a console error. Fetch it for real when we can
      // (so layout checks use the real fonts) but give up quickly and serve an empty file.
      await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
        try {
          await route.fulfill({ response: await route.fetch({ timeout: 4_000 }) });
        } catch {
          const css = route.request().resourceType() === 'stylesheet';
          await route.fulfill({ status: 200, contentType: css ? 'text/css' : 'font/woff2', body: '' }).catch(() => {});
        }
      });
      await use();
    },
    { auto: true },
  ],

  noPhoneFrame: [
    async ({ context }, use, testInfo) => {
      // a 1280x800 window with a mouse would otherwise open Kip inside a phone, in an iframe;
      // this is what ?frame=0 remembers for the session
      if (testInfo.project.name === 'desktop') {
        await context.addInitScript(() => {
          try {
            sessionStorage.setItem('kip:frame', 'off');
          } catch {
            // no storage: nothing to remember
          }
        });
      }
      await use();
    },
    { auto: true },
  ],

  failOnPageError: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
      await use();
      expect(errors, 'uncaught exceptions in the page').toEqual([]);
    },
    { auto: true },
  ],

  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()} (${m.location().url})`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await use(errors);
  },
});

export { expect };

// ---------- getting into the app ----------

/** Welcome screen → "Explore with sample data" → home. Leaves the first-run tour alone. */
export async function enterDemo(page: Page) {
  await page.goto('/welcome');
  // Welcome has Hai să începem, an "Am deja cont" link
  // and a small "Încearcă cu date demo" link.
  await page.locator('.onb__demo').click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator('[data-tour="vault"]')).toBeVisible();
}

/** The first-run tour starts ~1.2 s after home appears; wait for it and skip it. */
export async function skipTour(page: Page) {
  const tour = page.locator('.tour');
  await expect(tour).toBeVisible({ timeout: 6_000 });
  await tour.locator('.tour__skip').click();
  await expect(tour).toBeHidden();
}

/** Demo home with the tour already dismissed: the starting point for most tests. */
export async function demoHome(page: Page) {
  await enterDemo(page);
  await skipTour(page);
}

export async function accountId(page: Page): Promise<string> {
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('kept.session') ?? 'null')?.accountId as string | undefined);
  if (!id) throw new Error('no signed-in account in localStorage (kept.session)');
  return id;
}

export const tourKey = (id: string) => `kept.tour.v1.${id}`;

export async function readStorage(page: Page, key: string) {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

/** Give a timer-driven UI (the tour starts after 1.2 s) time to show up if it were going to. */
export async function settle(page: Page, ms = 2_000) {
  await page.waitForTimeout(ms);
}

// ---------- Kip's dial ----------

// The dial's look is still changing (glass wedges, flat pills, flat slices), so these selectors
// only rely on its structure: a <nav> inside .dial that holds one button per section.
export const DIAL = { home: 0, goals: 1, activity: 2, profile: 3 } as const;
export const dialArc = (page: Page) => page.locator('.dial nav');
export const dialSlices = (page: Page) => page.locator('.dial nav button');

export async function openDial(page: Page) {
  const kip = page.locator('.dial__kip');
  await kip.click();
  await expect(kip).toHaveAttribute('aria-expanded', 'true');
  await expect(dialSlices(page)).toHaveCount(4);
}

/**
 * Open the dial and tap one section. When the slices are wedges cut out of one shared box with
 * clip-path, the middle of the box isn't on any slice, so tap the slice's label instead.
 */
export async function goViaDial(page: Page, index: number) {
  await openDial(page);
  const slice = dialSlices(page).nth(index);
  const label = slice.locator('.dial__word, span').first();
  await ((await label.count()) ? label : slice).click();
}

// ---------- numbers on screen ----------

/** "1,230 lei", "+129 lei", "−80 lei", "220.50 lei" (en-GB) → number of lei. */
export function lei(text: string | null | undefined): number {
  const m = (text ?? '').replace(/\s/g, '').match(/[−-]?\d[\d,]*(\.\d+)?/);
  if (!m) throw new Error(`no amount in "${text}"`);
  return Number(m[0].replace('−', '-').replace(/,/g, ''));
}

/** First whole number in a piece of text ("7 days" → 7). */
export function int(text: string | null | undefined): number {
  const m = (text ?? '').match(/\d+/);
  if (!m) throw new Error(`no number in "${text}"`);
  return Number(m[0]);
}

/**
 * Value shown by a NumberFlow counter. Its digits live in a shadow root and its aria-label is set
 * through ElementInternals, but the element carries its parsed value in a `data` attribute.
 */
export async function flowValue(counter: Locator): Promise<number> {
  const raw = await counter.getAttribute('data');
  if (!raw) throw new Error('NumberFlow element has no data attribute');
  return (JSON.parse(raw) as { value: number }).value;
}

// ---------- home ----------

/** A goal's row in the goals card on home. */
export const goalRow = (page: Page, name: string) => page.locator('.cop__goal', { has: page.locator('.cop__name', { hasText: name }) });

/** What a goal's row on home says is saved so far, in lei ("<b>1,230 lei</b> / 4,000 lei"). */
export async function rowSaved(row: Locator): Promise<number> {
  return lei(await row.locator('.cop__amt b').textContent());
}

/**
 * What plays after a saving: the celebration, or, when the saving also grew the streak, the streak
 * moment, which takes over from it (on a busy machine it can do so before a check sees the first).
 */
export const savingMoment = (page: Page) => page.locator('.party, .streak-moment').first();

/**
 * Close whatever plays after a saving: the celebration, and the streak moment if the saving also
 * grew the streak (a pending demo transfer already counts for the day). The streak moment waits
 * for the celebration, so keep going until nothing has shown for a while.
 */
export async function closeMoments(page: Page) {
  const streakGo = page.locator('.streak-moment__go');
  const partyGo = page.locator('.celebrate__go');
  let quietSince = Date.now();
  // short click timeouts: either screen can step aside for the other while a click is on its way
  for (let guard = 0; guard < 120 && Date.now() - quietSince < 7_000; guard++) {
    if (await streakGo.isVisible()) {
      await expect(streakGo).toHaveCSS('opacity', '1', { timeout: 20_000 }); // it fades in once the flame is lit
      await streakGo.click({ timeout: 2_000 }).catch(() => {});
      quietSince = Date.now();
    } else if (await partyGo.isVisible()) {
      await partyGo.click({ timeout: 2_000 }).catch(() => {});
      quietSince = Date.now();
    } else {
      await page.waitForTimeout(250);
    }
  }
  await expect(page.locator('.party, .streak-moment')).toHaveCount(0);
}

// ---------- one question per screen (signup and Obiectiv nou) ----------

export const continueButton = (page: Page) => page.locator('.start__foot .btn--primary');
export const progress = (page: Page) => page.locator('.start__progress[role="progressbar"]');
export const stepRuler = (page: Page) => page.locator('main.start__step [role="slider"]');

/**
 * Press Continue and wait for the next question. Steps swap with AnimatePresence mode="wait", so
 * the old step stays in the DOM while it animates out; wait for it to go before touching anything.
 */
export async function goNext(page: Page) {
  const old = await page.locator('main.start__step').elementHandle();
  await continueButton(page).click();
  await page.waitForFunction((el) => !el?.isConnected, old);
  await expect(page.locator('main.start__step')).toBeVisible();
}

/** Tap the ruler's big number, type an exact amount, press Enter. */
export async function typeAmount(page: Page, value: string, scope = page.locator('main.start__step')) {
  await scope.locator('.ruler-readout').click();
  const input = scope.locator('.ruler-type');
  await expect(input).toBeFocused();
  await page.keyboard.type(value);
  // typing replaces the old amount instead of appending to it
  await expect(input).toHaveValue(value);
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);
}

export async function width(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return box.width;
}
