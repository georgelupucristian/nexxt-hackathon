// Every goal gets its own colour and picture slot, like Monzo pots, so "Laptop" and "Fond de
// urgență" are recognisable before you read them. Goals made from a preset in the new-goal wizard
// keep that preset's colour; older goals take their kind's, and custom ones get one picked from their
// id, so it never changes between visits.
//
// Six bright, friendly colours, one per goal. Each has a bold fill (the home band, the picture tile,
// the activity dot), a soft tint (tracks, light washes) and a deep shade (bars on white). Sea blue
// stays the action colour and orange stays the streak's, so neither is in here. Contrast, checked:
//   navy text on every fill ≥ 9.3:1 and ink-2 ≥ 5.1:1, navy on every tint ≥ 14:1,
//   deep on white ≥ 5.4:1 and on its tint ≥ 4.8:1, deep on its fill ≥ 3.1:1 (bars, not text).
import { useEffect, useState } from 'react';
import type { Goal, GoalColour, GoalKind } from '../data/types';

export const GOAL_PALETTE: Record<GoalColour, { fill: string; tint: string; deep: string }> = {
  cer: { fill: '#8fd0f7', tint: '#e2f3fd', deep: '#0b6a9e' },
  menta: { fill: '#8ee3c0', tint: '#dff7ec', deep: '#11784f' },
  coral: { fill: '#ffac96', tint: '#ffebe5', deep: '#b2412b' },
  soare: { fill: '#ffd65c', tint: '#fff4d1', deep: '#856000' },
  liliac: { fill: '#c5b5f8', tint: '#eee9fe', deep: '#5a42c2' },
  trandafir: { fill: '#f8adcb', tint: '#fde7f0', deep: '#ad2d64' },
};
export type { GoalColour };

// an emergency fund is mint, tech is lilac, travel is sky; custom goals pick by id
const BY_KIND: Record<GoalKind, GoalColour | null> = { emergency: 'menta', tech: 'liliac', travel: 'cer', custom: null };
const FALLBACK: GoalColour[] = ['coral', 'soare', 'trandafir', 'cer', 'menta', 'liliac'];

/** Small, stable string hash (FNV-1a), so the same id always lands on the same colour. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface GoalLook {
  colour: GoalColour;
  /** bold, friendly colour: the home band, the picture tile, the activity dot */
  fill: string;
  /** soft wash: bar tracks and light backgrounds */
  tint: string;
  /** deeper shade: progress bars on white or on the fill */
  deep: string;
  /** where the goal's picture would live; it may not exist yet (see useGoalPicture) */
  picture: string;
  /** first letter of the name, for the tile when there's no picture */
  monogram: string;
}

export function goalLook(goal: Pick<Goal, 'id' | 'kind' | 'name'> & { colour?: GoalColour }): GoalLook {
  // a colour saved on the goal wins (new goals get their preset's), then the kind's, then one by id
  const saved = goal.colour && goal.colour in GOAL_PALETTE ? goal.colour : null;
  const colour = saved ?? BY_KIND[goal.kind] ?? FALLBACK[hash(goal.id) % FALLBACK.length];
  const letter = goal.name.trim().match(/\p{L}|\p{N}/u)?.[0] ?? '•';
  return { colour, ...GOAL_PALETTE[colour], picture: `/mascot/obj-${goal.kind}.webp`, monogram: letter.toLocaleUpperCase('en-GB') };
}

/** CSS custom properties for an element that should take on the goal's colour. */
export function goalVars(look: GoalLook): Record<string, string> {
  return { '--goal-fill': look.fill, '--goal-tint': look.tint, '--goal-deep': look.deep };
}

// ---------- picture slot ----------
// The pictures (public/mascot/obj-<kind>.webp) are generated separately and may not exist yet. Each
// one is probed once per session; until it has loaded, and if it never does, the monogram shows.
// A probe instead of a plain <img onError> means no broken-image flash and no layout jump.

const known = new Map<string, boolean>();
const pending = new Map<string, Promise<boolean>>();

function probe(src: string): Promise<boolean> {
  const done = known.get(src);
  if (done !== undefined) return Promise.resolve(done);
  let p = pending.get(src);
  if (!p) {
    p = new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 0);
      img.onerror = () => resolve(false);
      img.src = src;
    }).then((ok) => {
      known.set(src, ok);
      pending.delete(src);
      return ok;
    });
    pending.set(src, p);
  }
  return p;
}

/** The goal's picture URL once it's known to exist, otherwise null (show the monogram). */
export function useGoalPicture(src: string): string | null {
  const [ok, setOk] = useState(() => known.get(src) === true);
  useEffect(() => {
    let live = true;
    void probe(src).then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, [src]);
  return ok ? src : null;
}
