// The pure half of the laptop phone frame (see PhoneFrame.tsx): when to draw the phone, which
// address the app inside it gets, how big the phone can be, and what colour its status bar takes.
// No DOM in here, so all of it is unit tested (logic.test.ts).

/** A mouse, and room for a phone with air around it: a laptop or a desktop, not a phone or a tablet. */
export const DESKTOP_QUERY = '(min-width: 900px) and (hover: hover) and (pointer: fine)';

/** `?frame=1` forces the phone on, `?frame=0` turns it off; either one lasts for the tab's session. */
export const FRAME_PARAM = 'frame';
export const FRAME_KEY = 'kip:frame';

export type Override = 'on' | 'off' | null;

/** `?frame`, `?frame=1`, `?frame=on` → on; `?frame=0`, `off`, `false`, `no` → off; no flag → null. */
export function parseOverride(value: string | null | undefined): Override {
  if (value == null) return null;
  return /^(0|off|false|no)$/i.test(value.trim()) ? 'off' : 'on';
}

/** What sessionStorage remembered, if it's something we wrote. */
export function storedOverride(value: string | null | undefined): Override {
  return value === 'on' || value === 'off' ? value : null;
}

export function shouldFrame({ embedded, override, desktop }: { embedded: boolean; override: Override; desktop: boolean }): boolean {
  if (embedded) return false; // the app inside the phone never draws a phone of its own
  if (override) return override === 'on';
  return desktop;
}

const keyOf = (pair: string): string => {
  const k = pair.split('=')[0].replace(/\+/g, ' ');
  try {
    return decodeURIComponent(k);
  } catch {
    return k;
  }
};

/**
 * `path` (pathname + search + hash) without the `frame` flag. Everything else stays byte for byte,
 * so Stripe's `?checkout=success&session_id=…` reaches the app exactly as Stripe sent it.
 */
export function withoutFlag(path: string): string {
  const hashAt = path.indexOf('#');
  const hash = hashAt < 0 ? '' : path.slice(hashAt);
  const rest = hashAt < 0 ? path : path.slice(0, hashAt);
  const queryAt = rest.indexOf('?');
  if (queryAt < 0) return path;
  const kept = rest
    .slice(queryAt + 1)
    .split('&')
    .filter((pair) => pair !== '' && keyOf(pair) !== FRAME_PARAM);
  return rest.slice(0, queryAt) + (kept.length ? `?${kept.join('&')}` : '') + hash;
}

/** The value of the `frame` flag in a query string, '' for a bare `?frame`, null when it's absent. */
export function flagIn(search: string): string | null {
  return new URLSearchParams(search).get(FRAME_PARAM);
}

/**
 * Where the phone goes and how much it shrinks: as big as it really is when the window has room,
 * smaller when it doesn't, never cropped. Whole pixels, so the screen's text stays sharp.
 */
export function fitDevice(win: { w: number; h: number }, device: { w: number; h: number }, margin: number) {
  const scale = Math.max(0.2, Math.min(1, (win.h - 2 * margin) / device.h, (win.w - 2 * margin) / device.w));
  const w = Math.round(device.w * scale);
  const h = Math.round(device.h * scale);
  return { scale, w, h, x: Math.round((win.w - w) / 2), y: Math.round((win.h - h) / 2) };
}

// ---------- the status bar's colour ----------

export type Rgba = [r: number, g: number, b: number, a: number];

/** `rgb(…)` / `rgba(…)` / `color(srgb …)` as getComputedStyle reports them; null for anything else. */
export function parseColor(css: string): Rgba | null {
  const srgb = css.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\)$/);
  if (srgb) {
    const a = srgb[4] === undefined ? 1 : srgb[4].endsWith('%') ? parseFloat(srgb[4]) / 100 : parseFloat(srgb[4]);
    return [parseFloat(srgb[1]) * 255, parseFloat(srgb[2]) * 255, parseFloat(srgb[3]) * 255, a];
  }
  const m = css.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), a];
}

/**
 * What you actually see through a stack of backgrounds, listed top first (as elementsFromPoint
 * gives them): a sheet's scrim over the page reads as the dimmed page, not as the page.
 */
export function composite(layers: Rgba[], fallback: Rgba): [number, number, number] {
  const firstOpaque = layers.findIndex((l) => l[3] >= 0.99);
  const base = firstOpaque < 0 ? fallback : layers[firstOpaque];
  let [r, g, b] = base;
  const above = firstOpaque < 0 ? layers : layers.slice(0, firstOpaque);
  for (let i = above.length - 1; i >= 0; i--) {
    const [lr, lg, lb, la] = above[i];
    r = lr * la + r * (1 - la);
    g = lg * la + g * (1 - la);
    b = lb * la + b * (1 - la);
  }
  return [Math.round(r), Math.round(g), Math.round(b)];
}

/** Perceived brightness, 0 to 255. */
export const luma = ([r, g, b]: readonly number[]): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Dark enough that the status bar's time and icons should turn white. */
export function isDark(rgb: [number, number, number]): boolean {
  return luma(rgb) < 150;
}
