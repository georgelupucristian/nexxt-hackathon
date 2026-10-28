"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  /** Force the reduced-motion fallback (still poses, no movement) regardless of the OS setting. */
  reducedMotion?: boolean;
  /** Fires when the one-shot celebrate animation has finished and the seal is back to idle. */
  onCelebrateEnd?: () => void;
  /** Accessible label. Pass "" to mark the seal as decorative. */
  title?: string;
};

const CELEBRATE_MS = 1200;
// A full-body render at avatar size is mostly empty space and a tiny face, so
// small seals switch to the head crops made by scripts/process_mascot.py.
const FACE_MAX_SIZE = 72;

export function Seal({
  state = "idle",
  size = 120,
  className,
  direction = "right",
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
  const face = size <= FACE_MAX_SIZE;

  const classes = [
    "seal",
    `seal--${shown}`,
    face ? "seal--face" : "seal--body",
    shown === "point" && direction === "left" && "seal--face-left",
    reducedMotion && "seal--reduced",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={{ width: size, height: size, "--seal-size": `${size}px` } as CSSProperties}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      {!face && <span className="seal-shadow" />}
      <div className="seal-figure">
        <div className="seal-flip">
          {/* Every pose stays mounted so switching states is an instant crossfade,
              not a network request. */}
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
