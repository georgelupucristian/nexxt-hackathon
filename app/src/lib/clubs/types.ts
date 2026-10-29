// Clubs: the config's shapes (clubs and promotions, made by our team) and the server's state
// (supabase/migrations/0018_clubs.sql, clubs_state()).
import type { Icon as PhIcon } from '@phosphor-icons/react';
import type { GoalColour } from '../../data/types';

export type ClubSlug = 'travel' | 'erasmus' | 'tech' | 'first-apartment' | 'my-car' | 'emergency-fund';
/** "2026-10": promotions run for one calendar month */
export type MonthKey = string;

/** A partner offer as written in config.ts, before a month gives it dates and an id. */
export interface PromoTemplate {
  /** stable and unique across clubs; the server's code limits are keyed by it */
  id: string;
  company: string;
  /** a generic logo: a Phosphor icon in a tinted tile (all companies are fictional) */
  logo: PhIcon;
  title: string;
  description: string;
  discount: string;
  conditions: string;
  /** a real cap on codes handed out, enforced by clubs_claim */
  codeLimit?: number;
}

export interface Club {
  slug: ClubSlug;
  name: string;
  /** a key of GOAL_ICONS, so a club looks like the goals saved for it */
  icon: string;
  colour: GoalColour;
  blurb: string;
  /** goal icon keys that suggest this club ("Saving for Erasmus? Start with the Erasmus Club.") */
  goalIcons: string[];
  /** the pool this club's monthly promotions rotate through */
  pool: PromoTemplate[];
  /** how many of the pool run each month (3 to 5) */
  perMonth: number;
}

export interface Promo extends PromoTemplate {
  /** "<club>/<template>/<YYYY-MM>", what clubs_claim takes */
  promoId: string;
  club: ClubSlug;
  month: MonthKey;
  validFrom: string;
  validTo: string;
  /** first appears this month */
  isNew: boolean;
}

export type MembershipStatus = 'active' | 'paused' | 'lost';

export interface Membership {
  slug: ClubSlug;
  status: MembershipStatus;
  joinedAt: string;
  pausedAt: string | null;
  comebackUntil: string | null;
}

export interface Claim {
  promoId: string;
  code: string;
  claimedAt: string;
}

export interface ClubsState {
  today: string;
  streak: number;
  slots: number;
  active: number;
  nextSlot: { at: number; days: number } | null;
  /** streak days until one more club fits: 0 = now, null = every slot is open and used */
  freeSlotIn: number | null;
  inDanger: boolean;
  comeback: { progress: number; needed: number; until: string; daysLeft: number } | null;
  comebackWonOn: string | null;
  memberships: Membership[];
  claims: Claim[];
  counts: Partial<Record<ClubSlug, number>>;
  friends: Partial<Record<ClubSlug, { count: number; names: string[] }>>;
}
