// The clubs on the live backend: clubs_state, clubs_join, clubs_leave, clubs_claim (0018_clubs.sql).
// One shared copy of the state, so home, /clubs and a club's page agree without refetching each time.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../supabase';
import type { ClubSlug, ClubsState } from './types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fromRow(r: Row): ClubsState {
  return {
    today: r.today,
    streak: r.streak ?? 0,
    slots: r.slots ?? 1,
    active: r.active ?? 0,
    nextSlot: r.next_slot ?? null,
    freeSlotIn: r.free_slot_in ?? null,
    inDanger: !!r.in_danger,
    comeback: r.comeback ? { progress: r.comeback.progress, needed: r.comeback.needed, until: r.comeback.until, daysLeft: r.comeback.days_left } : null,
    comebackWonOn: r.comeback_won_on ?? null,
    memberships: (r.memberships ?? []).map((m: Row) => ({ slug: m.slug, status: m.status, joinedAt: m.joined_at, pausedAt: m.paused_at, comebackUntil: m.comeback_until })),
    claims: (r.claims ?? []).map((c: Row) => ({ promoId: c.promo_id, code: c.code, claimedAt: c.claimed_at })),
    counts: r.counts ?? {},
    friends: r.friends ?? {},
  };
}

/** the server's kip:* errors in words */
export function clubsErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('kip:no-slot')) return 'Every slot is in use. Keep your streak going to open the next one.';
  if (msg.includes('kip:not-member')) return 'Join this club to claim its promotions.';
  if (msg.includes('kip:promo-ended')) return 'This promotion has ended.';
  if (msg.includes('kip:codes-gone')) return 'All the codes for this promotion are gone.';
  return 'That did not work. Check your connection and try again.';
}

interface Snap {
  owner: string | null;
  state: ClubsState | null;
  error: string | null;
}
let snap: Snap = { owner: null, state: null, error: null };
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const set = (next: Partial<Snap>) => {
  snap = { ...snap, ...next };
  subs.forEach((f) => f());
};

async function rpc(name: string, args?: Record<string, unknown>): Promise<Row> {
  const { data, error: e } = await supabase.rpc(name, args);
  if (e) throw new Error(e.message);
  return data as Row;
}

export function reloadClubs(owner: string): Promise<void> {
  if (snap.owner !== owner) set({ owner, state: null, error: null });
  loading ??= rpc('clubs_state')
    .then((r) => set({ state: fromRow(r), error: null }))
    .catch((e) => set({ error: clubsErrorText(e) }))
    .finally(() => {
      loading = null;
    });
  return loading;
}

export async function joinClub(slug: ClubSlug) {
  set({ state: fromRow(await rpc('clubs_join', { p_slug: slug })) });
}
export async function leaveClub(slug: ClubSlug) {
  set({ state: fromRow(await rpc('clubs_leave', { p_slug: slug })) });
}
export async function claimPromo(promoId: string): Promise<string> {
  const r = await rpc('clubs_claim', { p_promo_id: promoId });
  const s = snap.state;
  if (s && !s.claims.some((c) => c.promoId === promoId)) set({ state: { ...s, claims: [...s.claims, { promoId: r.promo_id, code: r.code, claimedAt: r.claimed_at }] } });
  return r.code as string;
}

/** The signed-in account's clubs (null owner: a local demo account, no clubs). Settled on the server each visit. */
export function useClubs(owner: string | null) {
  const s = useSyncExternalStore(
    useCallback((f: () => void) => {
      subs.add(f);
      return () => subs.delete(f);
    }, []),
    () => snap,
  );
  useEffect(() => {
    if (owner) void reloadClubs(owner);
  }, [owner]);
  const mine = owner && s.owner === owner;
  return { state: mine ? s.state : null, error: mine ? s.error : null };
}
