import type { TodayAction } from '../../data/selectors';
import { formatLei } from '../../lib/money';
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
  switch (action.kind) {
    case 'create-goal':
      return { state: 'wave', text: `Hi ${name}! Let’s pick something to save for. Tap Goals.` };
    case 'set-plan':
      return { state: 'think', text: `${action.goal.name} needs a plan. Want to set one in Goals?` };
    case 'planned-contribution':
      return { state: 'point', text: `Today’s plan: ${formatLei(action.amount)} for ${action.goal.name}. Tap + once it’s set aside.` };
    case 'fix-connection':
      return { state: 'sad', text: 'The demo sync didn’t go through. Your numbers are safe. Retry from Today.' };
    case 'goal-reached':
      return { state: 'celebrate', text: `You did it, ${action.goal.name} is fully saved!` };
    case 'review-week':
      return { state: 'think', text: 'New week! Want to look back at the last one? It’s in Today.' };
    case 'review-plan':
      return { state: 'think', text: `Quick check: does the plan for ${action.goal.name} still fit this week?` };
    case 'done-today':
      if (late) return { state: 'sleep', text: 'All done for today. See you tomorrow.' };
      return streak >= 3
        ? { state: 'happy', text: `${streak} days in a row. Steady wins this.` }
        : { state: 'happy', text: 'That’s today done. Nothing else needed.' };
  }
}

/** Little extras when you tap Kip, so the mascot feels like it's listening. */
export const POKES: Line[] = [
  { state: 'happy', text: 'Hehe. Small amounts add up, I promise.' },
  { state: 'wave', text: 'Hi again!' },
  { state: 'think', text: 'Tip: lowering your plan is fine. A plan you keep beats a big one you skip.' },
  { state: 'happy', text: 'Your money stays where you keep it. I just help you track it.' },
  { state: 'think', text: 'Tip: a weekly reminder helps more than willpower.' },
];
