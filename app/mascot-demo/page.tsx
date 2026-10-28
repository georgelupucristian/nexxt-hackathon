"use client";

import { useState } from "react";
import { Seal, type SealState } from "@/components/Seal";
import "./demo.css";

const STATES: SealState[] = ["idle", "happy", "celebrate", "wave", "think", "point", "sleep", "sad"];

const BACKGROUNDS = [
  { id: "white", label: "Alb", color: "#FFFFFF" },
  { id: "blue", label: "Albastru", color: "#EAF4FF" },
  { id: "mint", label: "Mentă", color: "#E6FBF4" },
] as const;

const SIZES = [48, 120, 300];

export default function MascotDemo() {
  const [state, setState] = useState<SealState>("idle");
  const [bg, setBg] = useState<(typeof BACKGROUNDS)[number]["id"]>("white");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("right");
  // Bumping the key remounts the seals, which replays one-shot states like celebrate.
  const [replay, setReplay] = useState(0);

  const pick = (s: SealState) => {
    setState(s);
    setReplay((n) => n + 1);
  };

  return (
    <main className="demo">
      <header className="demo-header">
        <h1>Foca Avansul</h1>
        <p>Mascota aplicației. Alege o stare, un fundal și verifică dimensiunile.</p>
      </header>

      <section className="demo-controls" aria-label="Controale">
        <div className="demo-group">
          <span className="demo-label">Stare</span>
          <div className="demo-buttons">
            {STATES.map((s) => (
              <button key={s} type="button" aria-pressed={state === s} onClick={() => pick(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="demo-group">
          <span className="demo-label">Fundal</span>
          <div className="demo-buttons">
            {BACKGROUNDS.map((b) => (
              <button key={b.id} type="button" aria-pressed={bg === b.id} onClick={() => setBg(b.id)}>
                <span className="demo-swatch" style={{ background: b.color }} />
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div className="demo-group">
          <span className="demo-label">Direcție (point)</span>
          <div className="demo-buttons">
            {(["left", "right"] as const).map((d) => (
              <button key={d} type="button" aria-pressed={direction === d} onClick={() => setDirection(d)}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <label className="demo-toggle">
          <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} />
          Reduced motion
        </label>
      </section>

      <section
        className="demo-stage"
        style={{ background: BACKGROUNDS.find((b) => b.id === bg)!.color }}
        aria-label="Previzualizare"
      >
        {SIZES.map((size) => (
          <figure key={size} className="demo-cell">
            <Seal
              key={`${size}-${replay}`}
              state={state}
              size={size}
              direction={direction}
              reducedMotion={reducedMotion}
            />
            <figcaption>{size}px</figcaption>
          </figure>
        ))}
      </section>
    </main>
  );
}
