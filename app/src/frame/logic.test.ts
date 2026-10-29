import { describe, expect, it } from 'vitest';
import { composite, fitDevice, flagIn, isDark, parseColor, parseOverride, shouldFrame, storedOverride, withoutFlag } from './logic';

describe('when the laptop phone frame shows', () => {
  it('reads ?frame: bare or truthy turns it on, 0/off/false/no turns it off', () => {
    expect(parseOverride(null)).toBe(null);
    expect(parseOverride(undefined)).toBe(null);
    expect(parseOverride('')).toBe('on');
    expect(parseOverride('1')).toBe('on');
    expect(parseOverride('on')).toBe('on');
    expect(parseOverride('0')).toBe('off');
    expect(parseOverride('OFF')).toBe('off');
    expect(parseOverride('false')).toBe('off');
    expect(parseOverride(' no ')).toBe('off');
  });

  it('trusts only what it wrote to sessionStorage', () => {
    expect(storedOverride('on')).toBe('on');
    expect(storedOverride('off')).toBe('off');
    expect(storedOverride('1')).toBe(null);
    expect(storedOverride(null)).toBe(null);
  });

  it('finds the flag in a query string', () => {
    expect(flagIn('?frame')).toBe('');
    expect(flagIn('?a=1&frame=0')).toBe('0');
    expect(flagIn('?checkout=success')).toBe(null);
    expect(flagIn('')).toBe(null);
  });

  it('frames a desktop window, never the app inside the frame, and lets the flag win', () => {
    expect(shouldFrame({ embedded: false, override: null, desktop: true })).toBe(true);
    expect(shouldFrame({ embedded: false, override: null, desktop: false })).toBe(false);
    expect(shouldFrame({ embedded: false, override: 'off', desktop: true })).toBe(false);
    expect(shouldFrame({ embedded: false, override: 'on', desktop: false })).toBe(true);
    expect(shouldFrame({ embedded: true, override: 'on', desktop: true })).toBe(false);
  });
});

describe('the address the phone loads and the laptop shows', () => {
  it('drops the flag and nothing else', () => {
    expect(withoutFlag('/home?frame')).toBe('/home');
    expect(withoutFlag('/home?frame=1')).toBe('/home');
    expect(withoutFlag('/home?frame=0#top')).toBe('/home#top');
    expect(withoutFlag('/goals/g1?tab=plan&frame=1&x=2#h')).toBe('/goals/g1?tab=plan&x=2#h');
    expect(withoutFlag('/?fr%61me=1&a=b')).toBe('/?a=b');
  });

  it("leaves Stripe's return address byte for byte", () => {
    const back = '/?checkout=success&session_id=cs_test_a1B2%2Bc3';
    expect(withoutFlag(back)).toBe(back);
    expect(withoutFlag(`${back}&frame=1`)).toBe(back);
    expect(withoutFlag('/?frame&checkout=cancel')).toBe('/?checkout=cancel');
  });

  it('passes paths without a query through untouched, hash and all', () => {
    expect(withoutFlag('/welcome')).toBe('/welcome');
    expect(withoutFlag('/profile#frame=1')).toBe('/profile#frame=1');
    expect(withoutFlag('/x?#y')).toBe('/x#y');
    expect(withoutFlag('/framed?frames=2')).toBe('/framed?frames=2');
  });
});

describe('fitting the phone in the window', () => {
  const device = { w: 418, h: 872 };

  it('stays at its real size when there is room', () => {
    expect(fitDevice({ w: 1920, h: 1080 }, device, 32)).toEqual({ scale: 1, w: 418, h: 872, x: 751, y: 104 });
  });

  it('shrinks to the window height with the margin kept, centred in whole pixels', () => {
    const f = fitDevice({ w: 1280, h: 800 }, device, 32);
    expect(f.scale).toBeCloseTo(736 / 872);
    expect(f.h).toBe(736);
    expect(f.y).toBe(32);
    expect(f.x).toBe(Math.round((1280 - f.w) / 2));
    for (const v of [f.w, f.h, f.x, f.y]) expect(Number.isInteger(v)).toBe(true);
  });

  it('shrinks to the width too, so it is never cropped', () => {
    const f = fitDevice({ w: 400, h: 1200 }, device, 16);
    expect(f.w).toBeLessThanOrEqual(400 - 32 + 1);
    expect(f.h).toBeLessThanOrEqual(1200);
  });
});

describe('the status bar colour', () => {
  it('parses what getComputedStyle reports', () => {
    expect(parseColor('rgb(234, 244, 255)')).toEqual([234, 244, 255, 1]);
    expect(parseColor('rgba(14, 26, 51, 0.4)')).toEqual([14, 26, 51, 0.4]);
    expect(parseColor('rgb(14 26 51 / 40%)')).toEqual([14, 26, 51, 0.4]);
    expect(parseColor('rgba(0, 0, 0, 0)')).toEqual([0, 0, 0, 0]);
    expect(parseColor('color(srgb 1 0.5 0)')).toEqual([255, 127.5, 0, 1]);
    expect(parseColor('transparent')).toBe(null);
  });

  it('is the first opaque background, seen through the translucent ones above it', () => {
    const page: [number, number, number, number] = [234, 244, 255, 1];
    expect(composite([page], [255, 255, 255, 1])).toEqual([234, 244, 255]);
    // a 50% black scrim over the page
    expect(composite([[0, 0, 0, 0.5], page], [255, 255, 255, 1])).toEqual([117, 122, 128]);
    // nothing opaque at all: over the fallback
    expect(composite([[0, 0, 0, 0.5]], [255, 255, 255, 1])).toEqual([128, 128, 128]);
    // layers under the first opaque one don't count
    expect(composite([page, [0, 0, 0, 1]], [255, 255, 255, 1])).toEqual([234, 244, 255]);
  });

  it('turns the time and icons white only on dark backgrounds', () => {
    expect(isDark([234, 244, 255])).toBe(false);
    expect(isDark([14, 26, 51])).toBe(true);
    expect(isDark([31, 93, 246])).toBe(true);
  });
});
