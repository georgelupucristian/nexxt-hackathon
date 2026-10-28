"use client";

import { useId } from "react";
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

// Same values as the --seal-* custom properties in Seal.css. Kept here too so
// non-CSS consumers (canvas, native, PNG export) can read the palette.
export const SEAL_PALETTE = {
  body: "#9AA6B4",
  bodyShade: "#7C8896",
  bodyLight: "#AEB8C5",
  spot: "#5E6A79",
  belly: "#F4EFE6",
  bellyShade: "#E3DACB",
  eye: "#2B1E1A",
  eyeShine: "#FFFFFF",
  nose: "#2A2A2E",
  blush: "#F2B8B5",
  ground: "rgba(30, 40, 60, 0.15)",
} as const;

type SealProps = {
  state?: SealState;
  size?: number;
  className?: string;
  /** Which side the "point" state points to. */
  direction?: "left" | "right";
  /** Force the reduced-motion fallback (static pose + blink) regardless of the OS setting. */
  reducedMotion?: boolean;
  /** Accessible label. Pass "" to mark the seal as decorative. */
  title?: string;
};

const BODY_PATH =
  "M100 76 C140 76 164 118 164 150 C164 170 142 180 100 180 C58 180 36 170 36 150 C36 118 60 76 100 76 Z";

export function Seal({
  state = "idle",
  size = 120,
  className,
  direction = "right",
  reducedMotion = false,
  title = "Foca Avansul",
}: SealProps) {
  // Several seals can sit on one page, so clipPath ids must be unique per instance.
  // useId output contains characters that break url(#...) references, hence the replace.
  const uid = "seal" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipBody = `${uid}-body`;
  const clipBelly = `${uid}-belly`;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={[
        "seal",
        `seal--${state}`,
        direction === "left" && "seal--face-left",
        reducedMotion && "seal--reduced",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={clipBody}>
          <path d={BODY_PATH} />
        </clipPath>
        <clipPath id={clipBelly}>
          <ellipse cx="100" cy="148" rx="35" ry="30" />
        </clipPath>
      </defs>

      <g className="seal-shadow">
        <ellipse className="seal-c-ground" cx="100" cy="181" rx="60" ry="7" />
      </g>

      <g className="seal-figure">
        <g className="seal-tail">
          <path
            className="seal-c-shade"
            d="M132 176 C146 176 156 172 166 164 C170 160 178 158 180 163 C181 166 177 169 174 170 C179 171 183 175 181 179 C179 183 171 182 166 180 C156 178 146 180 134 182 Z"
          />
        </g>

        <g className="seal-torso">
          <g className="seal-body">
            <path className="seal-c-body" d={BODY_PATH} />
            <g clipPath={`url(#${clipBody})`}>
              {/* cel shading: bottom band + the shadow the head casts on the body */}
              <ellipse className="seal-c-shade" cx="100" cy="196" rx="78" ry="30" />
              <ellipse className="seal-c-shade" cx="100" cy="74" rx="52" ry="42" />
            </g>
            <g className="seal-c-spot">
              <ellipse cx="52" cy="164" rx="3.6" ry="2.7" transform="rotate(-20 52 164)" />
              <ellipse cx="149" cy="160" rx="3" ry="2.3" transform="rotate(25 149 160)" />
            </g>
          </g>
          <g className="seal-belly" clipPath={`url(#${clipBody})`}>
            <ellipse className="seal-c-belly" cx="100" cy="148" rx="35" ry="30" />
            <ellipse className="seal-c-belly-shade" cx="100" cy="182" rx="44" ry="15" clipPath={`url(#${clipBelly})`} />
          </g>
        </g>

        <g className="seal-head">
          {/* darker ellipse peeking out under the main one = the chin shadow */}
          <ellipse className="seal-c-shade" cx="100" cy="68" rx="52" ry="42" />
          <ellipse className="seal-c-body" cx="100" cy="64.5" rx="51" ry="38.5" />
          <ellipse className="seal-c-light" cx="84" cy="38" rx="20" ry="7" transform="rotate(-14 84 38)" />

          <g className="seal-spots seal-c-spot">
            <ellipse cx="62" cy="46" rx="4.5" ry="3.4" transform="rotate(-25 62 46)" />
            <ellipse cx="128" cy="34" rx="3.5" ry="2.8" transform="rotate(20 128 34)" />
            <ellipse cx="141" cy="48" rx="4.2" ry="3.2" transform="rotate(35 141 48)" />
            <ellipse cx="114" cy="29" rx="2.4" ry="2" />
            <ellipse cx="55" cy="62" rx="2.6" ry="2.1" />
          </g>

          <g className="seal-eye-left">
            <ellipse className="seal-c-spot" cx="78" cy="64" rx="12.5" ry="14" />
            <g className="seal-pupil-left">
              <ellipse className="seal-c-eye" cx="78" cy="64" rx="11" ry="12.5" />
              <circle className="seal-c-shine" cx="81.5" cy="59" r="4.2" />
              <circle className="seal-c-shine" cx="74" cy="69" r="2" />
            </g>
            <ellipse className="seal-eyelid-left seal-c-body" cx="78" cy="64" rx="13.5" ry="15" />
          </g>
          <g className="seal-eye-right">
            <ellipse className="seal-c-spot" cx="122" cy="64" rx="12.5" ry="14" />
            <g className="seal-pupil-right">
              <ellipse className="seal-c-eye" cx="122" cy="64" rx="11" ry="12.5" />
              <circle className="seal-c-shine" cx="125.5" cy="59" r="4.2" />
              <circle className="seal-c-shine" cx="118" cy="69" r="2" />
            </g>
            <ellipse className="seal-eyelid-right seal-c-body" cx="122" cy="64" rx="13.5" ry="15" />
          </g>

          <g className="seal-blush seal-c-blush">
            <ellipse cx="62" cy="80" rx="7" ry="4" />
            <ellipse cx="138" cy="80" rx="7" ry="4" />
          </g>

          <g className="seal-muzzle">
            <g className="seal-c-belly-shade">
              <circle cx="90" cy="88" r="13" />
              <circle cx="110" cy="88" r="13" />
              <ellipse cx="100" cy="93" rx="16" ry="10" />
            </g>
            <g className="seal-c-belly">
              <circle cx="90" cy="87" r="12" />
              <circle cx="110" cy="87" r="12" />
              <ellipse cx="100" cy="91.5" rx="15" ry="8.5" />
            </g>
          </g>

          <g className="seal-whiskers-left seal-whisker">
            <path d="M75 89 Q63 86 51 85 M75 93 Q62 93 49 94.5 M76 97 Q65 100 54 105" />
          </g>
          <g className="seal-whiskers-right seal-whisker">
            <path d="M125 89 Q137 86 149 85 M125 93 Q138 93 151 94.5 M124 97 Q135 100 146 105" />
          </g>

          <g className="seal-nose">
            <path
              className="seal-c-nose"
              d="M100 88 C96 86.5 92.5 83.5 93 80.5 C93.5 77.5 106.5 77.5 107 80.5 C107.5 83.5 104 86.5 100 88 Z"
            />
          </g>
          <g className="seal-mouth seal-line">
            <path d="M100 88 V91.5 M93.5 92 Q96.75 96 100 91.5 Q103.25 96 106.5 92" />
          </g>
        </g>

        {/* drawn after the head so a raised flipper can overlap the face */}
        <g className="seal-arms">
          <g className="seal-flipper-left">
            <path className="seal-c-shade" d="M60 118 C46 120 30 134 27 149 C26 155 31 158 36 155 C48 147 60 137 65 126 Z" />
            <path className="seal-c-body" d="M60 118 C46 120 30 134 27 149 C34 139 47 128 63 122 Z" />
          </g>
          <g className="seal-flipper-right">
            <path className="seal-c-shade" d="M140 118 C154 120 170 134 173 149 C174 155 169 158 164 155 C152 147 140 137 135 126 Z" />
            <path className="seal-c-body" d="M140 118 C154 120 170 134 173 149 C166 139 153 128 137 122 Z" />
          </g>
        </g>
      </g>
    </svg>
  );
}

export default Seal;
