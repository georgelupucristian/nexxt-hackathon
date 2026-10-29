// How often and which day the money moves: "Every week" on a weekday, or "Every month" on a day
// from 1 to 28. Used by the plan sheet, the new-goal plan step and the start sheet, so the same
// day is picked (and shown) everywhere.
import { Minus, Plus } from '@/lib/icons';
import { WEEKDAY_NAME } from '../lib/dates';
import { FluidTabs } from './watermelon/fluid-tabs';

type Fixed = 'weekly' | 'monthly';
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const QUICK_DAYS = [1, 5, 10, 15, 20, 25];

/** `dayOnly`: the caller shows its own how-often tabs (the plan sheet's, with "When I can"). */
export function SchedulePicker({ frequency, day, onChange, dayOnly }: { frequency: Fixed; day: number; onChange: (frequency: Fixed, day: number) => void; dayOnly?: boolean }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {!dayOnly && <FluidTabs
        label="How often"
        value={frequency}
        onChange={(f) => onChange(f, f === frequency ? day : f === 'weekly' ? 0 : 1)}
        tabs={[
          { id: 'weekly', label: 'Every week' },
          { id: 'monthly', label: 'Every month' },
        ]}
      />}
      {frequency === 'weekly' ? (
        <div className="chip-row chip-row--even" role="radiogroup" aria-label="Which day of the week">
          {LETTERS.map((l, i) => (
            <button key={i} type="button" role="radio" aria-checked={day === i} aria-label={WEEKDAY_NAME[i]} className="chip" onClick={() => onChange('weekly', i)}>
              {l}
            </button>
          ))}
        </div>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <div className="chip-row chip-row--even" role="radiogroup" aria-label="Which day of the month">
            {QUICK_DAYS.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={day === d} className="chip" onClick={() => onChange('monthly', d)}>
                {d}
              </button>
            ))}
          </div>
          <div className="money__payday">
            <span>
              <b>Day of the month</b>
              <small>1 to 28, so every month has it</small>
            </span>
            <div className="money__stepper">
              <button type="button" aria-label="Day before" disabled={day <= 1} onClick={() => onChange('monthly', Math.max(1, day - 1))}>
                <Minus size={16} aria-hidden />
              </button>
              <output aria-live="polite">{day}</output>
              <button type="button" aria-label="Day after" disabled={day >= 28} onClick={() => onChange('monthly', Math.min(28, day + 1))}>
                <Plus size={16} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
