// Which social world the app uses: a signed-in Supabase account always gets the live backend
// (SupabaseSocialRepo), the offline demo and no-backend phone accounts get the simulated mock.
// Nothing from the mock ever reaches a real account: switching closes the other one.
import { MockSocialRepo, type SocialRepo } from './repo';
import { SupabaseSocialRepo } from './supabaseRepo';

const mock = new MockSocialRepo();
let live: SupabaseSocialRepo | null = null;
let active: SocialRepo = mock;
const listeners = new Set<() => void>();
const wake = () => listeners.forEach((fn) => fn());
mock.subscribe(wake);

export function selectSocialRepo(remote: boolean): SocialRepo {
  const next = remote ? (live ??= (() => {
    const r = new SupabaseSocialRepo();
    r.subscribe(wake);
    return r;
  })()) : mock;
  if (next !== active) {
    active.close();
    active = next;
    wake();
  }
  return active;
}

export const activeSocialRepo = () => active;

/** What the store reads (the streak's freeze days) and useSocial subscribes to, whichever repo is on. */
export const socialRepo = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  current: () => active.current(),
  extrasFor: (accountId: string) => active.extrasFor(accountId),
};
