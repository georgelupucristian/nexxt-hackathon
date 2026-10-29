// What the app itself needs to know about the laptop phone frame (PhoneFrame.tsx): whether it's
// running inside it, and how to leave it for pages that refuse to be framed.

/** True inside the phone frame's iframe. Cross-origin access throws, which also means framed. */
export const isEmbedded: boolean = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

/**
 * Opens `url` in the whole tab. Stripe Checkout won't load inside a frame, so inside the laptop
 * phone this navigates the top window; Stripe then returns to /?checkout=…, which the frame hands
 * back to the app. Outside the frame it's a plain `location.assign`.
 */
export function navigateTop(url: string): void {
  if (isEmbedded) {
    try {
      // `href` (not assign) is the one navigation a cross-origin parent still allows
      window.top!.location.href = url;
      return;
    } catch {
      // some other site framing Kip and blocking us: fall through and try in place
    }
  }
  window.location.assign(url);
}
