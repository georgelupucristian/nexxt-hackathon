// On a laptop or desktop, Kip opens inside a phone.
//
// The app runs in a same-origin iframe exactly a phone's size, not in a scaled div: everything
// that's `position: fixed` (Kip's dial, sheets, toasts, the tour), every `100dvh`, every media query
// and `innerHeight` measures the phone, so it behaves the way it does on a real one. This page only
// draws the device and the backdrop, and keeps its address in step with the app's, so a reload, a
// shared link or the return from Stripe lands on the same screen.
//
// Phones and tablets never see any of it. `?frame=0` turns it off for the tab, `?frame=1` forces it.
import { StrictMode, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { isEmbedded } from './embed';
import {
  composite,
  DESKTOP_QUERY,
  fitDevice,
  flagIn,
  FRAME_KEY,
  isDark,
  luma,
  parseColor,
  parseOverride,
  shouldFrame,
  storedOverride,
  withoutFlag,
  type Override,
  type Rgba,
} from './logic';
import './frame.css';

const SCREEN_W = 390;
const SCREEN_H = 844;
const STATUS_H = 54; // opaque, like an installed PWA with the default status bar: the app gets the rest
const EDGE = 14; // black glass plus the metal band, each side
const DEVICE = { w: SCREEN_W + 2 * EDGE, h: SCREEN_H + 2 * EDGE };
const MARGIN = 32;
const PAGE_BG: [number, number, number] = [234, 244, 255]; // --bg, until the app has painted

const here = () => window.location.pathname + window.location.search + window.location.hash;

/** Reads `?frame` once, remembers it for the tab, and takes it back out of the address. */
function readOverride(): Override {
  const fromUrl = parseOverride(flagIn(window.location.search));
  if (fromUrl) {
    try {
      sessionStorage.setItem(FRAME_KEY, fromUrl);
    } catch {
      // private mode without storage: the flag still works for this load
    }
    window.history.replaceState(window.history.state, '', withoutFlag(here()));
    return fromUrl;
  }
  try {
    return storedOverride(sessionStorage.getItem(FRAME_KEY));
  } catch {
    return null;
  }
}

/** The phone on a laptop-sized window with a mouse; the app itself everywhere else, and inside the phone. */
function FrameGate({ children }: { children: ReactNode }) {
  // before the router below reads the address, so the app never sees `?frame`
  const [override] = useState(() => (isEmbedded ? null : readOverride()));
  const [desktop, setDesktop] = useState(() => !isEmbedded && window.matchMedia(DESKTOP_QUERY).matches);

  useEffect(() => {
    if (isEmbedded || override) return;
    // narrow the window (or flip devtools to a phone) and the frame steps aside, and back
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [override]);

  useLayoutEffect(() => {
    // inside the phone: no desktop scrollbars stealing 15px of the 390, phones draw theirs over the content
    if (isEmbedded) document.documentElement.classList.add('kip-embedded');
  }, []);

  return shouldFrame({ embedded: isEmbedded, override, desktop }) ? <PhoneFrame /> : <>{children}</>;
}

/**
 * `createRoot`, except that on a laptop it renders the phone and leaves the app to the iframe.
 * main.tsx renders the app tree into it exactly as before.
 */
export function createFramedRoot(el: HTMLElement): Pick<Root, 'render'> {
  const root = createRoot(el);
  return {
    render: (app) =>
      root.render(
        <StrictMode>
          <FrameGate>{app}</FrameGate>
        </StrictMode>,
      ),
  };
}

const measure = () => fitDevice({ w: window.innerWidth, h: window.innerHeight }, DEVICE, MARGIN);

const clock = () => new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' }).format(new Date());

function useClock() {
  const [time, setTime] = useState(clock);
  useEffect(() => {
    const t = window.setInterval(() => setTime(clock()), 5_000);
    return () => window.clearInterval(t);
  }, []);
  return time;
}

const opacityOf = (el: Element, win: Window) => {
  let o = 1;
  for (let n: Element | null = el; n && o > 0; n = n.parentElement) o *= Number(win.getComputedStyle(n).opacity);
  return o;
};

let sampler: CanvasRenderingContext2D | null = null;

/**
 * A full-bleed video or image (object-fit: cover) under the top of the app: the colour of the row
 * of it that's on screen at y = 0. Anything smaller doesn't get to colour the status bar.
 */
function mediaTop(el: Element, win: Window): Rgba | null {
  // tag names, not instanceof: the app's elements come from the iframe's own window
  const video = el.tagName === 'VIDEO' ? (el as HTMLVideoElement) : null;
  const img = el.tagName === 'IMG' ? (el as HTMLImageElement) : null;
  const media = video ?? img;
  const sw = video ? video.videoWidth : (img?.naturalWidth ?? 0);
  const sh = video ? video.videoHeight : (img?.naturalHeight ?? 0);
  if (!media || !sw || !sh || (video && video.readyState < 2)) return null;
  const box = el.getBoundingClientRect();
  const style = win.getComputedStyle(el);
  if (style.objectFit !== 'cover' || box.width < win.innerWidth * 0.9 || box.height < 1) return null;
  // undo the cover scaling and object-position to find the source row
  const [posX, posY] = style.objectPosition.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
  const k = Math.max(box.width / sw, box.height / sh);
  const sx = ((sw * k - box.width) * posX) / k;
  const sy = ((sh * k - box.height) * posY - box.top) / k;
  sampler ??= Object.assign(document.createElement('canvas'), { width: 16, height: 1 }).getContext('2d', { willReadFrequently: true });
  if (!sampler) return null;
  sampler.clearRect(0, 0, 16, 1);
  sampler.drawImage(media, Math.max(0, sx), Math.max(0, sy), Math.min(sw, box.width / k), Math.max(1, 2 / k), 0, 0, 16, 1);
  // the median by brightness, not the mean: clouds drifting past the corners shouldn't pale the
  // whole bar, which then matches the sky in the middle
  const data = sampler.getImageData(0, 0, 16, 1).data;
  const px: Rgba[] = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 250) px.push([data[i], data[i + 1], data[i + 2], 1]);
  if (px.length < 8) return null;
  px.sort((p, q) => luma(p) - luma(q));
  return px[px.length >> 1];
}

/**
 * The colour along the top edge of the app, so the status bar reads as part of the screen: the
 * light blue page, the sky in the welcome video, a sheet's dimmed backdrop.
 */
function topEdge(frame: HTMLIFrameElement): [number, number, number] | null {
  try {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc?.body || !win) return null;
    const layers: Rgba[] = [];
    for (const el of doc.elementsFromPoint(doc.documentElement.clientWidth / 2, 1)) {
      const c = el.tagName === 'VIDEO' || el.tagName === 'IMG' ? mediaTop(el, win) : parseColor(win.getComputedStyle(el).backgroundColor);
      if (!c || c[3] === 0) continue;
      c[3] *= opacityOf(el, win);
      layers.push(c);
      if (c[3] >= 0.99) break;
    }
    return composite(layers, [255, 255, 255, 1]);
  } catch {
    return null;
  }
}

type NavigationTarget = EventTarget; // the Navigation API isn't in this TypeScript's DOM types yet

function PhoneFrame() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src] = useState(() => withoutFlag(here()));
  const [fit, setFit] = useState(measure);
  const [bar, setBar] = useState(PAGE_BG);
  const [loaded, setLoaded] = useState(false);
  const time = useClock();
  const detach = useRef<() => void>(() => undefined);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('kipframe-page');
    return () => root.classList.remove('kipframe-page');
  }, []);

  useEffect(() => {
    const onResize = () => setFit(measure());
    // the keyboard belongs to the phone: back to this tab, or a click beside the phone, sends it there
    const onFocus = () => frame.current?.contentWindow?.focus();
    const sample = window.setInterval(() => {
      const c = frame.current && topEdge(frame.current);
      if (c) setBar((prev) => (prev.every((v, i) => v === c[i]) ? prev : c));
    }, 200);
    window.addEventListener('resize', onResize);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(sample);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('focus', onFocus);
      detach.current();
    };
  }, []);

  /** Every page the iframe loads: mirror its address into ours from now on, and take the keyboard. */
  function onLoad() {
    const win = frame.current?.contentWindow;
    if (!win) return;
    const sync = () => {
      try {
        const path = win.location.pathname + win.location.search + win.location.hash;
        if (win.location.origin === window.location.origin && path !== here()) window.history.replaceState(null, '', path);
      } catch {
        // navigated somewhere foreign: leave our address alone
      }
    };
    detach.current();
    sync();
    setLoaded(true);
    const nav = (win as Window & { navigation?: NavigationTarget }).navigation;
    if (nav) {
      // fires for every pushState, replaceState, back and forward the app's router makes
      nav.addEventListener('currententrychange', sync);
      detach.current = () => nav.removeEventListener('currententrychange', sync);
    } else {
      const t = window.setInterval(sync, 250);
      detach.current = () => window.clearInterval(t);
    }
    win.focus();
  }

  const dark = isDark(bar);
  return (
    // a click beside the phone mustn't pull the keyboard out of it
    <div className="kipframe" onMouseDown={(e) => e.preventDefault()}>
      <span className="kipframe__mark" aria-hidden>
        Kip
      </span>
      <div className="kipframe__stage" style={{ left: fit.x, top: fit.y, width: fit.w, height: fit.h }}>
        <div className="kipframe__device" style={{ width: DEVICE.w, height: DEVICE.h, transform: fit.scale < 1 ? `scale(${fit.scale})` : undefined }}>
          <i className="kipframe__key kipframe__key--action" aria-hidden />
          <i className="kipframe__key kipframe__key--up" aria-hidden />
          <i className="kipframe__key kipframe__key--down" aria-hidden />
          <i className="kipframe__key kipframe__key--power" aria-hidden />
          <div className="kipframe__glass">
            {/* Scaled down, the app's edges land between pixels and show a sliver of whatever is
                under them: the status bar's colour at the top seam, black glass at the sides and bottom. */}
            <div className="kipframe__screen" style={{ width: SCREEN_W, height: SCREEN_H, '--kipframe-bar': `rgb(${bar.join(' ')})` } as CSSProperties}>
              {loaded && <span className="kipframe__underlay" style={{ top: STATUS_H + 1 }} />}
              <div className={`kipframe__status${dark ? ' kipframe__status--dark' : ''}`} style={{ height: STATUS_H }} aria-hidden>
                <span className="kipframe__time">{time}</span>
                <span className="kipframe__icons">
                  <svg width="18" height="12" viewBox="0 0 18 12">
                    <rect x="0" y="7.5" width="3" height="4.5" rx="1" />
                    <rect x="5" y="5" width="3" height="7" rx="1" />
                    <rect x="10" y="2.5" width="3" height="9.5" rx="1" />
                    <rect x="15" y="0" width="3" height="12" rx="1" />
                  </svg>
                  <svg width="16" height="12" viewBox="0 0 16 12">
                    <path d="M8 2.3c2.3 0 4.5.9 6.1 2.4l1.2-1.2A10.3 10.3 0 0 0 8 .6C5.2.6 2.6 1.7.7 3.5l1.2 1.2A8.7 8.7 0 0 1 8 2.3Z" />
                    <path d="M8 5.7c1.4 0 2.7.5 3.7 1.4l1.2-1.2A7 7 0 0 0 8 4a7 7 0 0 0-4.9 1.9l1.2 1.2c1-.9 2.3-1.4 3.7-1.4Z" />
                    <path d="M8 9.1c.6 0 1.1.2 1.5.6L8 11.4 6.5 9.7c.4-.4.9-.6 1.5-.6Z" />
                  </svg>
                  <svg width="27" height="13" viewBox="0 0 27 13">
                    <rect x="0.5" y="0.5" width="22" height="12" rx="3.8" fill="none" stroke="currentColor" strokeOpacity="0.38" />
                    <rect x="2" y="2" width="19" height="9" rx="2.5" />
                    <path d="M24.2 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1s-.6-1.8-1.4-2.1Z" fillOpacity="0.4" />
                  </svg>
                </span>
              </div>
              <span className="kipframe__island" aria-hidden />
              <iframe
                ref={frame}
                className="kipframe__app"
                src={src}
                title="Kip"
                style={{ width: SCREEN_W, height: SCREEN_H - STATUS_H }}
                // Face ID passkeys, the welcome video, sharing and copying work inside the phone too
                allow="publickey-credentials-create *; publickey-credentials-get *; autoplay; clipboard-write; web-share; fullscreen"
                onLoad={onLoad}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
