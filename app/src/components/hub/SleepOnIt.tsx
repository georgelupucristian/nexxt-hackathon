import { ChevronRight, Moon } from '@/lib/icons';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { GoalTile } from '../domain';
import { useCelebrate } from '../mascot/Celebration';
import { Sheet, useToast } from '../ui';
import { primaryGoal } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import { todayKey } from '../../lib/dates';
import { goalLook } from '../../lib/goalLook';
import { formatLei, parseLei } from '../../lib/money';
import { plural } from '../../lib/plural';

/**
 * "Sleep on it": a cooling-off period for impulse buys, framed as Kip doing you a favour.
 *
 * You write down the thing you want and its price. Kip sleeps on it for 48 hours. When he wakes he
 * asks if you still want it. Yes is fine, no judgement. No turns the price into savings for a goal
 * you pick, so the money you didn't spend is counted instead of forgotten. Same idea as Monzo's
 * 48-hour wait on its gambling block: a little friction, offered as care.
 *
 * Kip in its own localStorage key, outside the main data store, so it can't disturb the ledger.
 */

const NAP_MS = 48 * 60 * 60 * 1000;

interface Wish {
  id: string;
  name: string;
  amount: number; // bani
  createdAt: number;
  wakeAt: number;
  status: 'sleeping' | 'kept' | 'bought';
}

const keyFor = (accountId: string) => `kept.wishes.${accountId}`;
const CHANGED = 'kept:wishes';

function read(accountId: string): Wish[] {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(accountId)) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function write(accountId: string, wishes: Wish[]) {
  try {
    localStorage.setItem(keyFor(accountId), JSON.stringify(wishes));
  } catch {
    /* storage full or blocked: the feature simply doesn't persist */
  }
  window.dispatchEvent(new Event(CHANGED));
}

function useWishes(accountId: string | undefined) {
  const [wishes, setWishes] = useState<Wish[]>(() => (accountId ? read(accountId) : []));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!accountId) return;
    const sync = () => setWishes(read(accountId));
    sync();
    window.addEventListener(CHANGED, sync);
    window.addEventListener('storage', sync);
    // Kip wakes up on his own while the app is open
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', sync);
      window.clearInterval(tick);
    };
  }, [accountId]);
  const save = (next: Wish[]) => accountId && write(accountId, next);
  return { wishes, now, save, refreshNow: () => setNow(Date.now()) };
}

function wakesIn(ms: number): string {
  const h = Math.ceil(ms / 3_600_000);
  if (h <= 1) return 'in less than an hour';
  if (h < 24) return `in ${plural(h, 'hour', 'hours')}`;
  const d = Math.floor(h / 24);
  const r = h % 24;
  return r ? `in ${plural(d, 'day', 'days')} and ${r} h` : `in ${plural(d, 'day', 'days')}`;
}

/** The home tile: how many wishes Kip is sleeping on, or an invitation when there are none. */
export function SleepTile() {
  const { account } = useStore();
  const { wishes, now } = useWishes(account?.id);
  const [open, setOpen] = useState(false);
  const asleep = wishes.filter((w) => w.status === 'sleeping' && w.wakeAt > now);
  const awake = wishes.filter((w) => w.status === 'sleeping' && w.wakeAt <= now);
  const kept = wishes.filter((w) => w.status === 'kept').reduce((s, w) => s + w.amount, 0);

  return (
    <>
      <button type="button" className={`sleeprow ${awake.length ? 'is-awake' : ''}`} data-tour="sleep" onClick={() => setOpen(true)}>
        <span className="sleeprow__icon" aria-hidden>
          <Moon size={20} />
        </span>
        <span className="sleeprow__text">
          <span className="sleeprow__title">Sleep on it</span>
          <span className="sleeprow__sub">
            {awake.length
              ? `${plural(awake.length, 'thing', 'things')} to decide now`
              : asleep.length
                ? `${plural(asleep.length, 'wish', 'wishes')} waiting`
                : kept > 0
                  ? `${formatLei(kept)} not spent so far`
                  : 'Want something pricey? Wait 48 h before you buy it.'}
          </span>
        </span>
        <ChevronRight size={18} aria-hidden />
      </button>
      <SleepSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function SleepSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const { account, addTransaction, money, deposit } = useStore();
  const { wishes, now, save, refreshNow } = useWishes(account?.id);
  const toast = useToast();
  const celebrate = useCelebrate();
  const goals = data.goals.filter((g) => g.status === 'active').sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const [name, setName] = useState('');
  const [raw, setRaw] = useState('');
  const [deciding, setDeciding] = useState<string | null>(null);
  const main = primaryGoal(data.goals);
  // the money you didn't spend goes to your main goal unless you pick another
  const [goalId, setGoalId] = useState<string | null>(() => main?.id ?? goals[0]?.id ?? null);
  const price = parseLei(raw) ?? 0;
  const ready = name.trim().length > 0 && price > 0;

  const sleeping = wishes.filter((w) => w.status === 'sleeping').sort((a, b) => a.wakeAt - b.wakeAt);
  const kept = wishes.filter((w) => w.status === 'kept');
  const keptTotal = kept.reduce((s, w) => s + w.amount, 0);

  const add = () => {
    if (!ready) return;
    const t = Date.now();
    save([...wishes, { id: crypto.randomUUID(), name: name.trim().slice(0, 40), amount: price, createdAt: t, wakeAt: t + NAP_MS, status: 'sleeping' }]);
    setName('');
    setRaw('');
    toast(`Kip is sleeping on it: ${name.trim()}. Back in 48 hours.`);
  };

  const set = (id: string, patch: Partial<Wish>) => save(wishes.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  const keep = async (w: Wish) => {
    if (money) {
      // a cloud account puts the money aside for real: it rides on the next monthly top-up, no extra fee
      if (!money.running) return toast('Start saving first, from "Save money".', 'error');
      try {
        await deposit(w.amount, 'next_topup', `Sleep on it: ${w.name}`);
        set(w.id, { status: 'kept' });
        setDeciding(null);
        onClose();
        toast(`${formatLei(w.amount)} goes on your next deposit, no extra fee.`);
      } catch (e) {
        toast((e as Error).message, 'error');
      }
      return;
    }
    try {
      addTransaction({ type: 'contribution', amount: w.amount, goalId, date: todayKey(), note: `Sleep on it: ${w.name}` });
      set(w.id, { status: 'kept' });
      setDeciding(null);
      const g = goals.find((x) => x.id === goalId);
      onClose();
      celebrate({ title: `+${formatLei(w.amount)} kept`, sub: g ? `You skipped ${w.name}. The money went to ${g.name}.` : `You skipped ${w.name}.` });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Sleep on it">
      <div className="sleep">
        <img
          className="sleep__pose"
          src={sleeping.some((w) => w.wakeAt <= now) ? '/mascot/pose-awake-asking.webp' : '/mascot/pose-sleep-on-it.webp'}
          alt=""
        />
        <p className="sleep__intro">
          Want something that wasn't in the plan? Write it here. Kip sleeps on it for 48 hours, then asks if you still want it.
        </p>

        <div className="sleep__form">
          <input className="input" placeholder="What do you want? E.g. AirPods" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="What you want to buy" />
          <div className="input-affix sleep__price">
            <input className="input" inputMode="decimal" placeholder="Price" value={raw} onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Price, in lei" />
            <span className="input-affix__suffix">lei</span>
          </div>
          <button type="button" className="btn btn--primary" disabled={!ready} onClick={add}>
            {ready ? 'Kip sleeps on it for 48 h' : 'Write what it is and the price'}
          </button>
        </div>

        {sleeping.length > 0 && (
          <ul className="sleep__list">
            <AnimatePresence initial={false}>
              {sleeping.map((w) => {
                const awake = w.wakeAt <= now;
                return (
                  <motion.li key={w.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className={`wish ${awake ? 'wish--awake' : ''}`}>
                    <img src={`/mascot/${awake ? 'think' : 'sleep'}-face.webp`} alt="" className="wish__kip" />
                    <div className="wish__body">
                      <p className="wish__name">
                        {w.name} <span className="money">{formatLei(w.amount)}</span>
                      </p>
                      {awake ? (
                        <p className="wish__ask">{deciding === w.id ? `Where do the ${formatLei(w.amount)} go?` : 'Kip is awake. Still want it?'}</p>
                      ) : (
                        <p className="wish__when">
                          Wakes up {wakesIn(w.wakeAt - now)}
                          {account?.isDemo && (
                            <button
                              type="button"
                              className="link-btn wish__skip"
                              onClick={() => {
                                set(w.id, { wakeAt: Date.now() - 1 });
                                refreshNow();
                              }}
                            >
                              Skip 48 h (demo)
                            </button>
                          )}
                        </p>
                      )}
                      {awake && deciding !== w.id && (
                        <div className="wish__actions">
                          <button type="button" className="btn btn--primary btn--sm" onClick={() => setDeciding(w.id)}>
                            No, save the money
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              set(w.id, { status: 'bought' });
                              toast('Great. Enjoy it.');
                            }}
                          >
                            Yes, buy it
                          </button>
                        </div>
                      )}
                      {awake && deciding === w.id && (
                        <div className="wish__keep">
                          {money ? (
                            // real money rides on the next monthly top-up, which always goes to the main goal
                            <p className="small muted">{`It goes on your next deposit${main ? `, for ${main.name}` : ''}. No extra fee.`}</p>
                          ) : (
                            // the same goal chips as "Save money", main goal first and already picked
                            <div className="saves__goals" role="radiogroup" aria-label="Where the money goes">
                              {goals.map((g) => (
                                <button key={g.id} type="button" role="radio" aria-checked={goalId === g.id} onClick={() => setGoalId(g.id)} style={{ ['--chip' as string]: goalLook(g).fill }}>
                                  <GoalTile goal={g} size={22} />
                                  <span className="truncate">{g.name}</span>
                                </button>
                              ))}
                              <button type="button" role="radio" className="saves__none" aria-checked={goalId === null} onClick={() => setGoalId(null)}>
                                No goal
                              </button>
                            </div>
                          )}
                          <button type="button" className="btn btn--primary btn--sm" onClick={() => keep(w)}>
                            Save {formatLei(w.amount)}
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}

        {keptTotal > 0 && (
          <p className="sleep__kept">
            Money not spent after Kip slept on it: <strong className="money">{formatLei(keptTotal)}</strong>, from {plural(kept.length, 'thing', 'things')}.
          </p>
        )}
      </div>
    </Sheet>
  );
}
