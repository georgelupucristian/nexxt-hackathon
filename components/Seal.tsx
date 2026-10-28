"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { SealRenderer, type SealAppear } from "./sealRenderer";
import "./Seal.css";

export type SealState =
  | "idle"
  | "happy"
  | "celebrate"
  | "wave"
  | "think"
  | "point"
  | "sleep"
  | "sad";

export type { SealAppear };

export const SEAL_STATES: readonly SealState[] = [
  "idle",
  "happy",
  "celebrate",
  "wave",
  "think",
  "point",
  "sleep",
  "sad",
];

type SealProps = {
  state?: SealState;
  size?: number;
  className?: string;
  /** Which side the "point" state points to. */
  direction?: "left" | "right";
  /** How the seal shows up when mounted: pop out of the ground, belly-slide in from the left, or just be there. */
  appear?: SealAppear;
  /** Force the reduced-motion fallback (still poses, no movement) regardless of the OS setting. */
  reducedMotion?: boolean;
  /** Fires when the one-shot celebrate animation has finished and the seal is back to idle. */
  onCelebrateEnd?: () => void;
  /** Accessible label. Pass "" to mark the seal as decorative. */
  title?: string;
};

const CELEBRATE_MS = 1300;
// A full-body render at avatar size is mostly empty space and a tiny face, so
// small seals switch to the head crops made by scripts/process_mascot.py.
const FACE_MAX_SIZE = 72;

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia(reducedMotionQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );
}

export function Seal({
  state = "idle",
  size = 120,
  className,
  direction = "right",
  appear = "pop",
  reducedMotion = false,
  onCelebrateEnd,
  title = "Foca Avansul",
}: SealProps) {
  // celebrate is one-shot: play it once, then fall back to idle on our own so
  // callers can just set state="celebrate" when a deposit lands.
  const [celebrating, setCelebrating] = useState(state === "celebrate");
  const onEndRef = useRef(onCelebrateEnd);
  onEndRef.current = onCelebrateEnd;

  useEffect(() => {
    if (state !== "celebrate") return;
    setCelebrating(true);
    const timer = setTimeout(() => {
      setCelebrating(false);
      onEndRef.current?.();
    }, CELEBRATE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const shown: SealState = state === "celebrate" && !celebrating ? "idle" : state;
  const flip = shown === "point" && direction === "left";
  const face = size <= FACE_MAX_SIZE;
  const osReduced = usePrefersReducedMotion();
  const animated = !face && !reducedMotion && !osReduced;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shadowRef = useRef<HTMLSpanElement>(null);
  const rendererRef = useRef<SealRenderer | null>(null);
  const [glFailed, setGlFailed] = useState(false);
  // read inside the mount effect without making it re-run (and replay the entrance)
  const latest = useRef({ shown, flip, appear, size });
  latest.current = { shown, flip, appear, size };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!animated || !canvas) return;
    const renderer = SealRenderer.create(
      canvas,
      (lift, shiftX) => {
        const shadow = shadowRef.current;
        if (!shadow) return;
        // shrink and fade while airborne; stay hidden until the seal is out of the ground
        const scale = lift > 0 ? Math.max(0.5, 1 - lift * 2.5) : 1;
        const opacity = lift > 0 ? scale : Math.max(0, 1 + lift * 2);
        shadow.style.transform = `translateX(${shiftX * latest.current.size}px) scale(${scale})`;
        shadow.style.opacity = String(opacity);
      },
    );
    if (!renderer) {
      setGlFailed(true); // no WebGL2: show the <img> fallback instead
      return;
    }
    rendererRef.current = renderer;
    renderer.setState(latest.current.shown, latest.current.flip);
    renderer.start(latest.current.appear);
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [animated]);

  useEffect(() => {
    rendererRef.current?.setState(shown, flip);
  }, [shown, flip]);

  const classes = [
    "seal",
    `seal--${shown}`,
    face ? "seal--face" : "seal--body",
    flip && "seal--face-left",
    animated && !glFailed && "seal--gl",
    (reducedMotion || osReduced) && "seal--reduced",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const f = SealRenderer.frame;
  const canvasStyle: CSSProperties = {
    left: `${-f.padX * 100}%`,
    top: `${-f.padTop * 100}%`,
    width: `${f.width * 100}%`,
    height: `${f.height * 100}%`,
  };

  return (
    <div
      className={classes}
      style={{ width: size, height: size, "--seal-size": `${size}px` } as CSSProperties}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      {!face && <span ref={shadowRef} className="seal-shadow" />}
      {animated && <canvas ref={canvasRef} className="seal-canvas" style={canvasStyle} />}
      {/* Plain images: used for avatars, reduced motion and browsers without WebGL2. */}
      <div className="seal-figure">
        <div className="seal-flip">
          {SEAL_STATES.map((s) => (
            <img
              key={s}
              className="seal-pose"
              src={`/mascot/${s}${face ? "-face" : ""}.webp`}
              alt=""
              draggable={false}
              data-active={s === shown || undefined}
            />
          ))}
        </div>
      </div>
      {!face && shown === "think" && (
        <span className="seal-bubble" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      )}
      {!face && shown === "sleep" && (
        <span className="seal-zzz" aria-hidden>
          <i>z</i>
          <i>z</i>
          <i>z</i>
        </span>
      )}
    </div>
  );
}

export default Seal;
