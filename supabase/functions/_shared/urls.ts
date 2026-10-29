// Where Stripe sends people back after Checkout. Pure, so it is unit tested without env vars;
// env.ts wires it to the request's Origin header and APP_URL.

export const FALLBACK_APP_URL = 'http://localhost:5173';

/** An http(s) URL without the trailing slash, or null when `raw` isn't one (e.g. "localhost:5173"). */
export function webUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.origin}${u.pathname}`.replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

/**
 * Stripe rejects anything that isn't a full URL, and the app runs on more than one address (dev
 * ports, Vercel previews), so the app that made the request wins when it is one of ours; the
 * configured APP_URL (already cleaned by webUrl) is the fallback.
 */
export function returnUrl(originHeader: string | null, configured: string | null): string {
  const origin = webUrl(originHeader);
  if (origin) {
    const host = new URL(origin).hostname;
    if (origin === configured || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) return origin;
  }
  return configured ?? FALLBACK_APP_URL;
}
