import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useStore } from '../../data/store';
import type { SealState } from '../mascot/Seal';

/**
 * A five-stop tour of home, told by Kip. It runs once per account, the first time home has
 * something to point at, and can be replayed from the header. Each stop dims the page around
 * one element and Kip explains it in a sentence. Skippable at any point.
 */
interface Stop {
  target: string;
  mood: SealState;
  title: string;
  text: string;
}

const STOPS: Stop[] = [
  { target: '[data-tour="streak"]', mood: 'happy', title: 'Streak-ul tău', text: 'O zi contează când economisești sau doar bifezi ziua. Apasă cercul o dată pe zi și ține focul aprins.' },
  { target: '[data-tour="vault"]', mood: 'wave', title: 'Obiectivul principal', text: 'Aici vezi cât ai strâns pentru el și cât ar trebui să pui pe zi ca să ajungi la timp. Eu mă bucur pe măsură ce te apropii.' },
  { target: '[data-tour="goal"]', mood: 'point', title: 'Drumul până la țintă', text: 'Asteroidul zboară spre steag cu fiecare leu pus deoparte. Procentul de deasupra îți spune cât ai făcut.' },
  { target: '[data-tour="sleep"]', mood: 'sleep', title: 'Dorm pe idee', text: 'Vrei ceva ce nu era în plan? Spune-mi. Dorm pe idee 48 de ore, apoi te întreb dacă încă îl vrei.' },
  { target: '.dial__kip', mood: 'celebrate', title: 'Eu sunt Kip', text: 'Apasă-mă oricând ca să schimbi secțiunea: Acasă, Obiective, Activitate sau Profil.' },
];

const keyFor = (id: string) => `kept.tour.v1.${id}`;
export const TOUR_EVENT = 'kept:tour';

type Box = { top: number; left: number; width: number; height: number };

export function Tour() {
  const { account } = useStore();
  const [step, setStep] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  // start once per account, as soon as home has the elements the tour points at
  useEffect(() => {
    if (!account) return;
    let seen = false;
    try {
      seen = localStorage.getItem(keyFor(account.id)) === 'done';
    } catch {
      /* no storage: show it, it's skippable */
    }
    const replay = () => setStep(0);
    window.addEventListener(TOUR_EVENT, replay);
    let t = 0;
    if (!seen) {
      t = window.setTimeout(() => {
        if (document.querySelector(STOPS[0].target)) setStep(0);
      }, 1200);
    }
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(TOUR_EVENT, replay);
    };
  }, [account]);

  const finish = useCallback(() => {
    setStep(null);
    setBox(null);
    try {
      if (account) localStorage.setItem(keyFor(account.id), 'done');
    } catch {
      /* ignore */
    }
  }, [account]);

  const measure = useCallback(() => {
    if (step === null) return;
    const el = document.querySelector(STOPS[step].target);
    if (!el) return setBox(null);
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
  }, [step]);

  useLayoutEffect(() => {
    if (step === null) return;
    const el = document.querySelector(STOPS[step].target);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = window.setTimeout(measure, 380);
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step, measure]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight' || e.key === 'Enter') setStep((s) => (s === null ? s : s + 1 < STOPS.length ? s + 1 : (finish(), null)));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step, finish]);

  if (step === null) return null;
  const stop = STOPS[step];
  const last = step === STOPS.length - 1;
  // the card goes wherever there's more room: under the highlight or above it
  const below = !box || box.top + box.height / 2 < window.innerHeight / 2;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={`Tur: ${stop.title}`}>
      <AnimatePresence>
        {box && (
          <motion.div
            className="tour__hole"
            initial={false}
            animate={{ top: box.top, left: box.left, width: box.width, height: box.height }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="tour__card"
          style={below ? { top: (box ? box.top + box.height : 80) + 14 } : { bottom: window.innerHeight - (box?.top ?? 0) + 14 }}
          initial={{ opacity: 0, y: below ? -8 : 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          <img className="tour__kip" src={`/mascot/${stop.mood}-face.webp`} alt="" />
          <div className="tour__body">
            <p className="tour__title">{stop.title}</p>
            <p className="tour__text">{stop.text}</p>
            <div className="tour__foot">
              <span className="tour__dots" aria-label={`Pasul ${step + 1} din ${STOPS.length}`}>
                {STOPS.map((_, i) => (
                  <i key={i} data-on={i === step || undefined} />
                ))}
              </span>
              {!last && (
                <button type="button" className="tour__skip" onClick={finish}>
                  Sari peste
                </button>
              )}
              <button type="button" className="btn btn--primary btn--sm" onClick={() => (last ? finish() : setStep(step + 1))} autoFocus>
                {last ? 'Am înțeles' : 'Mai departe'}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
