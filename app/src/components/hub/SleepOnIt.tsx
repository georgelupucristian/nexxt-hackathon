import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useCelebrate } from '../mascot/Celebration';
import { Sheet, useToast } from '../ui';
import { useData, useStore } from '../../data/store';
import { todayKey } from '../../lib/dates';
import { formatLei, parseLei } from '../../lib/money';
import { plural } from '../../lib/ro';

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
  if (h <= 1) return 'în mai puțin de o oră';
  if (h < 24) return `în ${plural(h, 'oră', 'ore')}`;
  const d = Math.floor(h / 24);
  const r = h % 24;
  return r ? `în ${plural(d, 'zi', 'zile')} și ${r} h` : `în ${plural(d, 'zi', 'zile')}`;
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
      <button type="button" className={`orb orb--sleep ${awake.length ? 'is-awake' : ''}`} data-tour="sleep" onClick={() => setOpen(true)}>
        <span className="orb__disc">
          <img src={`/mascot/${awake.length ? 'think' : 'sleep'}-face.webp`} alt="" />
          {(awake.length > 0 || asleep.length > 0) && <span className="orb__badge">{awake.length || asleep.length}</span>}
        </span>
        <span className="orb__name">Dorm pe idee</span>
        <span className="orb__sub">{awake.length ? 'S-a trezit, decide' : asleep.length ? 'Kip doarme pe ea' : kept > 0 ? `${formatLei(kept)} necheltuiți` : 'Vrei ceva? 48 h'}</span>
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
    if (!name.trim()) return toast('Ce vrei să-ți iei? Ajunge un nume.', 'error');
    if (!amount || amount <= 0) return toast('Adaugă prețul, de exemplu 129.', 'error');
    const t = Date.now();
    save([...wishes, { id: crypto.randomUUID(), name: name.trim().slice(0, 40), amount, createdAt: t, wakeAt: t + NAP_MS, status: 'sleeping' }]);
    setName('');
    setRaw('');
    toast(`Kip doarme pe idee: ${name.trim()}. Revine în 48 de ore.`);
  };

  const set = (id: string, patch: Partial<Wish>) => save(wishes.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  const keep = (w: Wish) => {
    try {
      addTransaction({ type: 'contribution', amount: w.amount, goalId, date: todayKey(), note: `Dorm pe idee: ${w.name}` });
      set(w.id, { status: 'kept' });
      setDeciding(null);
      const g = goals.find((x) => x.id === goalId);
      onClose();
      celebrate({ title: `+${formatLei(w.amount)} păstrați`, sub: g ? `Nu ți-ai luat ${w.name}. Banii au ajuns la ${g.name}.` : `Nu ți-ai luat ${w.name}.` });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Dorm pe idee">
      <div className="sleep">
        <img
          className="sleep__pose"
          src={sleeping.some((w) => w.wakeAt <= now) ? '/mascot/pose-awake-asking.webp' : '/mascot/pose-sleep-on-it.webp'}
          alt=""
        />
        <p className="sleep__intro">
          Vrei ceva ce nu era în plan? Spune-i lui Kip. Doarme pe idee 48 de ore, apoi te întreabă dacă încă îl vrei. Dacă nu, banii merg la un obiectiv.
        </p>

        <div className="sleep__form">
          <input className="input" placeholder="Ce e? De ex. AirPods" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Ce vrei" />
          <div className="input-affix sleep__price">
            <input className="input" inputMode="decimal" placeholder="Preț" value={raw} onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Prețul în lei" />
            <span className="input-affix__suffix">lei</span>
          </div>
          <button type="button" className="btn btn--primary" onClick={add}>
            Lasă-l pe Kip să doarmă pe idee
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
                        <p className="wish__ask">Kip s-a trezit. Îl mai vrei?</p>
                      ) : (
                        <p className="wish__when">
                          Se trezește {wakesIn(w.wakeAt - now)}
                          {account?.isDemo && (
                            <button
                              type="button"
                              className="link-btn wish__skip"
                              onClick={() => {
                                set(w.id, { wakeAt: Date.now() - 1 });
                                refreshNow();
                              }}
                            >
                              Sari 48 h (demo)
                            </button>
                          )}
                        </p>
                      )}
                      {awake && deciding !== w.id && (
                        <div className="wish__actions">
                          <button type="button" className="btn btn--primary btn--sm" onClick={() => setDeciding(w.id)}>
                            Nu, păstrez banii
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              set(w.id, { status: 'bought' });
                              toast('Perfect. Să-ți fie de bine.');
                            }}
                          >
                            Da, încă îl vreau
                          </button>
                        </div>
                      )}
                      {awake && deciding === w.id && (
                        <div className="wish__keep">
                          <div className="qr__goals" role="radiogroup" aria-label="Unde merg banii">
                            {goals.map((g) => (
                              <button key={g.id} type="button" role="radio" aria-checked={goalId === g.id} className="qr__goal" onClick={() => setGoalId(g.id)}>
                                {g.name}
                              </button>
                            ))}
                            <button type="button" role="radio" aria-checked={goalId === null} className="qr__goal" onClick={() => setGoalId(null)}>
                              Fără obiectiv
                            </button>
                          </div>
                          <button type="button" className="btn btn--primary btn--sm" onClick={() => keep(w)}>
                            Pune deoparte {formatLei(w.amount)}
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
            Bani necheltuiți după ce Kip a dormit pe idee: <strong className="money">{formatLei(keptTotal)}</strong>, din {plural(kept.length, 'lucru', 'lucruri')}.
          </p>
        )}
      </div>
    </Sheet>
  );
}
