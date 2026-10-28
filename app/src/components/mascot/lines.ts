import type { TodayAction } from '../../data/selectors';
import { formatLei } from '../../lib/money';
import { plural } from '../../lib/ro';
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
      return { state: 'wave', text: `Salut${hi}! Hai să alegem pentru ce strângem bani. Apasă pe Obiective.` };
    case 'set-plan':
      return { state: 'think', text: `${action.goal.name} are nevoie de un plan. Îi facem unul în Obiective?` };
    case 'planned-contribution':
      return { state: 'think', text: `Psst${hi}, azi e zi de economisit. Pui ${formatLei(action.amount)} în ${action.goal.name}?` };
    case 'fix-connection':
      return { state: 'sad', text: 'Sincronizarea demo n-a mers, dar cifrele tale sunt în siguranță. Mai încercăm o dată?' };
    case 'goal-reached':
      return { state: 'celebrate', text: `Ai reușit! Obiectivul ${action.goal.name} e atins!` };
    case 'review-week':
      return { state: 'think', text: 'Săptămână nouă! Arunci o privire la cea trecută? O găsești în Activitate.' };
    case 'review-plan':
      return { state: 'think', text: `O întrebare rapidă: planul pentru ${action.goal.name} încă merge săptămâna asta?` };
    case 'done-today':
      if (late) return { state: 'sleep', text: 'Gata pe azi. Ne vedem mâine.' };
      return streak >= 3
        ? { state: 'happy', text: `${plural(streak, 'zi', 'zile')} la rând. Pas cu pas, așa se câștigă.` }
        : { state: 'happy', text: 'Ziua de azi e bifată. Restul e timp liber.' };
  }
}

/** Little extras when you tap Kip, so the mascot feels like it's listening. */
export const POKES: Line[] = [
  { state: 'happy', text: 'Hihi. Sumele mici se adună, promit.' },
  { state: 'wave', text: 'Salut din nou!' },
  { state: 'think', text: 'Pont: e ok să-ți micșorezi planul. Un plan mic pe care îl ții bate unul mare pe care îl sari.' },
  { state: 'happy', text: 'Banii tăi stau unde îi ții tu. Eu doar te ajut să ții evidența.' },
  { state: 'think', text: 'Pont: un memento săptămânal ajută mai mult decât voința.' },
];
