import { ArrowRight } from '@/lib/icons';
import { motion } from 'motion/react';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { planLabel, TxRow } from '../domain';
import { useToast } from '../ui';
import { PlanSimulator } from './Playful';
import { SleepTile } from './SleepOnIt';
import { GoalsCard, SaveButton } from './GoalsCard';
import { SharedGoalsHomeCard } from '../social/SharedGoalLinks';
import { KipTransactionList } from '../watermelon/transaction-list';
import { HomeHeader, StreakDuo } from './HomeTop';
import { ClubsHomeRow } from '../../screens/Clubs';
import { primaryGoal, sortTx, todayAction, type TodayAction } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import { goalLook, goalVars } from '../../lib/goalLook';
import { formatLei } from '../../lib/money';

interface HubProps {
  onAdd: (goalId?: string | null, amount?: number) => void;
  onDetails?: () => void; // the balance breakdown sheet; home links to Activity instead now
}

const spring = { type: 'spring', stiffness: 320, damping: 30 } as const;
const enter = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay: 0.05 * i } });

/**
 * Home, in order of importance: the goal you're saving for on its own coloured band (the only
 * place Kip appears besides his button), then plain rows grouped under short headings: the streak,
 * this month, the other goals, recent activity, the projection and "sleep on it". On a laptop the
 * goal and the habit sit on the left, the money on the right. Navigation lives in Kip's dial.
 */
export function Hub({ onAdd }: HubProps) {
  const data = useData();
  const goal = primaryGoal(data.goals);
  const action = todayAction(data);
  // the page's soft colour wash takes the main goal's colour, so the glass has something to refract
  const tint = goal ? (goalVars(goalLook(goal)) as CSSProperties) : undefined;

  return (
    <div className="home6" style={tint}>
      <h1 className="sr-only">Home</h1>
      <motion.div {...enter(0)}>
        <HomeHeader />
      </motion.div>

      {/* the normal home from the very first visit: no gate asking for a card before anything else */}
      {/* phone: one column, most important first. laptop: money and habit left, the rest right. */}
      <div className="home6__grid">
          <div className="home6__col">
            <motion.div {...enter(1)}>
              <StreakDuo />
            </motion.div>
            <motion.div {...enter(2)} className="home6__goal">
              {goal ? (
                <>
                  <GoalsCard />
                  <SaveButton />
                </>
              ) : (
                <>
                  <NextStep action={action} onAdd={onAdd} />
                  <SharedGoalsHomeCard />
                </>
              )}
            </motion.div>
            <motion.div {...enter(2)}>
              <ClubsHomeRow />
            </motion.div>
          </div>
          <div className="home6__col">
            <motion.div {...enter(3)}>
              {data.transactions.length ? <KipTransactionList transactions={data.transactions} max={4} /> : <Recent />}
            </motion.div>
            {goal && goal.plan.frequency !== 'flexible' && (
              <motion.div {...enter(5)} className="home6__panel glass">
                <PlanSimulator goal={goal} />
              </motion.div>
            )}
            <motion.div {...enter(6)} className="home6__panel glass">
              <SleepTile />
            </motion.div>
          </div>
        </div>
    </div>
  );
}

// ---------- the one thing to do today ----------

function NextStep({ action, onAdd }: { action: TodayAction; onAdd: (goalId?: string | null, amount?: number) => void }) {
  const data = useData();
  const { sync } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  let title = '';
  let body = '';
  let primary: { label: string; run: () => void } | null = null;
  let secondary: { label: string; run: () => void } | null = null;

  switch (action.kind) {
    case 'create-goal':
      title = 'Pick what you are saving for';
      body = 'A laptop, Erasmus, an emergency fund, anything. You get a plan that fits your week.';
      primary = { label: 'Create a goal', run: () => nav('/goals/new') };
      break;
    case 'set-plan':
      title = `${action.goal.name} needs a plan`;
      body = 'Pick how much and how often. You can shrink it or pause it any time.';
      primary = { label: 'Make a plan', run: () => nav(`/goals/${action.goal.id}`) };
      break;
    case 'planned-contribution':
      title = 'Today is one of your saving days';
      body = `Your plan for ${action.goal.name} is ${planLabel(action.goal.plan).replace(/^\w/, (c) => c.toLowerCase())}. Put the money aside where you usually keep it, then add it here so it counts. If this week is tighter, save less or skip it: the plan is not a must.`;
      primary = { label: `I saved ${formatLei(action.amount)}`, run: () => onAdd(action.goal.id, action.amount) };
      secondary = { label: 'Add a different amount', run: () => onAdd(action.goal.id) };
      break;
    case 'fix-connection':
      title = 'The demo sync didn\'t work';
      body = 'Your last known numbers stay here. Nothing was lost.';
      primary = {
        label: 'Retry sync',
        run: async () => {
          setBusy(true);
          try {
            await sync();
            toast('Synced');
          } catch (e) {
            toast((e as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        },
      };
      break;
    case 'goal-reached':
      title = `Goal reached: ${action.goal.name}`;
      body = 'Choose what comes next: archive it, raise the target or start a new goal.';
      primary = { label: 'Open the goal', run: () => nav(`/goals/${action.goal.id}`) };
      break;
    case 'review-week':
      title = 'Take a look at your week';
      body = 'See what came in and what went out, then decide if the plan still fits next week.';
      secondary = { label: 'See this week', run: () => nav('/activity') };
      break;
    case 'review-plan':
      title = 'Is your plan still working this week?';
      body = `If not, change it on the ${action.goal.name} goal page. Today lights up when you save.`;
      primary = { label: 'Save money', run: () => onAdd(action.goal.id) };
      secondary = { label: 'See the plan', run: () => nav(`/goals/${action.goal.id}`) };
      break;
    case 'done-today':
      title = 'Nothing else to do today';
      body = 'You already saved today. See you on your next saving day.';
      break;
  }

  return (
    <section className="next2" aria-labelledby="next-title">
      <h2 id="next-title" className="h3">
        {title}
      </h2>
      <p className="muted">{body}</p>
      {(primary || secondary) && (
        <div className="btn-row">
          {primary && (
            <button type="button" className="btn btn--primary" onClick={primary.run} disabled={busy}>
              {primary.label}
            </button>
          )}
          {secondary && (
            <button type="button" className={`btn ${primary ? 'btn--ghost' : 'btn--secondary'}`} onClick={secondary.run}>
              {secondary.label}
            </button>
          )}
        </div>
      )}
      {data.transactions.length === 0 && action.kind !== 'create-goal' && data.tracking !== 'stripe' && <p className="small muted">Kip never moves money. It just keeps track of what you save.</p>}
    </section>
  );
}

// ---------- what happened ----------

function Recent() {
  const data = useData();
  const recent = sortTx(data.transactions).slice(0, 4);
  return (
    <section className="grp" aria-labelledby="recent-title">
      <div className="grp__head">
        <h2 id="recent-title" className="grp__title">
          Recent activity
        </h2>
        {recent.length > 0 && (
          <Link to="/activity" className="grp__link">
            See all <ArrowRight size={14} aria-hidden />
          </Link>
        )}
      </div>
      {recent.length ? (
        <ul className="grp__rows grp__rows--tx">
          {recent.map((t) => (
            <li key={t.id}>
              <TxRow tx={t} />
            </li>
          ))}
        </ul>
      ) : (
        // the "Save money" button sits right above, so the empty state only says what will appear here
        <div className="empty2">
          <p className="muted small">Every deposit shows up here, with its goal.</p>
        </div>
      )}
    </section>
  );
}
