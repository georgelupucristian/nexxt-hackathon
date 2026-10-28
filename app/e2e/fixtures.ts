import { test as base, expect, type Locator, type Page } from '@playwright/test';

/*
 * Shared fixtures and helpers.
 *
 * Selectors lean on structure (CSS classes, roles, aria-*, data-*) because the UI copy is being
 * translated to Romanian. Where text has to be matched, the regexes accept both languages.
 */

export const TEXT = {
  next: /^(next|mai departe)$/i,
  gotIt: /^(got it|am înțeles)$/i,
  signOut: /^(sign out|ieși din cont)$/i,
  sleptOnIt: /^(slept on it|dorm pe idee)$/i,
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
  // Welcome has three buttons: Get started (primary), I already have an account (secondary)
  // and Explore with sample data (ghost).
  await page.locator('.welcome .btn--ghost').click();
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

/** "1.230 lei", "+129 lei", "−80 lei", "220,50 lei" (ro-RO) → number of lei. */
export function lei(text: string | null | undefined): number {
  const m = (text ?? '').replace(/\s/g, '').match(/[−-]?\d[\d.]*(,\d+)?/);
  if (!m) throw new Error(`no amount in "${text}"`);
  return Number(m[0].replace('−', '-').replace(/\./g, '').replace(',', '.'));
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

/** The big "Saved" total in the vault, in lei. */
export async function vaultTotal(page: Page): Promise<number> {
  return flowValue(page.locator('[data-tour="vault"] .vault__amount number-flow-react'));
}

export async function width(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return box.width;
}
