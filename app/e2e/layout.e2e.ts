import type { Page } from '@playwright/test';
import { demoHome, expect, test } from './fixtures';

/**
 * How far the page (or a section panel's scroller) can be scrolled sideways, plus the widest
 * elements past the right edge to make a failure easy to chase.
 */
function measureOverflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const scrollers = [document.documentElement, document.body, ...document.querySelectorAll<HTMLElement>('.panel__body')];
    const px = Math.max(...scrollers.map((el) => el.scrollWidth - el.clientWidth));
    const culprits = [...document.querySelectorAll<HTMLElement>('body *')]
      .map((el) => ({ el, right: el.getBoundingClientRect().right }))
      .filter(({ el, right }) => right > vw + 1 && el.getBoundingClientRect().width > 0)
      .sort((a, b) => b.right - a.right)
      .slice(0, 5)
      .map(({ el, right }) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''} (right ${Math.round(right)} > ${vw})`);
    return { px, culprits };
  });
}

async function expectNoSidewaysScroll(page: Page, where: string) {
  // panels spring open from Kip, so give transforms a moment to land before judging
  await expect(async () => {
    const { px, culprits } = await measureOverflow(page);
    expect(px, `${where} scrolls sideways by ${px}px. Widest: ${culprits.join(', ') || 'n/a'}`).toBeLessThanOrEqual(1);
  }).toPass({ timeout: 6_000 });
}

test('no horizontal overflow on the main screens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone layout check');

  await page.goto('/welcome');
  await expect(page.getByRole('heading', { name: 'Saving on a student budget? Totally doable.' })).toBeVisible();
  await expectNoSidewaysScroll(page, '/welcome');

  await page.goto('/start');
  await expect(page.getByRole('heading', { name: 'How old are you?' })).toBeVisible();
  await expectNoSidewaysScroll(page, '/start');

  await page.goto('/welcome');
  await demoHome(page);
  await expectNoSidewaysScroll(page, '/home');

  for (const path of ['/goals', '/activity', '/profile']) {
    await page.goto(path);
    await expect(page.locator('section.panel')).toBeVisible();
    await expectNoSidewaysScroll(page, path);
  }
});
