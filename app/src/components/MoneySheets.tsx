// Putting money in and taking it out, each as one small sheet: a big amount, a few amounts to tap,
// where it goes (already picked for you) and one button that says exactly what will happen.
// The long form (MoneySheet in sheets.tsx) stays for editing an entry and for the Activity ledger.
import { useEffect, useRef, useState } from 'react';
import { GoalTile } from './domain';
import { useCelebrate } from './mascot/Celebration';
import { Sheet, useToast } from './ui';
import { activeGoals, available, primaryGoal } from '../data/selectors';
import { ActionError, useData, useStore } from '../data/store';
import { todayKey } from '../lib/dates';
import { goalLook } from '../lib/goalLook';
import { formatLei, parseLei } from '../lib/money';

const clean = (v: string) => v.replace(/[^\d.,]/g, '').slice(0, 9);
const asRaw = (b: number) => String(b / 100).replace('.', ',');

export function AmountInput({ raw, onRaw, onEnter, inputRef, label }: { raw: string; onRaw: (v: string) => void; onEnter: () => void; inputRef: React.RefObject<HTMLInputElement>; label: string }) {
  return (
    <label className="saves__amount">
      <input
        ref={inputRef}
        data-autofocus
        inputMode="decimal"
        placeholder="0"
        value={raw}
        onChange={(e) => onRaw(clean(e.target.value))}
        onKeyDown={(e) => e.key === 'Enter' && onEnter()}
        aria-label={label}
        style={{ width: `${Math.max(1, raw.length || 1) + 0.6}ch` }}
      />
      <span>lei</span>
    </label>
  );
}

export function QuickAmounts({ values, amount, onPick, label }: { values: { value: number; text?: string }[]; amount: number; onPick: (v: number) => void; label: string }) {
  return (
    <div className="saves__quick" role="group" aria-label={label}>
      {values.map(({ value, text }) => (
        <button key={value} type="button" aria-pressed={amount === value} onClick={() => onPick(value)}>
          {text ?? formatLei(value)}
        </button>
      ))}
    </div>
  );
}

// ---------- put money aside ----------

export interface SaveSheetProps {
  open: boolean;
  onClose: () => void;
  /** the goal to start on; undefined picks the main goal, null means "No goal" */
  goalId?: string | null;
  presetAmount?: number;
}

export function SaveSheet({ open, onClose, goalId, presetAmount }: SaveSheetProps) {
  const data = useData();
  const { addTransaction } = useStore();
  const toast = useToast();
  const celebrate = useCelebrate();
  const [raw, setRaw] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  // the chip the sheet opened on goes first (a goal or "No goal"), so the choice is always in view
  const [first, setFirst] = useState<string | null>(null);
  const goals = [...activeGoals(data.goals)].sort((a, b) => Number(b.id === first) - Number(a.id === first));
  const input = useRef<HTMLInputElement>(null);
  const amount = parseLei(raw) ?? 0;
  const demo = data.tracking === 'demo';

  useEffect(() => {
    if (!open) return;
    const start = goalId !== undefined ? goalId : primaryGoal(data.goals)?.id ?? null;
    setRaw(presetAmount ? asRaw(presetAmount) : '');
    setTarget(start);
    setFirst(start);
    const t = window.setTimeout(() => input.current?.focus(), 120);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goalId, presetAmount]);

  const chosen = goals.find((g) => g.id === target) ?? null;
  // the goal's own plan amount and a few round numbers, smallest first so the row reads in order
  const planned = chosen && chosen.plan.frequency !== 'flexible' ? chosen.plan.amount : 0;
  const quick = [...new Set([planned, 10_00, 25_00, 50_00, 100_00].filter((v) => v > 0))]
    .slice(0, 4)
    .sort((a, b) => a - b);

  const save = () => {
    if (amount <= 0) return;
    try {
      addTransaction({ type: 'contribution', amount, goalId: target, date: todayKey(), note: '' });
      onClose();
      celebrate({ title: `+${formatLei(amount)} saved`, sub: chosen ? `For ${chosen.name}.` : 'Into your savings, no goal attached.' });
    } catch (e) {
      toast(e instanceof ActionError ? e.message : 'Nothing was saved. Give it another go.', 'error');
    }
  };

  const none = (
    <button type="button" role="radio" className="saves__none" aria-checked={target === null} onClick={() => setTarget(null)}>
      No goal
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Save money">
      <div className="saves">
        <AmountInput raw={raw} onRaw={setRaw} onEnter={save} inputRef={input} label="Amount in lei" />
        <QuickAmounts values={quick.map((value) => ({ value }))} amount={amount} onPick={(v) => setRaw(asRaw(v))} label="Quick amounts" />

        <div className="saves__for">
          <p className="saves__label" id="saves-for">
            For
          </p>
          <div className="saves__goals" role="radiogroup" aria-labelledby="saves-for">
            {first === null && none}
            {goals.map((g) => (
              <button key={g.id} type="button" role="radio" aria-checked={target === g.id} onClick={() => setTarget(g.id)} style={{ ['--chip' as string]: goalLook(g).fill }}>
                <GoalTile goal={g} size={22} />
                <span className="truncate">{g.name}</span>
              </button>
            ))}
            {first !== null && none}
          </div>
        </div>

        <p className="saves__note">{demo ? 'Demo account: this is a simulated transfer. It shows up in your total in a few seconds.' : 'You\'re logging money you\'ve already set aside. Kip never moves money.'}</p>

        <button type="button" className="savebtn savebtn--confirm" disabled={amount <= 0} onClick={save}>
          {amount > 0 ? `Save ${formatLei(amount)}` : 'Enter an amount'}
        </button>
      </div>
    </Sheet>
  );
}

// ---------- take money out ----------

export function WithdrawSheet({ open, onClose, goalId }: { open: boolean; onClose: () => void; goalId: string | null }) {
  const data = useData();
  const { addTransaction } = useStore();
  const toast = useToast();
  const [raw, setRaw] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const goal = goalId ? data.goals.find((g) => g.id === goalId) ?? null : null;
  const max = available(data.transactions, goalId);
  const amount = parseLei(raw) ?? 0;
  const tooMuch = amount > max;
  const demo = data.tracking === 'demo';

  useEffect(() => {
    if (!open) return;
    setRaw('');
    const t = window.setTimeout(() => input.current?.focus(), 120);
    return () => window.clearTimeout(t);
  }, [open]);

  const quick = [...[50_00, 100_00].filter((v) => v < max).map((value) => ({ value })), ...(max > 0 ? [{ value: max, text: `All (${formatLei(max)})` }] : [])];

  const take = () => {
    if (amount <= 0 || tooMuch) return;
    try {
      addTransaction({ type: 'withdrawal', amount, goalId, date: todayKey(), note: '' });
      onClose();
      toast(demo ? `Simulated withdrawal of ${formatLei(amount)}. It confirms in a few seconds.` : `You withdrew ${formatLei(amount)}${goal ? ` from ${goal.name}` : ''}.`);
    } catch (e) {
      toast(e instanceof ActionError ? e.message : 'Nothing was saved. Give it another go.', 'error');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Withdraw money">
      <div className="saves">
        <p className="saves__from">
          From <strong>{goal ? goal.name : 'savings with no goal'}</strong>. You have <strong className="money">{formatLei(max)}</strong> here.
        </p>
        <AmountInput raw={raw} onRaw={setRaw} onEnter={take} inputRef={input} label="Amount to withdraw, in lei" />
        {tooMuch ? (
          <p className="saves__error" role="alert">
            You only have {formatLei(max)} here.
          </p>
        ) : (
          quick.length > 0 && <QuickAmounts values={quick} amount={amount} onPick={(v) => setRaw(asRaw(v))} label="Quick amounts" />
        )}
        <p className="saves__note">{demo ? 'Demo account: this is a simulated withdrawal.' : 'You\'re logging money you\'ve already taken out. Kip never moves money.'}</p>
        <button type="button" className="savebtn savebtn--out" disabled={amount <= 0 || tooMuch} onClick={take}>
          {amount > 0 && !tooMuch ? `Withdraw ${formatLei(amount)}` : 'Enter an amount'}
        </button>
      </div>
    </Sheet>
  );
}
