import { defineConfig } from '@playwright/test';

// End-to-end tests for Kept. Everything lives in localStorage, so each test gets a fresh browser
// context and builds its own state (usually by entering the demo account from the welcome screen).
//
// Test files are named *.e2e.ts, not *.spec.ts, so `npm test` (vitest) doesn't pick them up.

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

// Kip and the streak flame are drawn with WebGL2. Headless Chromium has no GPU here, so render
// through ANGLE's software backend instead of letting the app fall back to plain images.
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: './e2e/.results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // software WebGL is CPU-heavy; a few workers is plenty for this suite
  workers: 2, // the mascot and flame render with software WebGL here; more parallel browsers starve each other
  timeout: 90_000, // the navigation walk-through takes ~40 s on software WebGL
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: './e2e/.report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'ro-RO',
    timezoneId: 'Europe/Bucharest',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        launchOptions: { args: GL_ARGS },
      },
    },
    {
      name: 'desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
        launchOptions: {
          args: GL_ARGS,
          // Playwright hides scrollbars in headless mode by default. Keep them, so the desktop run
          // lays out like a real desktop browser (and the scrollbar regression test means something).
          ignoreDefaultArgs: ['--hide-scrollbars'],
        },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
