import { CalendarHeart, ListOrdered, Target, User, type LucideIcon } from 'lucide-react';
import type { EmojiName } from '../Emoji3D';

export type SectionId = 'today' | 'goals' | 'activity' | 'profile';

export interface Section {
  id: SectionId;
  label: string;
  path: string;
  icon: LucideIcon;
  emoji: EmojiName;
  /** centre of the arc, degrees clockwise from 12 o'clock */
  angle: number;
}

// Four arcs around the savings orb. Today sits on top because it's what you open most.
export const SECTIONS: Section[] = [
  { id: 'today', label: 'Today', path: '/today', icon: CalendarHeart, emoji: 'calendar', angle: 0 },
  { id: 'goals', label: 'Goals', path: '/goals', icon: Target, emoji: 'target', angle: 90 },
  { id: 'activity', label: 'Activity', path: '/activity', icon: ListOrdered, emoji: 'chart', angle: 180 },
  { id: 'profile', label: 'Profile', path: '/profile', icon: User, emoji: 'profile', angle: 270 },
];

export function sectionFor(pathname: string): Section | null {
  return SECTIONS.find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`)) ?? null;
}

// Hub geometry in SVG units (viewBox 0 0 400 400).
export const HUB = { c: 200, orbR: 124, ringIn: 138, ringOut: 194, gapDeg: 7 };

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
export const polar = (r: number, deg: number) => ({ x: HUB.c + r * Math.cos(rad(deg)), y: HUB.c + r * Math.sin(rad(deg)) });

/** Donut slice from `a0` to `a1` degrees with rounded-looking ends via a small gap. */
export function arcPath(a0: number, a1: number, rIn = HUB.ringIn, rOut = HUB.ringOut): string {
  const p0 = polar(rOut, a0);
  const p1 = polar(rOut, a1);
  const p2 = polar(rIn, a1);
  const p3 = polar(rIn, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return [`M ${p0.x} ${p0.y}`, `A ${rOut} ${rOut} 0 ${large} 1 ${p1.x} ${p1.y}`, `L ${p2.x} ${p2.y}`, `A ${rIn} ${rIn} 0 ${large} 0 ${p3.x} ${p3.y}`, 'Z'].join(' ');
}
