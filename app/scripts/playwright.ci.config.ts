import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Project } from '@playwright/test';
import base from '../playwright.config';

/*
 * The e2e suite against the production build (`vite preview`), as CI runs it:
 *
 *   npm run build
 *   npx playwright test -c scripts/playwright.ci.config.ts --project=phone
 *
 * Everything comes from ../playwright.config.ts (projects, WebGL flags, locale, timezone); this file
 * only swaps the dev server for the built preview and gives slow CI machines more time. Paths are
 * re-anchored on app/ because Playwright resolves them relative to the config file.
 *
 * E2E_PORT    port for the preview server (default 4173, so it never collides with `npm run dev`)
 * E2E_WORKERS parallel browsers (default: 1 on CI, the base config's value locally)
 * E2E_OUT     folder for traces and the HTML report (default app/e2e, i.e. e2e/.results and
 *             e2e/.report like the dev config). Point it elsewhere to run next to another suite.
 */

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CI = !!process.env.CI;
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://localhost:${PORT}`;
const OUT = process.env.E2E_OUT ? path.resolve(process.env.E2E_OUT) : path.join(APP, 'e2e');

// Shared-memory /dev/shm is tiny in containers; Chromium crashes tabs when it fills up.
const CI_ARGS = ['--disable-dev-shm-usage'];

const projects: Project[] = (base.projects ?? []).map((p) => ({
  ...p,
  use: {
    ...p.use,
    launchOptions: {
      ...p.use?.launchOptions,
      args: [...(p.use?.launchOptions?.args ?? []), ...CI_ARGS],
    },
  },
}));

export default defineConfig({
  ...base,
  testDir: path.join(APP, 'e2e'),
  outputDir: path.join(OUT, '.results'),
  // Kip and the flame render through software WebGL (SwiftShader). A 2-vCPU runner is several times
  // slower than a laptop, so: one browser at a time, longer test and assertion timeouts, 2 retries.
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : CI ? 1 : base.workers,
  timeout: CI ? 180_000 : base.timeout,
  expect: { ...base.expect, timeout: CI ? 20_000 : base.expect?.timeout },
  retries: CI ? 2 : 0,
  // 'github' turns failures into annotations on the PR diff
  reporter: [
    ...(CI ? [['github'] as const] : []),
    ['list'],
    ['html', { outputFolder: path.join(OUT, '.report'), open: 'never' }],
  ],
  use: {
    ...base.use,
    baseURL: BASE_URL,
    // The production build registers a service worker; the suite was written against the dev
    // server, which has none. Blocking it keeps the two runs comparable.
    serviceWorkers: 'block',
    // Navigation waits for the load event, which on a cold runner can trail the 30 s default.
    navigationTimeout: CI ? 60_000 : undefined,
    // Without this a click on a selector that no longer exists waits out the whole 3-minute test
    // timeout, on every retry. 45 s is still far more than any real click needs.
    actionTimeout: CI ? 45_000 : undefined,
  },
  projects,
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    cwd: APP,
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
