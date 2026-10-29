import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Users, X } from '@/lib/icons';
import { CostPicker, draftPlan, draftToGoal, emptyGoalDraft, GoalNameField, pickPreset, PlanPreview, PresetGrid, WhenPicker, type GoalDraft } from '../components/GoalSteps';
import { MascotSays } from '../components/mascot/MascotSays';
import { Seal, type SealState } from '../components/mascot/Seal';
import { presetById } from '../data/goalPlan';
import { ActionError, useStore } from '../data/store';
import type { Goal } from '../data/types';
import { formatLei } from '../lib/money';
import { Avatar } from '../components/social/parts';
import { useSocial } from '../components/social/SocialProvider';
import { addDays, todayKey } from '../lib/dates';
import { firstNameOf, RuleError } from '../lib/social/rules';

// A new goal, Duolingo-style like signup: one question per screen, Kip asking, big choices, and
// the plan worked out for you at the end. Answers survive a refresh (sessionStorage) for half an
// hour; leaving with the close button forgets them.
//
// The first question is "Just me" or "With friends". With friends adds one step that picks up to 4
// accepted friends, then the same name, cost and date; the goal is made and the invites go out. A
// shared goal has no saving plan of its own: each deposit is extra money, made on the goal's page.

type StepId = 'who' | 'friends' | 'what' | 'cost' | 'when' | 'plan';
const SOLO: StepId[] = ['who', 'what', 'cost', 'when', 'plan'];
const TOGETHER: StepId[] = ['who', 'friends', 'what', 'cost', 'when'];
const MAX_FRIENDS = 4;

const KEY = 'kept.newgoal';
const FRESH_FOR = 30 * 60 * 1000;

interface Saved {
  step: number;
  draft: GoalDraft;
  at: number;
  together?: boolean;
  friends?: string[];
}

function load(): Saved {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Saved | null;
    if (raw && Date.now() - raw.at < FRESH_FOR) return { ...raw, step: Math.min(Math.max(0, raw.step), SOLO.length - 1), draft: { ...emptyGoalDraft(), ...raw.draft }, at: raw.at };
  } catch {
    /* unreadable: start over */
  }
  return { step: 0, draft: emptyGoalDraft(), at: Date.now() };
}

export function NewGoal() {
  const { createGoal } = useStore();
  const nav = useNavigate();
  const location = useLocation();
  const [s, setS] = useState<Saved>(load);
  const [dir, setDir] = useState(1);
  const [made, setMade] = useState<Goal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const social = useSocial();
  const STEPS = s.together ? TOGETHER : SOLO;
  const picked = s.friends ?? [];
  const myFriends = social
    ? social.world.friendships.map((f) => (f.a === social.viewer ? f.b : f.b === social.viewer ? f.a : null)).filter((u): u is string => !!u && !!social.world.users[u])
    : [];

  useEffect(() => {
    if (made) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ ...s, at: Date.now() }));
    } catch {
      /* private mode: nothing to keep */
    }
  }, [s, made]);

  const d = s.draft;
  const id = STEPS[s.step];
  const set = (patch: Partial<GoalDraft>) => setS((x) => ({ ...x, draft: { ...x.draft, ...patch } }));
  const go = (to: number) => {
    setDir(to > s.step ? 1 : -1);
    setError(null);
    setS((x) => ({ ...x, step: to }));
  };
  const forget = () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* nothing to forget */
    }
  };
  // back to wherever you came from (Goals or home); straight to Goals if this was opened directly
  const exit = () => {
    forget();
    if (location.key !== 'default') nav(-1);
    else nav('/goals', { replace: true });
  };
  const back = () => (s.step === 0 ? exit() : go(s.step - 1));

  const preset = presetById(d.preset);
  const name = d.name.trim() || preset?.label || 'your goal';
  const { plan, deadline } = draftPlan(d);

  let say: { state: SealState; text: string };
  let canGo = true;
  let cta = 'Continue';
  switch (id) {
    case 'who':
      say = { state: 'wave', text: 'Who is this goal for?' };
      canGo = s.together !== undefined;
      break;
    case 'friends':
      say = { state: 'happy', text: `Who's saving with you? Pick up to ${MAX_FRIENDS} friends.` };
      canGo = picked.length > 0;
      break;
    case 'what':
      say = { state: preset ? 'happy' : 'wave', text: 'What are you saving for?' };
      canGo = !!preset && d.name.trim().length > 0;
      break;
    case 'cost':
      say = { state: 'think', text: `How much does ${name} cost?` };
      canGo = d.target > 0;
      break;
    case 'when':
      say = { state: 'point', text: 'When do you want to have the money?' };
      canGo = d.when !== 'date' || deadline !== null;
      if (s.together) cta = busy ? 'Creating...' : 'Create and invite';
      break;
    case 'plan':
      say = { state: 'happy', text: "Here's your plan. I did the maths, you just say yes." };
      canGo = plan.amount > 0;
      cta = 'Create goal';
      break;
  }

  async function createTogether() {
    if (!social || busy) return;
    setBusy(true);
    try {
      const icon = presetById(d.preset)?.icon ?? 'star';
      const g = await social.repo.createSharedGoal({ name, photo: null, icon, target: d.target, date: deadline ?? addDays(todayKey(), 180) }, picked);
      forget();
      nav(`/shared-goal/${g.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof RuleError ? err.message : "We couldn't create the goal. Try once more.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!canGo) return;
    if (s.together && id === 'when') return void createTogether();
    if (id !== 'plan') return go(s.step + 1);
    try {
      const g = createGoal(draftToGoal(d));
      forget();
      setMade(g);
    } catch (err) {
      setError(err instanceof ActionError ? err.message : "We couldn't create the goal. Try once more.");
    }
  }

  if (made) return <Made goal={made} onGo={() => nav(`/goals/${made.id}`, { replace: true })} />;

  return (
    <div className="start start--wizard">
      <header className="start__bar start__bar--close">
        <button type="button" className="icon-btn" onClick={back} aria-label={s.step === 0 ? 'Back' : 'Previous question'}>
          <ArrowLeft size={22} aria-hidden />
        </button>
        <div className="start__progress" role="progressbar" aria-label="New goal" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={s.step + 1}>
          <motion.span animate={{ width: `${((s.step + 1) / STEPS.length) * 100}%` }} transition={{ type: 'spring', stiffness: 200, damping: 26 }} />
        </div>
        <button type="button" className="icon-btn" onClick={exit} aria-label="Cancel the new goal">
          <X size={22} aria-hidden />
        </button>
      </header>
      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.main
          key={id}
          className="start__step"
          data-step={id}
          custom={dir}
          variants={{
            enter: (k: number) => ({ opacity: 0, x: 40 * k }),
            center: { opacity: 1, x: 0 },
            exit: (k: number) => ({ opacity: 0, x: -40 * k }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
        >
          <h1 className="sr-only">
            New goal, step {s.step + 1} of {STEPS.length}
          </h1>
          <MascotSays state={say.state} message={say.text} size={92} layout="row" appear="none" />

          {id === 'who' && (
            <div className="stack">
              {[
                { together: false, label: 'Just me', sub: 'Your own goal, with a saving plan.' },
                { together: true, label: 'With friends', sub: 'Save together. Everyone puts in extra money for it, and keeps it.' },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className={`card card--interactive who-choice ${s.together === o.together ? 'card--tint' : ''}`}
                  aria-pressed={s.together === o.together}
                  disabled={o.together && !social}
                  onClick={() => setS((x) => ({ ...x, together: o.together }))}
                >
                  <span className="who-choice__icon" aria-hidden>
                    {o.together ? <Users size={24} /> : <User size={24} />}
                  </span>
                  <span className="who-choice__text">
                    <strong>{o.label}</strong>
                    <span className="small muted">{o.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {id === 'friends' && social && (
            <div className="stack">
              {myFriends.length === 0 ? (
                <p className="muted">Add a friend first. Shared goals are for friends who accepted your request.</p>
              ) : (
                <ul className="soc-list soc-card">
                  {myFriends.map((u) => {
                    const on = picked.includes(u);
                    const full = !on && picked.length >= MAX_FRIENDS;
                    return (
                      <li key={u}>
                        <label className="soc-row" style={{ cursor: full ? 'not-allowed' : 'pointer', opacity: full ? 0.5 : 1 }}>
                          <Avatar user={social.world.users[u]} />
                          <span className="soc-row__body">
                            <span className="soc-row__name">{social.world.users[u].name}</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={full}
                            aria-label={`Save with ${firstNameOf(social.world.users[u].name)}`}
                            onChange={() => setS((x) => ({ ...x, friends: on ? picked.filter((p) => p !== u) : [...picked, u] }))}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {id === 'what' && (
            <div className="stack-lg">
              <PresetGrid value={d.preset} onPick={(p) => setS((x) => ({ ...x, draft: pickPreset(x.draft, p) }))} />
              <GoalNameField draft={d} onChange={(v) => set({ name: v })} onSubmit={next} />
            </div>
          )}

          {id === 'cost' && <CostPicker value={d.target} onChange={(v) => set({ target: v, custom: null })} />}

          {id === 'when' && <WhenPicker when={d.when} date={d.date} onChange={(when, date) => set({ when, date, custom: null })} />}

          {id === 'plan' && <PlanPreview draft={d} onChange={set} />}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </motion.main>
      </AnimatePresence>

      <footer className="start__foot">
        <motion.button type="button" className="btn btn--primary btn--block btn--xl" disabled={!canGo} whileTap={canGo ? { scale: 0.97 } : undefined} onClick={next}>
          {cta}
        </motion.button>
      </footer>
    </div>
  );
}

/** A short moment with Kip, then on to the new goal. */
function Made({ goal, onGo }: { goal: Goal; onGo: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onGo, 2600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const per = goal.plan.frequency === 'weekly' ? 'a week' : 'a month';
  return (
    <main className="start start--center newgoal-done" aria-live="polite">
      <motion.div className="newgoal-done__kip" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 18 }}>
        <Seal state="celebrate" size={200} title="" />
      </motion.div>
      <motion.div className="newgoal-done__text" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25, type: 'spring', stiffness: 380, damping: 28 }}>
        <h1 className="newgoal-done__title">Done! {goal.name} is on its way.</h1>
        <p className="newgoal-done__sub">
          {formatLei(goal.plan.amount)} {per}. Your first deposit can be today.
        </p>
      </motion.div>
      <motion.button type="button" className="btn btn--primary btn--block btn--xl" onClick={onGo} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        See your goal
      </motion.button>
    </main>
  );
}
