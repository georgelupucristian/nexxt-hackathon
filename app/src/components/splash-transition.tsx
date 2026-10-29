// A water splash that covers the screen, swaps the page underneath while it's fully covered, then
// washes away. The clip is a transparent WebM (VP9 with alpha) cut from the green-screen splash:
// at 12 fps it covers 100% of the frame from about 0.6 s to 0.8 s and is gone again by 1.67 s.
//
// Safari (and every iOS browser, all WebKit) can't show the alpha channel of a WebM and still says
// it can. There the same clip plays as an animated WebP with alpha (splash.webp, 540 px wide, the
// same 42 frames, ~430 KB), fetched once and shown from a fresh blob URL each time so it always
// starts from its first frame. Until it has loaded, a quick light wipe in the page and accent
// colours stands in.
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

const SRC = '/video/splash.webm';
const WEBP = '/video/splash.webp';
const COVERED_AT = 0.66; // seconds into the clip when the water fills the whole frame
const LENGTH = 1.752; // seconds, the whole clip
const WATER = 'linear-gradient(180deg, var(--bg) 0%, var(--struct) 100%)';

type Go = (to: string) => void;
const Ctx = createContext<Go | null>(null);

/** Plays the splash, navigating to `to` while the screen is covered. */
export const useSplashNavigate = (): Go => {
  const go = useContext(Ctx);
  const nav = useNavigate();
  return go ?? nav;
};

/** WebKit: Safari, and Chrome or Firefox on iOS (CriOS, FxiOS), which are WebKit underneath. */
export function isWebKit(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return navigator.vendor === 'Apple Computer, Inc.' || (/AppleWebKit\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua));
}

function canPlayAlphaWebm(): boolean {
  if (typeof document === 'undefined') return false;
  // WebKit reports VP9 support but drops the alpha plane, so rule it out by engine
  return !isWebKit() && document.createElement('video').canPlayType('video/webm; codecs="vp09.00.10.08"') !== '';
}

export function SplashTransitionProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const [run, setRun] = useState<{ id: number; to: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigated = useRef(false);
  const [useVideo] = useState(canPlayAlphaWebm);
  // the WebP path: the file once, a new blob URL per splash (a new URL restarts the animation)
  const webp = useRef<Blob | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  useEffect(() => {
    if (useVideo) return;
    let alive = true;
    fetch(WEBP)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (alive && b) webp.current = b;
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [useVideo]);

  const go = useCallback<Go>(
    (to) => {
      if (reduce) return nav(to);
      navigated.current = false;
      setRun({ id: Date.now(), to });
    },
    [nav, reduce],
  );

  // refs, not deps: navigating hands out a new `nav`, which must not restart the splash
  const latest = useRef({ nav, run });
  latest.current = { nav, run };
  const swap = useCallback(() => {
    const { nav: navigate, run: current } = latest.current;
    if (!current || navigated.current) return;
    navigated.current = true;
    navigate(current.to);
  }, []);

  // the video path: start from the top each time, swap pages once the water covers everything
  useEffect(() => {
    const v = videoRef.current;
    if (!run || !useVideo || !v) return;
    v.currentTime = 0;
    v.play().catch(() => {
      // autoplay refused or the file failed: don't strand the user on a blank overlay
      swap();
      setRun(null);
    });
    let raf = 0;
    const tick = () => {
      if (v.currentTime >= COVERED_AT) swap();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run?.id, useVideo, swap]);

  useEffect(() => {
    if (!run || useVideo || !webp.current) return;
    const url = URL.createObjectURL(webp.current);
    setFrame(url);
    const t1 = window.setTimeout(swap, COVERED_AT * 1000);
    const t2 = window.setTimeout(() => setRun(null), LENGTH * 1000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      setFrame(null);
      URL.revokeObjectURL(url);
    };
  }, [run?.id, useVideo, swap]);

  return (
    <Ctx.Provider value={go}>
      {children}
      {useVideo ? (
        // always mounted and preloaded so the first tap starts instantly
        <video
          ref={videoRef}
          src={SRC}
          muted
          playsInline
          preload="auto"
          aria-hidden
          onEnded={() => {
            swap();
            setRun(null);
          }}
          className="pointer-events-none fixed inset-0 z-[100] size-full object-cover"
          style={{ visibility: run ? 'visible' : 'hidden' }}
        />
      ) : frame ? (
        <img src={frame} alt="" aria-hidden className="pointer-events-none fixed inset-0 z-[100] size-full object-cover" />
      ) : (
        <AnimatePresence>
          {run && !webp.current && (
            <motion.div
              key={run.id}
              aria-hidden
              className="pointer-events-none fixed inset-0 z-[100]"
              style={{ background: WATER }}
              initial={{ clipPath: 'circle(0% at 50% 85%)' }}
              animate={{ clipPath: 'circle(150% at 50% 85%)' }}
              exit={{ clipPath: 'circle(0% at 50% 15%)', transition: { duration: 0.55, ease: [0.4, 0, 0.2, 1] } }}
              transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
              onAnimationComplete={() => {
                swap();
                setRun(null);
              }}
            />
          )}
        </AnimatePresence>
      )}
    </Ctx.Provider>
  );
}
