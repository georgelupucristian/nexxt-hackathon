import NumberFlow from '@number-flow/react';
import { Link } from 'react-router-dom';
import { Bell, Check, Users } from '@/lib/icons';
import { useSocial } from '../social/SocialProvider';
import { attentionCount } from '../../lib/social/view';
import '../../styles/social.css';
import { TOUR_EVENT } from './Tour';
import { joinedKey, StreakWeek } from '../StreakWeek';
import { bestStreak, currentStreak, goalSaved, periodDays, primaryGoal, weekStates } from '../../data/selectors';
import type { Goal } from '../../data/types';
import { formatLei } from '../../lib/money';
import { plural } from '../../lib/plural';
import { useData, useStore } from '../../data/store';
import { todayKey } from '../../lib/dates';

/**
 * The top bar: the Kip wordmark, and tactile round buttons (friends, reminders, help). Your streak
 * and your money each have their own card right below, so the bar doesn't repeat them. Friends sit
 * here rather than on Kip's dial; a gold dot means a request or a friend in need is waiting.
 */
export function HomeHeader() {
  const s = useSocial();
  const waiting = s ? attentionCount(s.world, s.me, s.now) : 0;
  return (
    <header className="top7">
      <p className="top7__brand" aria-label="Kip">
        Kip
      </p>
      <div className="top7__actions">
        <Link to="/friends" className="top7__icon" aria-label={waiting ? `Friends, ${waiting} new` : 'Friends'} data-testid="friends-link">
          <Users size={20} aria-hidden />
          {waiting > 0 && <span className="soc-dot" aria-hidden />}
        </Link>
        <Link to="/profile/reminders" className="top7__icon" aria-label="Reminders">
          <Bell size={20} aria-hidden />
        </Link>
        <button type="button" className="top7__icon" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))} aria-label="How it works">
          <span className="top7__q" aria-hidden>
            ?
          </span>
        </button>
      </div>
    </header>
  );
}

/**
 * The line next to the count, Duolingo-style, but about your own money: the goal's name, what you
 * put in today, what's left, how far along you are, your record. One variant a day, picked by the
 * date, so it doesn't change every time the app opens. Never a guilt trip.
 */
interface Facts {
  goal: Goal | null;
  today: number; // lei put in today, in bani
  left: number;
  pct: number;
  streak: number;
  best: number;
  daily: number; // plan per day, in bani
}
function lineFor(f: Facts, todayDone: boolean): [string, string] {
  const day = Math.floor(Date.now() / 86_400_000);
  const g = f.goal?.name;
  if (!g) return todayDone ? ['You saved today.', 'Pick a goal and Kip will show you the way.'] : ['Pick a goal.', 'Then every day you save lights up.'];
  const lei = (b: number) => formatLei(b);
  const step = f.daily > 0 ? lei(f.daily) : '5 lei';
  if (!todayDone) {
    const open: [string, string][] = [
      [`${g} is waiting for the next ${step}.`, 'Put it aside today to light up the day.'],
      [`${lei(f.left)} to go until ${g}.`, `Put ${step} aside to light up the day.`],
      [`You're ${Math.round(f.pct * 100)}% of the way to ${g}.`, 'One leu saved today lights up the day.'],
    ];
    return f.streak === 0 ? [`Day one for ${g}.`, `Put ${step} aside and start the fire.`] : open[day % open.length];
  }
  const done: [string, string][] = [
    f.today > 0 ? [`You put ${lei(f.today)} toward ${g} today.`, `${lei(f.left)} left to get there.`] : ['You saved today.', `${lei(f.left)} left until ${g}.`],
    [`${g}: ${Math.round(f.pct * 100)}% done.`, 'Every day you save adds up.'],
    f.streak >= f.best && f.streak > 1 ? [`Your longest streak yet.`, `${plural(f.streak, 'day', 'days')} in a row for ${g}.`] : [`${plural(f.streak, 'day', 'days')} in a row.`, `Your record: ${plural(f.best, 'day', 'days')}.`],
  ];
  return done[day % done.length];
}

/**
 * The streak card, recreated from Duolingo's streak widget: orange card, flame and the count up top,
 * a line of encouragement, the week as white circles on a track (a flame on each day you put money
 * aside). A day only lights up when money goes aside: there's nothing to tick by hand.
 */
export function StreakDuo() {
  const data = useData();
  const { account } = useStore();
  const days = weekStates(data, joinedKey(account, data.actions));
  const streak = currentStreak(data);
  const todayDone = days.some((d) => d.state === 'today-done');
  const goal = primaryGoal(data.goals);
  const saved = goal ? goalSaved(data.transactions, goal.id) : 0;
  const line = lineFor(
    {
      goal,
      today: data.transactions.filter((t) => t.type === 'contribution' && t.status !== 'failed' && t.date === todayKey() && (!goal || t.goalId === goal.id)).reduce((sum, t) => sum + t.amount, 0),
      left: goal ? Math.max(0, goal.target - saved) : 0,
      pct: goal && goal.target > 0 ? Math.min(1, saved / goal.target) : 0,
      streak,
      best: bestStreak(data),
      daily: goal && goal.plan.frequency !== 'flexible' && goal.plan.amount > 0 ? Math.ceil(goal.plan.amount / periodDays(goal.plan) / 100) * 100 : 0,
    },
    todayDone,
  );

  return (
    <section className="streakd" data-tour="streak" aria-labelledby="streakd-title">
      <div className="streakd__text">
        <div className="streakd__top">
          <p id="streakd-title" className="streakd__title">
            <span>
              <NumberFlow value={streak} /> {streak === 1 ? 'day' : 'days'}
            </span>
          </p>
          <div className="streakd__msg">
            <p className="streakd__msg1">{line[0]}</p>
            <p className="streakd__msg2">{line[1]}</p>
          </div>
        </div>

        <StreakWeek days={days} />
        {/* missed yesterday with no freeze: the run waits 24 hours for a friend's freeze */}
        {data.streakHold && !todayDone && (
          <Link to="/friends" className="streakd__done" style={{ color: 'inherit' }} data-testid="streak-danger">
            <img src="/mascot/ice.webp" alt="" width={18} height={18} aria-hidden /> Your streak is in danger. Ask a friend for a Freeze.
          </Link>
        )}
        {todayDone && (
          <p className="streakd__done">
            <Check size={16} aria-hidden /> You saved today. See you tomorrow.
          </p>
        )}
      </div>
    </section>
  );
}
