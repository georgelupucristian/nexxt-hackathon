import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useCelebrate } from '../mascot/Celebration';
import { Sheet, useToast } from '../ui';
import { useData, useStore } from '../../data/store';
import { todayKey } from '../../lib/dates';
import { formatLei, parseLei } from '../../lib/money';

/**
 * "Sleep on it": a cooling-off period for impulse buys, framed as Kip doing you a favour.
 *
 * You write down the thing you want and its price. Kip sleeps on it for 48 hours. When he wakes he
 * asks if you still want it. Yes is fine, no judgement. No turns the price into savings for a goal
 * you pick, so the money you didn't spend is counted instead of forgotten. Same idea as Monzo's
 * 48-hour wait on its gambling block: a little friction, offered as care.
 *
 * Kept in its own localStorage key, outside the main data store, so it can't disturb the ledger.
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
  if (h <= 1) return 'within the hour';
  if (h < 24) return `in ${h} hours`;
  const d = Math.floor(h / 24);
  const r = h % 24;
  return r ? `in ${d} day${d === 1 ? '' : 's'} ${r} h` : `in ${d} day${d === 1 ? '' : 's'}`;
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
      <button type="button" className={`tile tile--sleep ${awake.length ? 'is-awake' : ''}`} onClick={() => setOpen(true)}>
        <img className="tile__kip" src={`/mascot/${awake.length ? 'think' : 'sleep'}-face.webp`} alt="" />
        <span className="tile__label">Sleep on it</span>
        {awake.length ? (
          <span className="tile__amount">
            {awake.length} <small>to decide</small>
          </span>
        ) : asleep.length ? (
          <span className="tile__amount">
            {asleep.length} <small>asleep</small>
          </span>
        ) : (
          <span className="tile__amount tile__amount--text">Want something?</span>
        )}
        <span className="tile__sub">{kept > 0 ? `${formatLei(kept)} not spent so far` : 'Kip waits 48 h with you'}</span>
      </button>
      <SleepSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function SleepSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const { account, addTransaction } = useStore();
  const { wishes, now, save, refreshNow } = useWishes(account?.id);
  const toast = useToast();
  const celebrate = useCelebrate();
  const goals = data.goals.filter((g) => g.status === 'active');
  const [name, setName] = useState('');
  const [raw, setRaw] = useState('');
  const [deciding, setDeciding] = useState<string | null>(null);
  const [goalId, setGoalId] = useState<string | null>(goals[0]?.id ?? null);

  const sleeping = wishes.filter((w) => w.status === 'sleeping').sort((a, b) => a.wakeAt - b.wakeAt);
  const kept = wishes.filter((w) => w.status === 'kept');
  const keptTotal = kept.reduce((s, w) => s + w.amount, 0);

  const add = () => {
    const amount = parseLei(raw);
    if (!name.trim()) return toast('What is it you want? A name is enough.', 'error');
    if (!amount || amount <= 0) return toast('Add its price, like 129.', 'error');
    const t = Date.now();
    save([...wishes, { id: crypto.randomUUID(), name: name.trim().slice(0, 40), amount, createdAt: t, wakeAt: t + NAP_MS, status: 'sleeping' }]);
    setName('');
    setRaw('');
    toast(`Kip is sleeping on ${name.trim()}. Back in 48 hours.`);
  };

  const set = (id: string, patch: Partial<Wish>) => save(wishes.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  const keep = (w: Wish) => {
    try {
      addTransaction({ type: 'contribution', amount: w.amount, goalId, date: todayKey(), note: `Slept on it: ${w.name}` });
      set(w.id, { status: 'kept' });
      setDeciding(null);
      const g = goals.find((x) => x.id === goalId);
      onClose();
      celebrate({ title: `+${formatLei(w.amount)} kept`, sub: g ? `You didn’t buy ${w.name}. It went to ${g.name}.` : `You didn’t buy ${w.name}.` });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Sleep on it">
      <div className="sleep">
        <p className="sleep__intro">
          Want something that isn’t in your plan? Tell Kip. He sleeps on it for 48 hours, then asks if you still want it. If you don’t, the money goes to a goal.
        </p>

        <div className="sleep__form">
          <input className="input" placeholder="What is it? e.g. AirPods" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="What you want" />
          <div className="input-affix sleep__price">
            <input className="input" inputMode="decimal" placeholder="Price" value={raw} onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Price in lei" />
            <span className="input-affix__suffix">lei</span>
          </div>
          <button type="button" className="btn btn--primary" onClick={add}>
            Let Kip sleep on it
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
                        <p className="wish__ask">Kip’s awake. Do you still want it?</p>
                      ) : (
                        <p className="wish__when">
                          Wakes {wakesIn(w.wakeAt - now)}
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
                            No, keep the money
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              set(w.id, { status: 'bought' });
                              toast('Fair enough. Enjoy it.');
                            }}
                          >
                            Yes, still want it
                          </button>
                        </div>
                      )}
                      {awake && deciding === w.id && (
                        <div className="wish__keep">
                          <div className="qr__goals" role="radiogroup" aria-label="Put it towards">
                            {goals.map((g) => (
                              <button key={g.id} type="button" role="radio" aria-checked={goalId === g.id} className="qr__goal" onClick={() => setGoalId(g.id)}>
                                {g.name}
                              </button>
                            ))}
                            <button type="button" role="radio" aria-checked={goalId === null} className="qr__goal" onClick={() => setGoalId(null)}>
                              No goal
                            </button>
                          </div>
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
            Not bought after sleeping on it: <strong className="money">{formatLei(keptTotal)}</strong> across {kept.length} thing{kept.length === 1 ? '' : 's'}.
          </p>
        )}
      </div>
    </Sheet>
  );
}
