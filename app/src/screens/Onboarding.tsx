import { ArrowLeft, Bell, BellOff, CheckCircle2, Eye, FlaskConical, Lock, PenLine, Unplug } from '@/lib/icons';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { planLabel } from '../components/domain';
import { PlanForm } from '../components/sheets';
import { Banner, Button, DayPicker, Field, GOAL_ICON, IconButton, Switch, TextField } from '../components/ui';
import { useData, useStore } from '../data/store';
import type { GoalKind, OnboardingDraft } from '../data/types';
import { formatDate, todayKey, WEEKDAY_NAME } from '../lib/dates';
import { formatLei, MAX_AMOUNT, parseLei } from '../lib/money';

const KINDS: { kind: GoalKind; title: string; desc: string; name: string }[] = [
  { kind: 'emergency', title: 'Fond de urgență', desc: 'O rezervă pentru neprevăzute', name: 'Fond de urgență' },
  { kind: 'tech', title: 'Laptop sau gadgeturi', desc: 'Laptop nou, telefon, accesorii', name: 'Laptop nou' },
  { kind: 'travel', title: 'Călătorie sau Erasmus', desc: 'Mobilități, excursii, zboruri', name: 'Semestru Erasmus' },
  { kind: 'custom', title: 'Altceva', desc: 'Pune-i tu un nume', name: '' },
];

const STEPS = ['Obiectiv', 'Plan', 'Evidență', 'Memento', 'Verificare'];

export function Onboarding() {
  const data = useData();
  const { saveDraft, finishOnboarding, signOut } = useStore();
  const nav = useNavigate();
  const { step, draft } = data.onboarding;
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (patch: Partial<OnboardingDraft>) => saveDraft(patch);
  const go = (s: number) => {
    setErrors({});
    saveDraft({}, s);
    window.scrollTo(0, 0);
  };

  const target = parseLei(draft.target);
  const planAmount = draft.planAmount ? parseLei(draft.planAmount) : 0;

  function validate(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!draft.kind) e.kind = 'Alege pentru ce strângi bani.';
      if (!draft.name.trim()) e.name = 'Dă-i un nume obiectivului.';
      if (target === null || target <= 0) e.target = 'Scrie o sumă țintă, de exemplu 3000.';
      else if (target > MAX_AMOUNT) e.target = 'Suma asta pare prea mare.';
      if (draft.targetDate && draft.targetDate <= todayKey()) e.targetDate = 'Alege o dată din viitor sau lasă câmpul gol.';
    }
    if (s === 1) {
      if (planAmount === null) e.plan = 'Scrie o sumă validă, de exemplu 50.';
      else if (draft.frequency !== 'flexible' && planAmount <= 0) e.plan = 'Scrie cât vrei să pui deoparte sau alege Flexibil.';
    }
    if (s === 2 && !draft.tracking) e.tracking = 'Alege cum vrei să ții evidența economiilor.';
    return e;
  }

  function next() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    if (step < 4) go(step + 1);
    else finish();
  }

  function finish() {
    for (let s = 0; s < 4; s++) {
      const e = validate(s);
      if (Object.keys(e).length) {
        setErrors(e);
        go(s);
        return;
      }
    }
    finishOnboarding(
      {
        kind: draft.kind!,
        name: draft.name.trim(),
        target: target!,
        targetDate: draft.targetDate || null,
        motivation: draft.motivation.trim(),
        plan: { amount: planAmount ?? 0, frequency: draft.frequency, day: draft.frequency === 'flexible' ? null : draft.day },
      },
      { tracking: draft.tracking!, reminder: draft.reminder },
    );
    nav('/home', { replace: true });
  }

  return (
    <div className="screen screen--bare" style={{ minHeight: '100dvh' }}>
      <header className="topbar" style={{ gridTemplateColumns: 'var(--touch) 1fr auto' }}>
        <div>{step > 0 && <IconButton label="Pasul anterior" icon={ArrowLeft} onClick={() => go(step - 1)} />}</div>
        <div className="ob-progress" role="progressbar" aria-label="Progresul configurării" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step + 1} aria-valuetext={`Pasul ${step + 1} din 5: ${STEPS[step]}`}>
          {STEPS.map((s, i) => (
            <span key={s} data-on={i <= step} />
          ))}
        </div>
        <button
          type="button"
          className="link-btn"
          style={{ marginLeft: 'var(--s-3)' }}
          onClick={() => {
            signOut();
            nav('/welcome');
          }}
        >
          Salvează și ieși
        </button>
      </header>

      {step === 0 && <GoalStep draft={draft} set={set} errors={errors} />}
      {step === 1 && (
        <section className="stack-lg">
          <StepTitle n={2} title="Fă-ți un plan pe măsură" sub="Alege o sumă pe care o poți duce. Poți s-o micșorezi, s-o pui pe pauză sau s-o schimbi oricând." />
          <PlanForm
            plan={{ amount: draft.planAmount, frequency: draft.frequency, day: draft.day }}
            onChange={(p) => set({ planAmount: p.amount, frequency: p.frequency, day: p.day })}
            target={target}
            targetDate={draft.targetDate || null}
          />
          {errors.plan && <p className="field-error" role="alert">{errors.plan}</p>}
        </section>
      )}
      {step === 2 && <TrackingStep draft={draft} set={set} error={errors.tracking} />}
      {step === 3 && <ReminderStep draft={draft} set={set} />}
      {step === 4 && <ReviewStep draft={draft} go={go} />}

      <div className="ob-footer">
        <Button variant="primary" block onClick={next}>
          {step === 4 ? 'Termină configurarea' : 'Continuă'}
        </Button>
        {step === 3 && (
          <Button
            variant="ghost"
            block
            onClick={() => {
              set({ reminder: { ...draft.reminder, enabled: false } });
              go(4);
            }}
          >
            Sari peste memento
          </Button>
        )}
        {step === 4 && <p className="small subtle" style={{ textAlign: 'center' }}>Nu trebuie să adaugi bani ca să termini.</p>}
      </div>
    </div>
  );
}

function StepTitle({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="stack" style={{ gap: 6, paddingTop: 'var(--s-2)' }}>
      <p className="small subtle strong">Pasul {n} din 5</p>
      <h1>{title}</h1>
      <p className="muted">{sub}</p>
    </div>
  );
}

function GoalStep({ draft, set, errors }: { draft: OnboardingDraft; set: (p: Partial<OnboardingDraft>) => void; errors: Record<string, string> }) {
  return (
    <section className="stack-lg">
      <StepTitle n={1} title="Pentru ce strângi bani?" sub="Începe cu un obiectiv. Poți adăuga altele mai târziu." />
      <div className="options options--2" role="radiogroup" aria-label="Tipul obiectivului">
        {KINDS.map((k) => {
          const Icon = GOAL_ICON[k.kind];
          return (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={draft.kind === k.kind}
              className="option"
              onClick={() => {
                const wasDefault = !draft.name || KINDS.some((x) => x.name === draft.name);
                set({ kind: k.kind, name: wasDefault ? k.name : draft.name });
              }}
            >
              <span className="option__icon" aria-hidden>
                <Icon size={22} />
              </span>
              <span>
                <span className="option__title" style={{ display: 'block' }}>
                  {k.title}
                </span>
                <span className="option__desc">{k.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
      {errors.kind && <p className="field-error" role="alert">{errors.kind}</p>}
      {draft.kind && (
        <div className="stack-lg">
          <TextField label="Numele obiectivului" value={draft.name} maxLength={48} error={errors.name} placeholder="ex. Bilete la concert" onChange={(e) => set({ name: e.target.value })} />
          <TextField
            label="Suma țintă"
            inputMode="decimal"
            suffix="lei"
            placeholder="3000"
            value={draft.target}
            error={errors.target}
            onChange={(e) => set({ target: e.target.value.replace(/[^\d.,]/g, '').slice(0, 12) })}
          />
          <TextField
            label={<>Data țintă <span className="subtle">(opțional)</span></>}
            type="date"
            min={todayKey()}
            value={draft.targetDate}
            error={errors.targetDate}
            hint="Lasă gol dacă nu ai un termen."
            onChange={(e) => set({ targetDate: e.target.value })}
          />
          <Field label={<>De ce contează pentru tine <span className="subtle">(opțional)</span></>} htmlFor="motivation" hint="Îți arătăm asta pe obiectiv, ca să-ți amintești de ce o faci.">
            <textarea id="motivation" className="textarea" maxLength={120} value={draft.motivation} onChange={(e) => set({ motivation: e.target.value })} placeholder="ex. Ca să pot studia în străinătate fără grija chiriei" />
          </Field>
        </div>
      )}
    </section>
  );
}

function TrackingStep({ draft, set, error }: { draft: OnboardingDraft; set: (p: Partial<OnboardingDraft>) => void; error?: string }) {
  return (
    <section className="stack-lg">
      <StepTitle n={3} title="Cum ții evidența economiilor?" sub="Kept nu păstrează și nu mută bani. Doar ține evidența a ce pui deoparte." />
      <div className="options" role="radiogroup" aria-label="Metoda de evidență">
        <button type="button" role="radio" aria-checked={draft.tracking === 'manual'} className="option option--row" onClick={() => set({ tracking: 'manual' })}>
          <span className="option__icon" aria-hidden>
            <PenLine size={22} />
          </span>
          <span className="grow">
            <span className="option__title" style={{ display: 'block' }}>
              Evidență manuală <span className="pill pill--success" style={{ marginLeft: 4 }}>Recomandat</span>
            </span>
            <span className="option__desc">Notezi fiecare sumă pe care o pui deoparte: în orice cont, într-un borcan, oriunde.</span>
          </span>
        </button>
        <button type="button" role="radio" aria-checked={draft.tracking === 'demo'} className="option option--row" onClick={() => set({ tracking: 'demo' })}>
          <span className="option__icon" aria-hidden style={{ background: 'var(--demo-soft)', color: 'var(--demo)' }}>
            <FlaskConical size={22} />
          </span>
          <span className="grow">
            <span className="option__title" style={{ display: 'block' }}>
              Încearcă o conexiune demo
            </span>
            <span className="option__desc">Vezi cum s-ar comporta un cont conectat, cu transferuri și sincronizări simulate.</span>
          </span>
        </button>
        <div className="option option--row" aria-disabled="true" style={{ opacity: 0.55, cursor: 'not-allowed' }}>
          <span className="option__icon" aria-hidden>
            <Unplug size={22} />
          </span>
          <span className="grow">
            <span className="option__title" style={{ display: 'block' }}>
              Conectează o bancă reală
            </span>
            <span className="option__desc">Nu e disponibil în versiunea asta.</span>
          </span>
        </div>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {draft.tracking === 'demo' && (
        <div className="card stack-lg">
          <h2>Ce face conexiunea demo</h2>
          <ul className="check-list small">
            <li>
              <FlaskConical size={18} aria-hidden color="var(--demo)" />
              <span>
                <strong>Totul e simulat.</strong> „Banca Demo” nu există și nu contactăm nicio bancă.
              </span>
            </li>
            <li>
              <Eye size={18} aria-hidden />
              <span>
                <strong>Merge ca un cont doar de citire.</strong> Transferurile pe care le pornești apar „În așteptare”, apoi se confirmă la următoarea sincronizare simulată.
              </span>
            </li>
            <li>
              <Lock size={18} aria-hidden />
              <span>
                <strong>Nu se mută bani reali</strong>, niciodată. Fiecare înregistrare simulată e marcată clar, ca să nu fie confundată cu economii reale.
              </span>
            </li>
          </ul>
          <p className="small subtle">Poți trece oricând la evidența manuală din Profil.</p>
        </div>
      )}
    </section>
  );
}

function ReminderStep({ draft, set }: { draft: OnboardingDraft; set: (p: Partial<OnboardingDraft>) => void }) {
  const r = draft.reminder;
  return (
    <section className="stack-lg">
      <StepTitle n={4} title="Vrei un mic imbold?" sub="Un memento pe săptămână, în ziua care ți se potrivește. Îl poți schimba sau opri mai târziu." />
      <div className="card row row--between">
        <div className="row">
          {r.enabled ? <Bell size={20} aria-hidden /> : <BellOff size={20} aria-hidden />}
          <span className="strong">Memento săptămânal</span>
        </div>
        <Switch checked={r.enabled} onChange={(v) => set({ reminder: { ...r, enabled: v } })} label="Memento săptămânal" />
      </div>
      {r.enabled && (
        <>
          <Field label="Ziua">
            <DayPicker value={r.day} onChange={(d) => set({ reminder: { ...r, day: d } })} />
          </Field>
          <TextField label="Ora" type="time" value={r.time} onChange={(e) => set({ reminder: { ...r, time: e.target.value || '19:00' } })} />
          <Banner tone="neutral" icon={Bell}>
            Mementourile apar în Kept când îl deschizi la ora aleasă sau după. Versiunea asta nu trimite notificări push.
          </Banner>
        </>
      )}
    </section>
  );
}

function ReviewStep({ draft, go }: { draft: OnboardingDraft; go: (s: number) => void }) {
  const target = parseLei(draft.target) ?? 0;
  const amount = draft.planAmount ? parseLei(draft.planAmount) ?? 0 : 0;
  // `edit` is the button's accessible name: Romanian needs the articled noun ("obiectivul"), not label.toLowerCase()
  const rows: { label: string; edit: string; value: string; step: number }[] = [
    { label: 'Obiectiv', edit: 'Editează obiectivul', value: draft.name, step: 0 },
    { label: 'Țintă', edit: 'Editează ținta', value: `${formatLei(target)}${draft.targetDate ? ` până la ${formatDate(draft.targetDate)}` : ''}`, step: 0 },
    { label: 'Plan', edit: 'Editează planul', value: planLabel({ amount, frequency: draft.frequency, day: draft.day }), step: 1 },
    { label: 'Evidență', edit: 'Editează evidența', value: draft.tracking === 'demo' ? 'Conexiune demo (simulată)' : 'Evidență manuală', step: 2 },
    {
      label: 'Memento',
      edit: 'Editează mementoul',
      value: draft.reminder.enabled ? `În fiecare ${WEEKDAY_NAME[draft.reminder.day].toLowerCase()}, la ${draft.reminder.time}` : 'Oprit',
      step: 3,
    },
  ];
  return (
    <section className="stack-lg">
      <StepTitle n={5} title="Gata de start" sub="Verifică dacă totul arată bine. Apasă Editează ca să schimbi un pas." />
      <div className="card card--flush">
        <ul className="list">
          {rows.map((r) => (
            <li key={r.label} className="list-row" style={{ minHeight: 64 }}>
              <span className="list-row__body">
                <span className="small subtle">{r.label}</span>
                <span className="strong clamp-2">{r.value}</span>
              </span>
              <button type="button" className="link-btn" onClick={() => go(r.step)} aria-label={r.edit}>
                Editează
              </button>
            </li>
          ))}
        </ul>
      </div>
      {draft.motivation && (
        <p className="muted" style={{ fontStyle: 'italic' }}>
          „{draft.motivation}”
        </p>
      )}
      <div className="row small muted">
        <CheckCircle2 size={18} aria-hidden color="var(--accent)" />
        Progresul tău e salvat. Poți închide aplicația și continua mai târziu.
      </div>
    </section>
  );
}
