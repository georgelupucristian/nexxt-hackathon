// The questions behind a new goal, one per screen: what it's for, what it costs, by when, and the
// plan Kip works out from those. Used by the new-goal wizard (screens/NewGoal.tsx) and by signup
// (screens/Start.tsx), so making a goal feels the same everywhere.
import NumberFlow from '@number-flow/react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type CSSProperties } from 'react';
import { Pencil } from '@/lib/icons';
import { convertAmount, deadlineFor, GOAL_PRESETS, presetById, suggestPlan, WHEN_CHOICES, type GoalPreset, type PlanFrequency, type WhenId } from '../data/goalPlan';
import { projectedFinish } from '../data/selectors';
import type { Bani, Goal, Plan } from '../data/types';
import { addDays, addMonths, formatDate, ordinal, todayKey, WEEKDAY_NAME } from '../lib/dates';
import { GOAL_ICONS } from '../lib/goalIcons';
import { GOAL_PALETTE } from '../lib/goalLook';
import { formatLei } from '../lib/money';
import { AmountRuler } from './watermelon/amount-ruler';
import { FloatingInput } from './watermelon/floating-input';
import { SchedulePicker } from './SchedulePicker';

export interface GoalDraft {
  preset: string | null;
  name: string;
  target: Bani;
  when: WhenId;
  /** YYYY-MM-DD, only used when `when` is 'date' */
  date: string;
  frequency: PlanFrequency;
  /** an amount you set yourself on the plan screen; null means Kip's suggestion */
  custom: Bani | null;
  /** the day you picked (week: 0-6 Mon-Sun, month: 1-28); null means Kip's (today's) */
  day?: number | null;
}

export const emptyGoalDraft = (): GoalDraft => ({ preset: null, name: '', target: 1000_00, when: '6m', date: '', frequency: 'weekly', custom: null });

/** Picking a preset brings its name, price, deadline and pace. A name you typed yourself stays. */
export function pickPreset(d: GoalDraft, p: GoalPreset): GoalDraft {
  const typed = d.name.trim() !== '' && !GOAL_PRESETS.some((x) => x.name === d.name);
  return { ...d, preset: p.id, name: typed ? d.name : p.name, target: p.target, when: p.when, frequency: p.frequency, custom: null, day: null };
}

/** The plan as it stands: Kip's suggestion unless you changed the amount. */
export function draftPlan(d: GoalDraft, today = todayKey()): { plan: Plan; suggested: Bani; deadline: string | null } {
  const deadline = deadlineFor(d.when, d.date, today);
  const s = suggestPlan(d.target, deadline, d.frequency, today);
  return { plan: { ...s, amount: d.custom ?? s.amount, day: d.day ?? s.day }, suggested: s.amount, deadline };
}

/** What the store needs to create the goal. */
export function draftToGoal(d: GoalDraft): Omit<Goal, 'id' | 'createdAt' | 'status' | 'isPrimary'> {
  const p = presetById(d.preset) ?? GOAL_PRESETS[GOAL_PRESETS.length - 1];
  const { plan, deadline } = draftPlan(d);
  return { kind: p.kind, icon: p.icon, colour: p.colour, name: d.name.trim() || p.label, target: d.target, targetDate: deadline, motivation: '', plan };
}

const tileVars = (p: GoalPreset) => {
  const c = GOAL_PALETTE[p.colour];
  return { '--goal-fill': c.fill, '--goal-tint': c.tint, '--goal-deep': c.deep } as CSSProperties;
};

// ---------- 1. what for ----------

export function PresetGrid({ value, onPick }: { value: string | null; onPick: (p: GoalPreset) => void }) {
  return (
    <div className="presets" role="radiogroup" aria-label="What you're saving for">
      {GOAL_PRESETS.map((p, i) => {
        const { Icon } = GOAL_ICONS[p.icon];
        return (
          <motion.button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={value === p.id}
            className="preset"
            data-preset={p.id}
            style={tileVars(p)}
            onClick={() => onPick(p)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 * i + 0.05, type: 'spring', stiffness: 420, damping: 30 }}
            whileTap={{ scale: 0.96 }}
          >
            <span className="preset__icon" aria-hidden>
              <Icon size={26} weight="duotone" />
            </span>
            <span className="preset__label">{p.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

export function GoalNameField({ draft, onChange, onSubmit }: { draft: GoalDraft; onChange: (name: string) => void; onSubmit: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {draft.preset && (
        <motion.form
          key="name"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <FloatingInput
            label={draft.preset === 'other' ? 'What is it called?' : 'Name (you can change it)'}
            maxLength={48}
            value={draft.name}
            autoFocus={draft.preset === 'other'}
            onChange={(e) => onChange(e.target.value)}
            enterKeyHint="next"
          />
        </motion.form>
      )}
    </AnimatePresence>
  );
}

// ---------- 2. how much ----------

const QUICK_TARGETS = [500_00, 1_000_00, 2_500_00, 5_000_00];

export function CostPicker({ value, onChange }: { value: Bani; onChange: (v: Bani) => void }) {
  return (
    <div className="stack-lg">
      <AmountRuler label="How much it costs" value={value} onChange={onChange} step={10_00} min={1_00} max={100_000_00} hint="Drag, or tap the number to type the exact amount" />
      <div className="chip-row chip-row--even" role="group" aria-label="Quick amounts">
        {QUICK_TARGETS.map((v) => (
          <motion.button key={v} type="button" className="chip" aria-pressed={value === v} whileTap={{ scale: 0.92 }} onClick={() => onChange(v)}>
            {formatLei(v)}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ---------- 3. by when ----------

export function WhenPicker({ when, date, onChange }: { when: WhenId; date: string; onChange: (when: WhenId, date: string) => void }) {
  const today = todayKey();
  return (
    <div className="stack">
      <div className="whens" role="radiogroup" aria-label="By when">
        {WHEN_CHOICES.map((w, i) => {
          const end = w.months ? addMonths(today, w.months) : null;
          const sub = end ? `by ${formatDate(end)}` : w.id === 'date' ? (when === 'date' && date ? formatDate(date) : 'you pick the day') : 'save at your own pace';
          return (
            <motion.button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={when === w.id}
              className={`when when--${w.id}`}
              data-when={w.id}
              onClick={() => onChange(w.id, w.id === 'date' ? date || addMonths(today, 4) : date)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 * i + 0.05, type: 'spring', stiffness: 420, damping: 30 }}
              whileTap={{ scale: 0.96 }}
            >
              <span className="when__label">{w.label}</span>
              <span className="when__sub">{sub}</span>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence initial={false}>
        {when === 'date' && (
          <motion.div key="date" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <FloatingInput
              label="Date"
              type="date"
              min={addDays(today, 1)}
              value={date}
              onChange={(e) => onChange('date', e.target.value)}
              error={date && date <= today ? 'Pick a day in the future.' : null}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- 4. the plan ----------

/** "every Tuesday", "on the 15th of every month" */
export function planWhen(plan: Plan): string {
  if (plan.frequency === 'weekly') return `every ${WEEKDAY_NAME[plan.day ?? 0]}`;
  return `on the ${ordinal(plan.day ?? 1)} of every month`;
}

/** The one-line reason under the plan's number. */
export function planWhy(plan: Plan, target: Bani, deadline: string | null, own: boolean): { text: string; late: boolean } {
  const finish = projectedFinish(plan, 0, target);
  if (!finish) return { text: 'You save when you can.', late: false };
  const when = planWhen(plan);
  if (deadline && finish > deadline) return { text: `This gets you there around ${formatDate(finish)}, after your date. That's fine, you can change it any time.`, late: true };
  if (deadline && !own) return { text: `That's what to save ${when} to have ${formatLei(target)} by ${formatDate(deadline)}.`, late: false };
  if (deadline) return { text: `You save ${when} and have ${formatLei(target)} around ${formatDate(finish)}, on time.`, late: false };
  return { text: `No rush: you save ${when} and have ${formatLei(target)} around ${formatDate(finish)}.`, late: false };
}

export function PlanPreview({ draft, onChange }: { draft: GoalDraft; onChange: (patch: Partial<GoalDraft>) => void }) {
  const [editing, setEditing] = useState(false);
  const preset = presetById(draft.preset) ?? GOAL_PRESETS[GOAL_PRESETS.length - 1];
  const { plan, suggested, deadline } = draftPlan(draft);
  const own = draft.custom !== null && draft.custom !== suggested;
  const why = planWhy(plan, draft.target, deadline, own);
  const weekly = plan.frequency === 'weekly';
  const { Icon } = GOAL_ICONS[preset.icon];

  return (
    <section className="planpv" aria-label="Your plan">
      <div className="planpv__goal" style={tileVars(preset)}>
        <span className="planpv__tile" aria-hidden>
          <Icon size={24} weight="duotone" />
        </span>
        <span className="planpv__goaltext">
          <strong className="truncate">{draft.name.trim() || preset.label}</strong>
          <span>
            {formatLei(draft.target)} · {deadline ? `by ${formatDate(deadline)}` : 'no rush'}
          </span>
        </span>
      </div>

      {editing ? (
        <div className="planpv__editor">
          <SchedulePicker
            frequency={draft.frequency}
            day={plan.day ?? 0}
            onChange={(f, day) => onChange({ frequency: f, day, custom: f === draft.frequency || draft.custom === null ? draft.custom : convertAmount(draft.custom, draft.frequency, f) })}
          />
          <AmountRuler
            label={weekly ? 'How much each week' : 'How much each month'}
            value={plan.amount}
            onChange={(v) => onChange({ custom: v })}
            step={1_00}
            min={1_00}
            max={Math.max(weekly ? 1_500_00 : 5_000_00, suggested * 2)}
          />
        </div>
      ) : (
        <p className="planpv__big">
          <NumberFlow value={plan.amount / 100} locales="en-GB" format={{ maximumFractionDigits: 0 }} className="planpv__num" />
          <span className="planpv__unit">lei {weekly ? 'a week' : 'a month'}</span>
        </p>
      )}

      <p className={`planpv__why ${why.late ? 'planpv__why--late' : ''}`} aria-live="polite">
        {why.text}
      </p>

      <div className="planpv__actions">
        <button type="button" className="planpv__edit" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
          {editing ? (
            'Done'
          ) : (
            <>
              <Pencil size={16} aria-hidden /> Change amount or day
            </>
          )}
        </button>
        {editing && own && (
          <button type="button" className="planpv__reset" onClick={() => onChange({ custom: null })}>
            Use the suggested amount ({formatLei(suggested)})
          </button>
        )}
      </div>
    </section>
  );
}
