import { AlertCircle, FlaskConical } from '@/lib/icons';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { available, bestStreak, currentStreak, goalSaved, primaryGoal, progress, projectedFinish, requiredPace } from '../data/selectors';
import { ActionError, useData, useStore } from '../data/store';
import { useCelebrate } from './mascot/Celebration';
import type { Frequency, Goal, Plan, Transaction } from '../data/types';
import { formatDate, ordinal, todayKey } from '../lib/dates';
import { formatLei, parseLei } from '../lib/money';
import { plural } from '../lib/ro';
import { planLabel } from './domain';
import { Select } from './watermelon/select';
import { Banner, Button, DayPicker, Field, ProgressBar, Segmented, Sheet, TextField, useToast } from './ui';

// ---------- Add / withdraw / edit money ----------

export interface MoneySheetProps {
  open: boolean;
  onClose: () => void;
  mode?: Transaction['type'];
  goalId?: string | null;
  presetAmount?: number;
  editing?: Transaction;
}

export function MoneySheet({ open, onClose, mode = 'contribution', goalId = null, presetAmount, editing }: MoneySheetProps) {
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const celebrate = useCelebrate();
  const amountId = useId();
  const [type, setType] = useState<Transaction['type']>(mode);
  const [raw, setRaw] = useState('');
  const [target, setTarget] = useState<string>('');
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset the form each time the sheet opens so stale input never leaks between uses.
  useEffect(() => {
    if (!open) return;
    setType(editing?.type ?? mode);
    setRaw(editing ? String(editing.amount / 100).replace('.', ',') : presetAmount ? String(presetAmount / 100).replace('.', ',') : '');
    setTarget((editing ? editing.goalId : goalId) ?? 'none');
    setDate(editing?.date ?? todayKey());
    setNote(editing?.note ?? '');
    setError(null);
    setTouched(false);
    setBusy(false);
  }, [open, editing, mode, goalId, presetAmount]);

  const buckets = useMemo(() => data.goals.filter((g) => g.status !== 'archived' || g.id === editing?.goalId), [data.goals, editing]);
  const bucketId = target === 'none' ? null : target;
  const amount = parseLei(raw);
  const max = type === 'withdrawal' ? available(data.transactions, bucketId, editing?.id) : null;
  const isDemo = data.tracking === 'demo' && !editing;

  const amountError = !touched
    ? null
    : amount === null
      ? 'Scrie o sumă, de exemplu 50 sau 50,50.'
      : amount <= 0
        ? 'Scrie o sumă mai mare de 0.'
        : max !== null && amount > max
          ? `Poți retrage cel mult ${formatLei(max)} din ${bucketId ? 'acest obiectiv' : 'economiile nealocate'}.`
          : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (amount === null || amount <= 0 || (max !== null && amount > max)) return;
    setBusy(true);
    try {
      const input = { type, amount, goalId: bucketId, date, note };
      if (editing) {
        store.editTransaction(editing.id, input);
        toast('Intrare actualizată');
      } else {
        store.addTransaction(input);
        if (!isDemo && type === 'contribution') {
          // the moment the app exists for: make it feel like something happened
          const g = bucketId ? data.goals.find((x) => x.id === bucketId) : null;
          celebrate({ title: `+${formatLei(amount)} puși deoparte`, sub: g ? `Pentru ${g.name}. Încet, dar sigur.` : 'Intră în economiile tale nealocate.' });
        } else {
          toast(isDemo ? 'Transfer pornit. Rămâne în așteptare până la următoarea sincronizare.' : `Retragere de ${formatLei(amount)} adăugată`);
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof ActionError ? err.message : 'Ceva n-a mers. Nu s-a salvat nimic.');
    } finally {
      setBusy(false);
    }
  }

  const title = editing ? 'Editează intrarea' : type === 'contribution' ? (isDemo ? 'Adaugă bani' : 'Adaugă economii') : 'Adaugă o retragere';
  const quick = [25_00, 50_00, 100_00];
  const plannedGoal = bucketId ? data.goals.find((g) => g.id === bucketId) : null;
  if (plannedGoal && plannedGoal.plan.amount > 0 && !quick.includes(plannedGoal.plan.amount)) quick.unshift(plannedGoal.plan.amount);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form className="stack-lg" onSubmit={submit} noValidate>
        {!editing && (
          <Segmented
            label="Tip"
            value={type}
            onChange={(v) => {
              setType(v);
              setTouched(false);
            }}
            options={[
              { value: 'contribution', label: 'Adaugă' },
              { value: 'withdrawal', label: 'Retrage' },
            ]}
          />
        )}

        <div className="amount-entry">
          <label htmlFor={amountId} className="small muted">
            {type === 'contribution' ? 'Suma economisită' : 'Suma retrasă'}
          </label>
          <div className="row" style={{ gap: 8, justifyContent: 'center', width: '100%' }}>
            <input
              id={amountId}
              data-autofocus
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={raw}
              onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, '').slice(0, 12))}
              onBlur={() => raw && setTouched(true)}
              aria-invalid={amountError ? true : undefined}
              className="money"
              style={{
                width: `${Math.max(2, raw.length + 0.5)}ch`,
                maxWidth: '100%',
                border: 0,
                background: 'transparent',
                fontSize: '3.25rem',
                fontWeight: 750,
                letterSpacing: '-0.03em',
                textAlign: 'right',
                padding: 0,
                outline: 'none',
              }}
            />
            <span style={{ fontSize: 'var(--fs-xl)', fontWeight: 650, color: 'var(--ink-3)' }}>lei</span>
          </div>
          {max !== null && <p className="small subtle">Disponibil: {formatLei(max)}</p>}
          {amountError && (
            <p className="field-error" role="alert">
              <AlertCircle size={16} aria-hidden /> {amountError}
            </p>
          )}
          <div className="quick-amounts">
            {quick.slice(0, 4).map((q) => (
              <button key={q} type="button" className="chip" onClick={() => setRaw(String(q / 100))}>
                {formatLei(q)}
              </button>
            ))}
          </div>
        </div>

        <Field label={type === 'contribution' ? 'Pune banii la' : 'Ia banii din'} htmlFor="bucket">
          <Select
            id="bucket"
            name="bucket"
            label={type === 'contribution' ? 'Pune banii la' : 'Ia banii din'}
            hideLabel
            value={target}
            onChange={setTarget}
            options={[
              ...buckets.map((g) => ({
                value: g.id,
                label: g.status === 'paused' ? `${g.name} (în pauză)` : g.name,
                hint: type === 'withdrawal' ? `Disponibil: ${formatLei(available(data.transactions, g.id, editing?.id))}` : undefined,
              })),
              { value: 'none', label: 'Nealocat', hint: type === 'withdrawal' ? `Disponibil: ${formatLei(available(data.transactions, null, editing?.id))}` : undefined },
            ]}
          />
        </Field>

        <div className="btn-row" style={{ alignItems: 'flex-start' }}>
          <TextField label="Data" type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value || todayKey())} />
        </div>
        <TextField label={<>Notă <span className="subtle">(opțional)</span></>} placeholder={type === 'contribution' ? 'ex. O parte din banii de la meditații' : 'ex. Bilet de tren spre casă'} value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} />

        {isDemo && (
          <Banner tone="demo" icon={FlaskConical}>
            Conexiune demo: asta creează un transfer <strong>simulat</strong>. Nu se mișcă bani reali. Rămâne în așteptare până la următoarea sincronizare.
          </Banner>
        )}
        {!isDemo && !editing && <p className="small subtle">Adaugi bani pe care i-ai pus deja deoparte. Kept nu mută niciodată bani.</p>}
        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={18} aria-hidden /> {error}
          </div>
        )}
        <Button type="submit" variant="primary" block loading={busy}>
          {editing ? 'Salvează modificările' : type === 'contribution' ? (isDemo ? 'Pornește transferul simulat' : 'Adaugă depunerea') : 'Adaugă retragerea'}
        </Button>
      </form>
    </Sheet>
  );
}

// ---------- Plan editor ----------

export function PlanForm({
  goal,
  plan,
  onChange,
  saved = 0,
  target,
  targetDate,
}: {
  goal?: Goal;
  plan: { amount: string; frequency: Frequency; day: number | null };
  onChange: (p: { amount: string; frequency: Frequency; day: number | null }) => void;
  saved?: number;
  target: number | null;
  targetDate: string | null;
}) {
  const amount = parseLei(plan.amount);
  const pace = target && targetDate && targetDate > todayKey() ? requiredPace(saved, target, targetDate) : null;
  const finish =
    target && amount && amount > 0 && plan.frequency !== 'flexible'
      ? projectedFinish({ amount, frequency: plan.frequency, day: plan.day }, saved, target)
      : null;
  return (
    <div className="stack-lg">
      <Field label="Cât de des?">
        <Segmented
          label="Frecvență"
          value={plan.frequency}
          onChange={(f) => onChange({ ...plan, frequency: f, day: f === 'weekly' ? (plan.day !== null && plan.day <= 6 ? plan.day : 4) : f === 'monthly' ? 1 : null })}
          options={[
            { value: 'weekly', label: 'Săptămânal' },
            { value: 'monthly', label: 'Lunar' },
            { value: 'flexible', label: 'Flexibil' },
          ]}
        />
      </Field>
      <TextField
        label={plan.frequency === 'flexible' ? <>Cam cât de fiecare dată <span className="subtle">(opțional)</span></> : plan.frequency === 'weekly' ? 'Suma pe săptămână' : 'Suma pe lună'}
        inputMode="decimal"
        suffix="lei"
        placeholder={pace ? String(Math.ceil((plan.frequency === 'monthly' ? pace.perMonth : pace.perWeek) / 100)) : '50'}
        value={plan.amount}
        onChange={(e) => onChange({ ...plan, amount: e.target.value.replace(/[^\d.,]/g, '').slice(0, 10) })}
      />
      {plan.frequency === 'weekly' && (
        <Field label="Ziua preferată">
          <DayPicker value={plan.day} onChange={(d) => onChange({ ...plan, day: d })} />
        </Field>
      )}
      {plan.frequency === 'monthly' && (
        <Field label="Ziua din lună" htmlFor="dom" hint="Între 1 și 28, ca data să existe în fiecare lună.">
          <Select
            id="dom"
            label="Ziua din lună"
            hideLabel
            value={String(plan.day ?? 1)}
            onChange={(v) => onChange({ ...plan, day: Number(v) })}
            options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: ordinal(i + 1) }))}
          />
        </Field>
      )}
      {pace && (
        <div className="stack" style={{ gap: 8 }}>
          <p className="label">Ca să ajungi la {formatLei(target!)} până pe {formatDate(targetDate!)}, ai nevoie de cam</p>
          <div className="calc">
            <div>
              <strong>{formatLei(pace.perWeek)}</strong>
              <span className="small muted">pe săptămână</span>
            </div>
            <div>
              <strong>{formatLei(pace.perMonth)}</strong>
              <span className="small muted">pe lună</span>
            </div>
          </div>
        </div>
      )}
      {finish && (
        <p className="small muted">
          În ritmul ăsta ajungi {goal ? 'la țintă' : 'la ținta ta'} pe la <strong>{formatDate(finish)}</strong>
          {targetDate && finish > targetDate ? ', după data țintă. E în regulă, poți schimba oricând planul sau data.' : '.'}
        </p>
      )}
      <p className="small subtle">Estimările pornesc de la ideea că faci fiecare depunere plănuită și nu retragi nimic. Un plan e un ghid, nu o promisiune. Schimbă-l oricând se schimbă bugetul tău.</p>
    </div>
  );
}

export function PlanSheet({ open, onClose, goal, onSaved }: { open: boolean; onClose: () => void; goal: Goal; onSaved?: () => void }) {
  const data = useData();
  const { updatePlan, updateGoal } = useStore();
  const toast = useToast();
  const [plan, setPlan] = useState({ amount: '', frequency: goal.plan.frequency, day: goal.plan.day });
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setPlan({ amount: goal.plan.amount ? String(goal.plan.amount / 100).replace('.', ',') : '', frequency: goal.plan.frequency, day: goal.plan.day });
    setTargetDate(goal.targetDate ?? '');
    setError(null);
  }, [open, goal]);
  const saved = goalSaved(data.transactions, goal.id);

  function save(e: FormEvent) {
    e.preventDefault();
    const amount = plan.amount ? parseLei(plan.amount) : 0;
    if (amount === null || (plan.frequency !== 'flexible' && (!amount || amount <= 0))) {
      setError('Scrie o sumă mai mare de 0 sau alege Flexibil.');
      return;
    }
    if (targetDate && targetDate <= todayKey()) {
      setError('Alege o dată țintă din viitor sau șterge-o.');
      return;
    }
    try {
      const next: Plan = { amount, frequency: plan.frequency, day: plan.frequency === 'flexible' ? null : plan.day };
      updatePlan(goal.id, next);
      if ((goal.targetDate ?? '') !== targetDate) updateGoal(goal.id, { targetDate: targetDate || null });
      toast('Plan actualizat');
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof ActionError ? err.message : 'Nu am putut salva planul.');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Ajustează planul">
      <form className="stack-lg" onSubmit={save} noValidate>
        <PlanForm goal={goal} plan={plan} onChange={setPlan} saved={saved} target={goal.target} targetDate={targetDate || null} />
        <TextField label={<>Data țintă <span className="subtle">(opțional)</span></>} type="date" min={todayKey()} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={18} aria-hidden /> {error}
          </div>
        )}
        <Button type="submit" variant="primary" block>
          Salvează planul
        </Button>
      </form>
    </Sheet>
  );
}

// ---------- Check-in ----------

export function CheckInSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const { checkIn } = useStore();
  const toast = useToast();
  const [adjust, setAdjust] = useState(false);
  const goal = primaryGoal(data.goals);
  if (!goal) return null;
  const saved = goalSaved(data.transactions, goal.id);
  const finish = projectedFinish(goal.plan, saved, goal.target);
  return (
    <>
      <Sheet open={open && !adjust} onClose={onClose} title="Verifică-ți planul">
        <div className="stack-lg">
          <div className="card stack">
            <div className="row row--between">
              <h3 className="truncate">{goal.name}</h3>
              <span className="small muted money">{Math.round(progress(saved, goal.target) * 100)}%</span>
            </div>
            <ProgressBar value={progress(saved, goal.target)} label="Progres" />
            <dl style={{ margin: 0 }}>
              <div className="kv">
                <dt>Economisit</dt>
                <dd className="money">
                  {formatLei(saved)} din {formatLei(goal.target)}
                </dd>
              </div>
              <div className="kv">
                <dt>Plan</dt>
                <dd>{planLabel(goal.plan)}</dd>
              </div>
              {finish && (
                <div className="kv">
                  <dt>Final estimat</dt>
                  <dd>{formatDate(finish)}</dd>
                </div>
              )}
              {goal.targetDate && (
                <div className="kv">
                  <dt>Data țintă</dt>
                  <dd>{formatDate(goal.targetDate)}</dd>
                </div>
              )}
            </dl>
          </div>
          <p className="muted">Planul ăsta încă se potrivește cu bugetul tău săptămâna asta? Orice răspuns bifează ziua de azi.</p>
          <div className="stack">
            <Button
              variant="primary"
              block
              onClick={() => {
                checkIn();
                toast('Ziua de azi e bifată. Plan confirmat.');
                onClose();
              }}
            >
              Da, încă merge
            </Button>
            <Button block onClick={() => setAdjust(true)}>
              Ajustează-mi planul
            </Button>
          </div>
        </div>
      </Sheet>
      <PlanSheet
        open={open && adjust}
        goal={goal}
        onClose={() => {
          setAdjust(false);
          onClose();
        }}
        onSaved={() => checkIn()}
      />
    </>
  );
}

// ---------- Streak rules ----------

export function StreakSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const { togglePause } = useStore();
  const today = todayKey();
  const paused = data.pausedDays.includes(today);
  const doneToday = data.actions.some((a) => a.date === today);
  return (
    <Sheet open={open} onClose={onClose} title="Cum funcționează seria">
      <div className="stack-lg">
        <div className="row" style={{ gap: 'var(--s-6)' }}>
          <div className="stat">
            <span className="small muted">Actuală</span>
            <strong className="money" style={{ fontSize: 'var(--fs-xl)' }}>
              {plural(currentStreak(data), 'zi', 'zile')}
            </strong>
          </div>
          <div className="stat">
            <span className="small muted">Record</span>
            <strong className="money" style={{ fontSize: 'var(--fs-xl)' }}>
              {plural(bestStreak(data), 'zi', 'zile')}
            </strong>
          </div>
        </div>
        <StreakRules />
        <div className="card card--tint stack">
          <img className="floe-pic" src="/mascot/pose-ice-floe.webp" alt="" />
          <h3>Ai nevoie de un sloi de gheață?</h3>
          <p className="small muted">Focile se odihnesc pe sloiuri de gheață. Pune ziua de azi pe unul: Kip plutește, seria rămâne, economiile nu se schimbă.</p>
          <Button
            size="sm"
            disabled={doneToday && !paused}
            onClick={() => togglePause(today)}
            style={{ alignSelf: 'flex-start' }}
          >
            {paused ? 'Înapoi la o zi normală' : 'Pune ziua de azi pe un sloi'}
          </Button>
          {doneToday && !paused && <p className="xs subtle">Azi ai făcut deja ceva pentru economii.</p>}
        </div>
      </div>
    </Sheet>
  );
}

export function StreakRules() {
  return (
    <div className="stack">
      <ul className="check-list small">
        <li>
          <strong>O zi e completă</strong> când adaugi o depunere sau îți verifici planul. Doar să deschizi aplicația nu contează.
        </li>
        <li>
          <strong>Seria măsoară constanța, nu banii.</strong> O serie nu-ți adaugă nimic la sold, iar o zi ratată nu-ți ia nimic din economii.
        </li>
        <li>
          <strong>Ai ratat o zi?</strong> Seria o ia de la capăt de la următoarea acțiune. Recordul tău și toate economiile rămân.
        </li>
        <li>
          <strong>Sloiurile de gheață</strong> sunt zile de odihnă. Seria te așteaptă pe ele. Folosește-le în sesiune, în vacanțe sau în săptămânile cu bani puțini.
        </li>
      </ul>
      <div className="legend" aria-label="Legendă">
        <span>
          <i style={{ background: 'var(--accent)' }} /> Bifat
        </span>
        <span>
          <i style={{ border: '2px solid var(--ink)' }} /> Azi
        </span>
        <span>
          <i style={{ background: 'var(--surface-2)', border: '1.5px solid var(--line-strong)' }} /> Ratat
        </span>
        <span>
          <i style={{ background: 'var(--info-soft)', border: '1.5px solid var(--info)' }} /> Sloi de gheață
        </span>
        <span>
          <i style={{ border: '1.5px dashed var(--line-strong)' }} /> Urmează
        </span>
      </div>
    </div>
  );
}
