import type { TodayAction } from '../../data/selectors';
import { formatLei } from '../../lib/money';
import { plural } from '../../lib/plural';
import type { SealState } from './Seal';

export interface Line {
  state: SealState;
  text: string;
}

/**
 * What Kip says on the hub. It follows the same "what matters today" logic as the Today card,
 * so the mascot never contradicts the app. Tone: calm and encouraging, never guilt.
 */
export function hubLine(action: TodayAction, name: string, streak: number, hour = new Date().getHours()): Line {
  const late = hour >= 22 || hour < 5;
  const hi = name ? `, ${name}` : '';
  switch (action.kind) {
    case 'create-goal':
      return { state: 'wave', text: `Hi${hi}! Let's pick something to save for. Tap Goals.` };
    case 'set-plan':
      return { state: 'think', text: `${action.goal.name} needs a plan. Shall we make one in Goals?` };
    case 'planned-contribution':
      return { state: 'think', text: `Psst${hi}, today is a saving day. Put ${formatLei(action.amount)} into ${action.goal.name}?` };
    case 'fix-connection':
      return { state: 'sad', text: 'The demo sync didn\'t work, but your numbers are safe. Try again?' };
    case 'goal-reached':
      return { state: 'celebrate', text: `You did it. ${action.goal.name} is reached!` };
    case 'review-week':
      return { state: 'think', text: 'New week. Want a look at the last one? It\'s in Activity.' };
    case 'review-plan':
      return { state: 'think', text: `Quick question: is the plan for ${action.goal.name} still working this week?` };
    case 'done-today':
      if (late) return { state: 'sleep', text: 'All done for today. See you tomorrow.' };
      return streak >= 3
        ? { state: 'happy', text: `${plural(streak, 'day', 'days')} in a row. Step by step, that\'s how it\'s done.` }
        : { state: 'happy', text: 'You saved today. The rest is free time.' };
  }
}

/** Little extras when you tap Kip, so the mascot feels like it's listening. */
export const POKES: Line[] = [
  { state: 'happy', text: 'Hehe. Small amounts add up, I promise.' },
  { state: 'wave', text: 'Hi again!' },
  { state: 'think', text: 'Tip: it\'s fine to shrink your plan. A small plan you keep beats a big one you skip.' },
  { state: 'happy', text: 'Your money stays where you keep it. I just help you keep track.' },
  { state: 'think', text: 'Tip: a weekly reminder helps more than willpower.' },
];
