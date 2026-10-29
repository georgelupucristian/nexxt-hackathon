// The week as the home streak card draws it: seven circles joined by short links, Noto's flame on
// a day you put money aside, Noto's snowflake on a day a freeze covered. Shared by the home card and the
// streak rules screen so the two always look the same. It needs an orange `.streakd` around it.
import type { DayState } from '../data/selectors';
import type { Account } from '../data/types';
import { todayKey, toKey, WEEKDAY_NAME } from '../lib/dates';

const SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const isDone = (s: DayState) => s === 'done' || s === 'today-done';
const keepsRun = (s: DayState) => isDone(s) || s === 'paused';

/**
 * The day the week starts counting from: the account's first day (the demo has always been here),
 * or the first saved day if that's earlier. Money can land on a day before the account row says it
 * was made (seeded test accounts, a ledger older than the profile), and those days must still light.
 */
export function joinedKey(account: Account | null, actions: { date: string }[] = []): string {
  if (account?.isDemo) return '2000-01-01';
  const made = account ? toKey(new Date(account.createdAt)) : todayKey();
  return actions.reduce((first, a) => (a.date < first ? a.date : first), made);
}

export function StreakWeek({ days }: { days: { key: string; state: DayState }[] }) {
  return (
    <ol className="streakd__week" aria-label="This week">
      {days.map((d, i) => {
        const done = isDone(d.state);
        const now = d.key === todayKey();
        const said = done ? 'money saved' : d.state === 'paused' ? 'covered by a Freeze' : now ? 'today' : d.state === 'future' ? 'coming up' : 'no savings';
        const link = keepsRun(d.state) && i < 6 && keepsRun(days[i + 1].state);
        return (
          <li key={d.key} className={`streakd__day ${done ? 'is-done' : ''} ${now ? 'is-now' : ''} ${link ? 'link-done' : ''} is-${d.state}`} aria-label={`${WEEKDAY_NAME[i]}: ${said}`}>
            <span className="streakd__w" aria-hidden>
              {SHORT[i]}
            </span>
            <span className="streakd__dot" aria-hidden>
              {done && <img src="/mascot/flame.webp" alt="" className="streakd__dayfire" />}
              {/* a day a freeze covered: the snowflake, and the run stays joined through it */}
              {d.state === 'paused' && <img src="/mascot/ice.webp" alt="" className="streakd__dayfire streakd__dayice" />}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
