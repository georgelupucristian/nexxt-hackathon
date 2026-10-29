#!/usr/bin/env node
/*
 * Accessibility + performance audit for Kip.
 *
 * Walks the main screens of a running copy of the app in headless Chromium (phone viewport, the
 * same WebGL flags as the e2e suite), runs axe-core on each one, measures Web Vitals style timings,
 * tabs through Home to check focus indicators, and writes docs/audit.md.
 *
 *   npm run dev                                   # or: npm run build && npm run preview
 *   node scripts/audit.mjs                        # audits http://localhost:5173
 *   node scripts/audit.mjs --url http://localhost:4173 --out ../docs/audit.md --json audit.json
 *
 * No runtime dependency is added to the app: Playwright comes from the existing devDependency
 * (@playwright/test) and axe-core is a vendored copy in scripts/vendor/ (MPL-2.0, see the licence
 * file next to it). The script only reads the app; it never changes code.
 *
 * Timings from a Vite dev server are not representative (hundreds of unbundled modules); the report
 * says so. Run against `npm run preview` for numbers that match production.
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const AXE = path.join(HERE, 'vendor', 'axe.min.js');

// ---------- options ----------

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: node scripts/audit.mjs [--url http://localhost:5173] [--out ../docs/audit.md] [--json file] [--headed]');
  process.exit(0);
}
const BASE = opt('url', process.env.AUDIT_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const OUT = path.resolve(process.cwd(), opt('out', path.resolve(APP, '..', 'docs', 'audit.md')));
const JSON_OUT = opt('json', null);
const HEADED = args.includes('--headed');

// Same as playwright.config.ts: Kip and the streak flame use WebGL2; render it in software.
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'ro-RO',
  timezoneId: 'Europe/Bucharest',
};
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const IMPACTS = ['critical', 'serious', 'moderate', 'minor'];

// ---------- page instrumentation ----------

// Installed before any page script runs: collects LCP, CLS, long tasks and slow interactions.
function vitalsInit() {
  const v = { lcp: 0, lcpEl: '', cls: 0, shifts: {}, longTasks: [], events: [] };
  Object.defineProperty(window, '__vitals', { value: v, enumerable: false });
  const describe = (el) => {
    if (!el || !el.tagName) return '';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + cls;
  };
  const observe = (type, cb, extra = {}) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(cb)).observe({ type, buffered: true, ...extra });
    } catch {
      /* entry type not supported */
    }
  };
  observe('largest-contentful-paint', (e) => {
    v.lcp = e.startTime;
    v.lcpEl = describe(e.element);
  });
  observe('layout-shift', (e) => {
    if (e.hadRecentInput) return;
    v.cls += e.value;
    // which elements moved: split the shift's score evenly over its sources (good enough to rank them)
    const src = (e.sources ?? []).map((s) => describe(s.node) || '(removed node)');
    for (const d of src) v.shifts[d] = (v.shifts[d] ?? 0) + e.value / src.length;
  });
  observe('longtask', (e) => v.longTasks.push({ start: e.startTime, duration: e.duration }));
  observe('event', (e) => v.events.push({ name: e.name, duration: e.duration, start: e.startTime }), { durationThreshold: 16 });
}

async function readTimings(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const res = performance.getEntriesByType('resource');
    const v = window.__vitals ?? { lcp: 0, cls: 0, longTasks: [], events: [], lcpEl: '' };
    const tbt = v.longTasks.filter((t) => fcp && t.start >= fcp.startTime).reduce((s, t) => s + Math.max(0, t.duration - 50), 0);
    const bytes = (filter) => res.filter(filter).reduce((s, r) => s + (r.encodedBodySize || 0), 0);
    return {
      ttfb: nav ? nav.responseStart : null,
      fcp: fcp ? fcp.startTime : null,
      dcl: nav ? nav.domContentLoadedEventEnd : null,
      load: nav ? nav.loadEventEnd : null,
      lcp: v.lcp || null,
      lcpEl: v.lcpEl,
      cls: v.cls,
      shiftSources: Object.entries(v.shifts ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([el, score]) => ({ el, score })),
      tbt,
      longTasks: v.longTasks.length,
      longestTask: v.longTasks.reduce((m, t) => Math.max(m, t.duration), 0),
      requests: res.length + 1,
      jsBytes: bytes((r) => r.initiatorType === 'script' || /\.(m?js|tsx?)(\?|$)/.test(r.name)),
      totalBytes: bytes(() => true) + (nav?.encodedBodySize || 0),
      heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
      slowestEvent: v.events.reduce((m, e) => (e.duration > (m?.duration ?? 0) ? e : m), null),
    };
  });
}

async function runAxe(page) {
  if (!(await page.evaluate(() => typeof window.axe === 'object'))) await page.addScriptTag({ path: AXE });
  return page.evaluate(
    async (tags) => {
      const r = await window.axe.run(document, {
        runOnly: { type: 'tag', values: tags },
        resultTypes: ['violations', 'incomplete'],
      });
      const slim = (list) =>
        list.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          tags: v.tags,
          nodes: v.nodes.map((n) => ({
            target: n.target.join(' '),
            html: n.html,
            impact: n.impact,
            summary: n.failureSummary,
            data: (n.any[0] ?? n.all[0] ?? n.none[0])?.data ?? null,
          })),
        }));
      return { violations: slim(r.violations), incomplete: slim(r.incomplete), engine: r.testEngine.version };
    },
    AXE_TAGS,
  );
}

/**
 * Tab through the page until focus comes back round, and flag stops whose look doesn't change when
 * focused (heuristic: compares outline, box-shadow, background, border and underline focused vs
 * blurred, so a focus ring drawn on a parent with :focus-within is missed).
 */
async function focusWalk(page, maxStops = 60) {
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
    window.__tabSeen = new WeakSet();
  });
  const stops = [];
  for (let i = 0; i < maxStops; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { skip: true };
      if (window.__tabSeen.has(el)) return { wrapped: true };
      window.__tabSeen.add(el);
      const props = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'backgroundColor', 'borderTopColor', 'textDecorationLine'];
      const snap = () => {
        const cs = getComputedStyle(el);
        return props.map((p) => cs[p]).join('|');
      };
      const cs = getComputedStyle(el);
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      const focused = snap();
      el.blur();
      const rest = snap();
      el.focus({ preventScroll: true });
      const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.innerText || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const id = el.id ? '#' + el.id : '';
      const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      const r = el.getBoundingClientRect();
      const type = el.tagName === 'INPUT' ? `[type=${el.type}]` : '';
      return { sel: el.tagName.toLowerCase() + type + id + cls, name, visible: outline || focused !== rest, size: `${Math.round(r.width)}x${Math.round(r.height)}` };
    });
    if (info.wrapped) break;
    if (!info.skip) stops.push(info);
  }
  return stops;
}

// ---------- the walk ----------

async function settle(page, ms = 1200) {
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForTimeout(ms);
}

async function main() {
  const html = await fetch(BASE + '/').then((r) => r.text()).catch(() => null);
  if (!html) {
    console.error(`Nothing answers at ${BASE}. Start the app first (npm run dev, or npm run build && npm run preview).`);
    process.exit(2);
  }
  const devServer = html.includes('/@vite/client');

  const browser = await chromium.launch({ headless: !HEADED, args: GL_ARGS });
  const context = await browser.newContext({ ...PHONE, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addInitScript(vitalsInit);
  // Same guards as e2e/fixtures.ts: no HMR reloads mid-audit, and a dead network can't stall fonts.
  if (devServer) await context.routeWebSocket(/\/\?token=/, () => {});
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    try {
      await route.fulfill({ response: await route.fetch({ timeout: 5_000 }) });
    } catch {
      const css = route.request().resourceType() === 'stylesheet';
      await route.fulfill({ status: 200, contentType: css ? 'text/css' : 'font/woff2', body: '' }).catch(() => {});
    }
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && pageErrors.push('console.error: ' + m.text().slice(0, 200)));

  const screens = [];
  const load = [];
  async function audit(name, route, { navigate = true, timings = true, wait = 1200 } = {}) {
    process.stdout.write(`  ${name.padEnd(28)} `);
    const t0 = Date.now();
    if (navigate) await page.goto(BASE + route, { waitUntil: 'load', timeout: 60_000 });
    await settle(page, wait);
    const t = timings && navigate ? await readTimings(page) : null;
    load.push(os.loadavg()[0]);
    const axe = await runAxe(page);
    screens.push({ name, route, url: page.url().replace(BASE, ''), timings: t, axe });
    const n = axe.violations.reduce((s, v) => s + v.nodes.length, 0);
    console.log(`${axe.violations.length} rules, ${n} elements  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }

  console.log(`Auditing ${BASE} (${devServer ? 'Vite dev server' : 'production build'})`);

  // Guest screens. The first load is cold: no HTTP cache, nothing in localStorage.
  await audit('Welcome (cold load)', '/welcome');
  await audit('How it works', '/how-it-works');
  await audit('Sign-up (Start)', '/start');
  await audit('Sign in', '/signin');

  // Demo login, timed from the tap to Home showing the goal card.
  await page.goto(BASE + '/welcome', { waitUntil: 'load' });
  await settle(page, 600);
  const demoBtn = page.getByRole('button', { name: /încearcă cu date demo|explore with sample data/i });
  const btn = (await demoBtn.count()) ? demoBtn.first() : page.locator('.welcome .btn--ghost').first();
  const tDemo = Date.now();
  await btn.click();
  await page.waitForURL(/\/home$/, { timeout: 30_000 });
  await page.locator('[data-tour="vault"]').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
  const demoToHome = Date.now() - tDemo;
  const demoEvents = await page.evaluate(() => (window.__vitals?.events ?? []).slice());

  // First-run tour (a dialog over Home), then skip it.
  const tour = page.locator('.tour');
  let tourSeen = false;
  try {
    await tour.waitFor({ state: 'visible', timeout: 8_000 });
    tourSeen = true;
    await audit('Home + first-run tour', '/home', { navigate: false, wait: 800 });
    await tour.locator('.tour__skip').click();
    await tour.waitFor({ state: 'hidden', timeout: 8_000 });
  } catch {
    /* no tour this time */
  }

  await audit('Home', '/home');
  const focus = await focusWalk(page);

  const ids = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('kept.session') ?? 'null');
    const d = s ? JSON.parse(localStorage.getItem(`kept.data.${s.accountId}`) ?? 'null') : null;
    return { goal: d?.goals?.find((g) => g.status !== 'archived')?.id ?? d?.goals?.[0]?.id, tx: d?.transactions?.[0]?.id };
  });

  await audit('Goals', '/goals');
  if (ids.goal) await audit('Goal detail', `/goals/${ids.goal}`);
  await audit('New goal editor', '/goals/new');
  await audit('Activity', '/activity');
  if (ids.tx) await audit('Transaction detail', `/activity/${ids.tx}`);
  await audit('Profile', '/profile');
  await audit('Profile: privacy', '/profile/privacy');
  await audit('Profile: accessibility', '/profile/accessibility');

  await browser.close();

  const result = {
    base: BASE,
    devServer,
    when: new Date().toISOString(),
    axeVersion: screens[0]?.axe.engine,
    screens,
    demoToHome,
    demoSlowestEvent: demoEvents.reduce((m, e) => (e.duration > (m?.duration ?? 0) ? e : m), null),
    tourSeen,
    focus,
    pageErrors: [...new Set(pageErrors)],
    bundle: bundleSizes(),
    // other work on the machine skews every timing; the report states it
    cpu: { cores: os.cpus().length, loadMax: Math.max(...load), loadMin: Math.min(...load) },
  };
  if (JSON_OUT) fs.writeFileSync(path.resolve(process.cwd(), JSON_OUT), JSON.stringify(result, null, 2));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, report(result));

  const totals = severityTotals(groupViolations(screens));
  console.log(`\nViolations (unique rule + element): ` + IMPACTS.map((i) => `${i} ${totals[i].elements}`).join(', '));
  console.log(`Report: ${path.relative(process.cwd(), OUT)}`);
}

// ---------- bundle ----------

function bundleSizes() {
  const dir = path.join(APP, 'dist', 'assets');
  if (!fs.existsSync(dir)) return null;
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(js|css)$/.test(f))
    .map((f) => {
      const buf = fs.readFileSync(path.join(dir, f));
      return { file: f, bytes: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length, mtime: fs.statSync(path.join(dir, f)).mtime };
    })
    .sort((a, b) => b.bytes - a.bytes);
}

// ---------- report ----------

// Concrete advice for the rules this app is likely to trip; axe's help text covers the rest.
const FIXES = {
  'color-contrast': (n) =>
    n.data?.contrastRatio
      ? `Text is ${n.data.fgColor} on ${n.data.bgColor} = ${n.data.contrastRatio}:1, needs ${n.data.expectedContrastRatio}. Darken the text or lighten the background (or make it ≥ 24px / 18.66px bold).`
      : 'Raise the text/background contrast to 4.5:1 (3:1 for large text).',
  'button-name': () => 'Give the button an accessible name: visible text, aria-label, or aria-labelledby. Icon-only buttons need aria-label (in Romanian).',
  'link-name': () => 'Give the link text or an aria-label that says where it goes.',
  'image-alt': () => 'Add alt text; use alt="" if the image is decorative (e.g. Kip renders that repeat nearby text).',
  'svg-img-alt': () => 'Add role="img" with aria-label, or aria-hidden="true" if decorative.',
  label: () => 'Associate a <label for> with the input, or add aria-label / aria-labelledby.',
  'aria-allowed-attr': () => 'Remove ARIA attributes the element role does not support, or change the role.',
  'aria-prohibited-attr': () => 'aria-label is not allowed on this element without a role. Add a suitable role (e.g. role="img") or move the label to visible text.',
  'aria-required-children': () => 'A container role (list, tablist, menu, radiogroup) must contain the matching child roles. Add them or drop the container role.',
  'aria-required-parent': () => 'Wrap these items in the matching container role (e.g. role="tab" inside role="tablist").',
  'aria-hidden-focus': () => 'Focusable elements are inside aria-hidden. Add tabindex="-1"/inert to them, or stop hiding the container.',
  'aria-valid-attr-value': () => 'Fix the ARIA attribute value (e.g. aria-controls must point at an existing id).',
  'aria-progressbar-name': () => 'Give the progressbar an aria-label, e.g. "Progres obiectiv: 40%".',
  'aria-toggle-field-name': () => 'Give the switch/checkbox an accessible name (aria-label or a <label>).',
  'aria-command-name': () => 'Give the role="button"/"link"/"menuitem" element an accessible name.',
  'aria-dialog-name': () => 'Give the dialog aria-label or aria-labelledby pointing at its title.',
  'label-content-name-mismatch': () => 'The aria-label replaces the visible text, so voice-control users saying what they see miss it (WCAG 2.5.3). Start the aria-label with the visible text, or drop aria-label and let the visible text be the name.',
  'landmark-no-duplicate-banner': () => 'A top-level <header> is a banner landmark; panels add a second one. Use <div> for panel headers (or nest them inside the panel\'s <section>/<dialog>, where <header> loses the banner role).',
  'landmark-banner-is-top-level': () => 'Do not nest a banner (<header> at top level) inside another landmark; use <div> for inner headers.',
  bypass: () => 'Add a "skip to content" link or make sure the screen has a <main> landmark so keyboard users can jump past the header.',
  'nested-interactive': () => 'Do not put buttons or links inside another button/link; make the outer element a plain container.',
  'scrollable-region-focusable': () => 'Make the scroll container focusable (tabindex="0") with an accessible name, or ensure it contains focusable content.',
  'target-size': () => 'Make the tap target at least 24x24 CSS px (44x44 recommended on phones) or space it 24px from neighbours.',
  'heading-order': () => 'Do not skip heading levels (h1 then h2, not h1 then h4). Restyle with CSS instead.',
  'page-has-heading-one': () => 'Add one <h1> per screen (it can be visually hidden).',
  'landmark-one-main': () => 'Wrap the screen content in <main>.',
  'landmark-unique': (n) =>
    /^<header/.test(n.html ?? '')
      ? 'Same cause as the duplicate banner: the panel <header> is a second banner with no name. Changing it to <div> fixes both rules.'
      : 'Two landmarks share a role and have no distinct name. Give each an aria-label (e.g. two <nav>s: "Meniu", "Pași").',
  'landmark-no-duplicate-main': () => 'Only one <main> per page; panels opened over the hub should not add a second one.',
  'landmark-main-is-top-level': () => 'Do not nest <main> inside another landmark.',
  'landmark-complementary-is-top-level': () => 'Move the <aside> out of other landmarks or drop the landmark role.',
  region: () => 'Put this content inside a landmark (<main>, <nav>, <header>, <footer>), or mark it aria-hidden if purely decorative.',
  'meta-viewport': () => 'Remove user-scalable=no / maximum-scale<5 from the viewport meta so people can zoom.',
  'list': () => '<ul>/<ol> may only contain <li> (or script/template) children.',
  listitem: () => '<li> must be inside a <ul> or <ol>.',
  'duplicate-id-aria': () => 'ids referenced by ARIA must be unique; generate them with useId().',
  'empty-heading': () => 'Headings need text; remove the heading tag or give it content.',
  'frame-title': () => 'Give the iframe a title.',
  'presentation-role-conflict': () => 'role="presentation"/"none" is ignored on focusable or labelled elements. Remove the role or the focusability/label.',
};

function groupViolations(screens) {
  const rules = new Map();
  for (const s of screens) {
    for (const v of s.axe.violations) {
      if (!rules.has(v.id)) rules.set(v.id, { ...v, nodes: new Map(), screens: new Set() });
      const r = rules.get(v.id);
      r.screens.add(s.name);
      for (const n of v.nodes) {
        const key = n.target;
        if (!r.nodes.has(key)) r.nodes.set(key, { ...n, screens: new Set() });
        r.nodes.get(key).screens.add(s.name);
      }
    }
  }
  return [...rules.values()].sort((a, b) => IMPACTS.indexOf(a.impact) - IMPACTS.indexOf(b.impact) || b.nodes.size - a.nodes.size);
}

function severityTotals(groups) {
  const t = Object.fromEntries(IMPACTS.map((i) => [i, { rules: 0, elements: 0 }]));
  for (const g of groups) {
    const i = g.impact ?? 'minor';
    t[i].rules += 1;
    t[i].elements += g.nodes.size;
  }
  return t;
}

const ms = (x) => (x == null ? 'n/a' : x >= 1000 ? `${(x / 1000).toFixed(2)} s` : `${Math.round(x)} ms`);
const kb = (b) => (b == null ? 'n/a' : `${(b / 1024).toFixed(0)} kB`);
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/</g, '&lt;');
const code = (s, max = 110) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return '`' + (t.length > max ? t.slice(0, max - 1) + '…' : t).replace(/`/g, "'").replace(/\|/g, '\\|') + '`';
};
// Web Vitals thresholds (good / needs improvement), https://web.dev/articles/vitals
const rate = (v, good, poor) => (v == null ? '' : v <= good ? ' (good)' : v <= poor ? ' (needs work)' : ' (poor)');

const firstFix = (g) => {
  const n = [...g.nodes.values()][0];
  return FIXES[g.id]?.(n) ?? (n.summary ?? '').replace(/^Fix (any|all) of the following:\s*/i, '').split('\n').map((x) => x.trim()).filter(Boolean).join('; ');
};
const focusFix = (f) =>
  /^input\[type=range\]/.test(f.sel)
    ? 'A range input with `appearance: none` loses the browser focus ring. Add `input[type=range]:focus-visible { outline: 2px solid currentColor; outline-offset: 4px }` (or ring the thumb via `::-webkit-slider-thumb`).'
    : 'Add a `:focus-visible` outline or box-shadow (2px, 3:1 contrast against the background).';
const SHIFT_FIX =
  'Reserve the space before content arrives: fixed `width`/`height` or `aspect-ratio` on images and the mascot, `min-height` on cards whose numbers fill in after load, and animate entrances with `transform`/`opacity` only.';

function report(r) {
  const groups = groupViolations(r.screens);
  const totals = severityTotals(groups);
  const L = [];
  L.push('# Accessibility and performance audit', '');
  L.push(`Generated by \`app/scripts/audit.mjs\` on ${r.when.slice(0, 16).replace('T', ' ')} UTC against \`${r.base}\` (${r.devServer ? 'Vite dev server' : 'production build'}).`);
  L.push(`axe-core ${r.axeVersion}, rules tagged ${AXE_TAGS.map((t) => '`' + t + '`').join(', ')}. Headless Chromium, phone viewport 390x844 @3x, ro-RO, reduced motion on so axe sees settled screens, software WebGL (SwiftShader).`);
  L.push('', 'Re-run: `cd app && npm run dev` (or `npm run build && npm run preview`), then `node scripts/audit.mjs [--url http://localhost:4173]`.', '');

  L.push('## Headline', '');
  L.push('| Severity | Rules failing | Elements affected |', '|---|---:|---:|');
  for (const i of IMPACTS) L.push(`| ${i} | ${totals[i].rules} | ${totals[i].elements} |`);
  const allEls = IMPACTS.reduce((s, i) => s + totals[i].elements, 0);
  L.push(`| **total** | **${groups.length}** | **${allEls}** |`, '');
  L.push(`Elements are counted once even when the same element fails on several screens (the hub, dial and tab bar sit under every panel). ${r.screens.length} screens audited.`, '');

  L.push('### Per screen', '');
  L.push('| Screen | Route | Critical | Serious | Moderate | Minor | Needs review |', '|---|---|---:|---:|---:|---:|---:|');
  for (const s of r.screens) {
    const c = (imp) => s.axe.violations.filter((v) => v.impact === imp).reduce((n, v) => n + v.nodes.length, 0);
    L.push(`| ${s.name} | \`${s.url}\` | ${c('critical')} | ${c('serious')} | ${c('moderate')} | ${c('minor')} | ${s.axe.incomplete.reduce((n, v) => n + v.nodes.length, 0)} |`);
  }
  L.push('');

  // What to fix first: every critical/serious rule, moderate rules seen on 3+ screens, keyboard
  // stops with no focus ring, layout shift above 0.1, and an oversized single JS chunk.
  const todo = [];
  for (const g of groups) {
    const imp = g.impact ?? 'minor';
    if (imp === 'critical' || imp === 'serious' || (imp === 'moderate' && g.screens.size >= 3))
      todo.push(`**${imp}** \`${g.id}\` (${g.nodes.size} element${g.nodes.size === 1 ? '' : 's'}; ${g.screens.size === r.screens.length ? 'every screen' : [...g.screens].join(', ')}): ${esc(firstFix(g))}`);
  }
  for (const f of r.focus.filter((x) => !x.visible)) todo.push(`**focus** no visible focus on ${code(f.sel, 60)} ("${esc(f.name)}") on Home: ${focusFix(f)}`);
  const shifty = r.screens.filter((s) => s.timings && s.timings.cls > 0.1);
  if (shifty.length)
    todo.push(`**layout shift** CLS above 0.1 on ${shifty.map((s) => `${s.name} (${s.timings.cls.toFixed(2)})`).join(', ')}; sources under Performance. ${SHIFT_FIX}`);
  const jsChunks = (r.bundle ?? []).filter((b) => b.file.endsWith('.js'));
  if (jsChunks.length === 1 && jsChunks[0].bytes > 500 * 1024)
    todo.push(`**bundle** one ${kb(jsChunks[0].bytes)} JavaScript chunk (${kb(jsChunks[0].gzip)} gzip): split by route with \`React.lazy\`.`);
  if (todo.length) {
    L.push('## Fix first', '');
    todo.forEach((t, i) => L.push(`${i + 1}. ${t}`));
    L.push('');
  }

  L.push('## Violations by severity', '');
  if (!groups.length) L.push('No axe violations on the audited screens.', '');
  for (const imp of IMPACTS) {
    const gs = groups.filter((g) => (g.impact ?? 'minor') === imp);
    if (!gs.length) continue;
    L.push(`### ${imp[0].toUpperCase() + imp.slice(1)}`, '');
    for (const g of gs) {
      const nodes = [...g.nodes.values()];
      L.push(`#### \`${g.id}\`: ${esc(g.help)} (${nodes.length} element${nodes.length === 1 ? '' : 's'})`, '');
      L.push(`Screens: ${[...g.screens].join(', ')}. Rule docs: ${g.helpUrl.replace(/\?.*$/, '')}`, '');
      L.push('| Element | Screens | Suggested fix |', '|---|---|---|');
      const shown = nodes.slice(0, 12);
      for (const n of shown) {
        const fix = FIXES[g.id]?.(n) ?? (n.summary ?? '').replace(/^Fix (any|all) of the following:\s*/i, '').split('\n').map((x) => x.trim()).filter(Boolean).join('; ');
        L.push(`| ${code(n.target, 70)}<br>${code(n.html)} | ${n.screens.size === r.screens.length ? 'all' : [...n.screens].join(', ')} | ${esc(fix)} |`);
      }
      if (nodes.length > shown.length) L.push(`| … ${nodes.length - shown.length} more | | same fix |`);
      L.push('');
    }
  }

  // incomplete = axe could not decide (usually contrast over gradients, images or WebGL)
  const review = new Map();
  for (const s of r.screens)
    for (const v of s.axe.incomplete) {
      const e = review.get(v.id) ?? { help: v.help, n: new Set() };
      v.nodes.forEach((n) => e.n.add(n.target));
      review.set(v.id, e);
    }
  if (review.size) {
    L.push('### Needs manual review', '');
    L.push('axe could not decide these (typically text over gradients, images or the WebGL canvas). Check them by eye or with a contrast picker.', '');
    L.push('| Rule | What to check | Elements |', '|---|---|---:|');
    for (const [id, e] of [...review.entries()].sort((a, b) => b[1].n.size - a[1].n.size)) L.push(`| \`${id}\` | ${esc(e.help)} | ${e.n.size} |`);
    L.push('');
  }

  L.push('## Keyboard focus on Home', '');
  const noRing = r.focus.filter((f) => !f.visible);
  L.push(`Tabbing from the top of Home reached ${r.focus.length} stops; ${noRing.length} showed no outline or box-shadow while focused (heuristic: a custom focus style using only colour or background would be missed here, so check those by eye).`, '');
  if (r.focus.length) {
    L.push('| # | Element | Accessible text | Size | Focus visible |', '|---:|---|---|---|---|');
    r.focus.forEach((f, i) => L.push(`| ${i + 1} | ${code(f.sel, 60)} | ${esc(f.name) || '*(none)*'} | ${f.size} | ${f.visible ? 'yes' : '**no**'} |`));
    L.push('');
  }
  for (const f of noRing) L.push(`Suggested fix for ${code(f.sel, 60)}: ${focusFix(f)}`, '');

  L.push('## Performance', '');
  if (r.devServer)
    L.push('> Measured on the Vite dev server: every module is a separate request and nothing is minified, so load timings here are several times worse than production. Re-run against `npm run preview` for representative numbers.', '');
  L.push('Thresholds from web.dev (LCP good ≤ 2.5 s, FCP ≤ 1.8 s, CLS ≤ 0.1, TBT ≤ 200 ms, INP ≤ 200 ms). Localhost network, no CPU throttling, but WebGL runs on the CPU, so main-thread numbers are pessimistic next to a phone GPU. TBT only counts long tasks after first paint; long tasks before it delay FCP instead, so both columns are shown.', '');
  if (r.cpu)
    L.push(`Machine load while measuring: 1-minute load average ${r.cpu.loadMin.toFixed(1)} to ${r.cpu.loadMax.toFixed(1)} on ${r.cpu.cores} cores.${r.cpu.loadMax > r.cpu.cores * 0.75 ? ' Other jobs were competing for the CPU, so read the timings as an upper bound and compare screens with each other rather than with the thresholds. An "n/a" means Chromium reported no paint entry for that load.' : ''}`, '');
  L.push('| Screen | TTFB | FCP | LCP | CLS | TBT | Long tasks (longest) | Load | Requests | JS | Total |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const s of r.screens.filter((x) => x.timings)) {
    const t = s.timings;
    L.push(`| ${s.name} | ${ms(t.ttfb)} | ${ms(t.fcp)}${rate(t.fcp, 1800, 3000)} | ${ms(t.lcp)}${rate(t.lcp, 2500, 4000)} | ${t.cls.toFixed(3)}${rate(t.cls, 0.1, 0.25)} | ${ms(t.tbt)}${rate(t.tbt, 200, 600)} | ${t.longTasks} (${ms(t.longestTask)}) | ${ms(t.load)} | ${t.requests} | ${kb(t.jsBytes)} | ${kb(t.totalBytes)} |`);
  }
  L.push('');
  if (shifty.length) {
    L.push('**Layout shift sources** (screens with CLS above 0.1; each shift\'s score split over the elements that moved):', '');
    for (const s of shifty)
      L.push(`- ${s.name}: ${(s.timings.shiftSources ?? []).map((x) => `${code(x.el, 60)} ${x.score.toFixed(3)}`).join(', ') || 'no source reported'}`);
    L.push('', `Suggested fix: ${SHIFT_FIX}`, '');
  }
  const first = r.screens[0]?.timings;
  if (first?.lcpEl) L.push(`LCP element on the cold Welcome load: \`${first.lcpEl}\`.`, '');
  L.push(`Tap on "Încearcă cu date demo" to Home showing the goal card: **${ms(r.demoToHome)}** (includes building the demo account and the route change).`);
  if (r.demoSlowestEvent) L.push(`Slowest interaction during that tap (Event Timing, an INP proxy): **${ms(r.demoSlowestEvent.duration)}** \`${r.demoSlowestEvent.name}\`${rate(r.demoSlowestEvent.duration, 200, 500)}.`);
  const heap = r.screens.map((s) => s.timings?.heapMB).filter((x) => x != null);
  if (heap.length) L.push(`JS heap after load: ${Math.min(...heap).toFixed(0)} to ${Math.max(...heap).toFixed(0)} MB.`);
  L.push('');

  if (r.bundle?.length) {
    L.push('### Production bundle (`app/dist/assets`)', '');
    L.push(`From the last \`npm run build\` (${new Date(Math.max(...r.bundle.map((b) => +b.mtime))).toISOString().slice(0, 16).replace('T', ' ')} UTC).`, '');
    L.push('| File | Size | gzip |', '|---|---:|---:|');
    for (const b of r.bundle) L.push(`| \`${b.file}\` | ${kb(b.bytes)} | ${kb(b.gzip)} |`);
    L.push('');
    const js = r.bundle.filter((b) => b.file.endsWith('.js'));
    if (js.length === 1 && js[0].bytes > 500 * 1024)
      L.push(`All JavaScript ships as one ${kb(js[0].bytes)} chunk (${kb(js[0].gzip)} gzip). Suggested fix: lazy-load the signed-in screens and the WebGL mascot with \`React.lazy\`/dynamic \`import()\`, and import icons per file rather than whole icon sets, so Welcome needs only what it shows.`, '');
  }

  L.push('## Errors seen while auditing', '');
  L.push(r.pageErrors.length ? r.pageErrors.map((e) => `- ${code(e, 200)}`).join('\n') : 'None: no uncaught exceptions or console errors on any audited screen.', '');

  L.push('## Scope and limits', '');
  L.push('- Automated checks find roughly a third to a half of WCAG issues. Screen-reader passes (TalkBack, VoiceOver), zoom to 200% and real-device performance still need a person.');
  L.push('- Only the default demo state is audited; empty states, error states and the sheets opened from buttons are not.');
  L.push('- The report lists problems only. Fixes belong in `app/src` and are tracked separately.');
  return L.join('\n') + '\n';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
