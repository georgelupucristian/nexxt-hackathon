// Opens the signed-in account's social world and keeps it in step with the app: every saving the
// app records goes in (it fills streak days, activates a friend's freeze), the end-of-day rules run
// again each minute and when the tab comes back. A Supabase account gets the live backend, the
// offline demo the simulated world (lib/social/active.ts). Screens read it with useSocial().
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { goalSaved, primaryGoal, progress } from '../../data/selectors';
import { useStore } from '../../data/store';
import { activeSocialRepo, selectSocialRepo, socialRepo } from '../../lib/social/active';
import type { MeSnapshot, SocialRepo } from '../../lib/social/repo';
import type { SocialWorld, UserId } from '../../lib/social/types';

/** An invite code from a link (/start?invite=…), redeemed once the new account exists. */
export const INVITE_KEY = 'kip.invite';

export function SocialSync({ children }: { children: ReactNode }) {
  const { account, data } = useStore();
  const last = useRef<MeSnapshot | null>(null);

  const saves = useMemo(
    () => (data ? data.actions.filter((a) => a.kind === 'contribution').map((a) => ({ day: a.date, at: a.at || `${a.date}T12:00:00.000Z` })) : []),
    [data?.actions],
  );
  const goal = data ? primaryGoal(data.goals) : null;
  const goalProgress = data && goal ? progress(goalSaved(data.transactions, goal.id), goal.target) : 0;
  const savesKey = saves.map((s) => s.day + s.at).join(',');
  const pausedKey = data?.pausedDays.join(',') ?? '';
  const remote = !!account?.remote;

  useEffect(() => {
    if (!account || !data) {
      last.current = null;
      activeSocialRepo().close();
      return;
    }
    const repo = selectSocialRepo(remote);
    const me: MeSnapshot = { id: account.id, name: account.name, phone: account.phone, createdAt: account.createdAt, saves, legacyPaused: data.pausedDays, goalProgress };
    last.current = me;
    repo.open(me);
    // a link someone shared: your 1-day Freeze to start, theirs recharged (only a brand-new account can use one)
    try {
      const code = sessionStorage.getItem(INVITE_KEY);
      if (code && Date.now() - new Date(account.createdAt).getTime() < 24 * 3_600_000) {
        void Promise.resolve(repo.redeemInvite(code)).then(
          () => sessionStorage.removeItem(INVITE_KEY),
          () => undefined,
        );
      }
    } catch {
      /* no session storage: the link just doesn't count */
    }
    // the deps are the values that change what goes in, not the objects that carry them
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, account?.name, account?.phone, remote, savesKey, pausedKey, Math.round(goalProgress * 100), !!data]);

  // midnight passes, 24 hours run out: look again every minute and whenever the tab comes back
  useEffect(() => {
    const again = () => last.current && activeSocialRepo().open(last.current);
    const t = window.setInterval(again, 60_000);
    const onVis = () => document.visibilityState === 'visible' && again();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <>{children}</>;
}

export interface SocialCtx {
  world: SocialWorld;
  /** who the screens look through: always the signed-in account */
  viewer: UserId;
  /** the signed-in account in the social world */
  me: UserId;
  /** the offline demo: simulated people, the demo address book, colonies and shared goals */
  simulated: boolean;
  now: Date;
  repo: SocialRepo;
}

/** The world, or null while nobody is signed in. Re-renders on every change and once a minute. */
export function useSocial(): SocialCtx | null {
  const world = useSyncExternalStore(
    useCallback((fn: () => void) => socialRepo.subscribe(fn), []),
    () => socialRepo.current(),
  );
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return useMemo(() => {
    if (!world) return null;
    const repo = activeSocialRepo();
    return { world, viewer: world.me, me: world.me, simulated: repo.simulated, now: new Date(), repo };
    // tick: a fresh `now` once a minute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, tick]);
}
