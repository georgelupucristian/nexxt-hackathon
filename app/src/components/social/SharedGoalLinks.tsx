// Shared goals sit in the same goals lists as personal ones (home and Goals), marked with the
// members' avatars and "With Ana, Mihai". Only the total % shows here, never anyone's amount.
import { Link } from 'react-router-dom';
import { ChevronRight } from '@/lib/icons';
import { Avatar } from './parts';
import { useSocial } from './SocialProvider';
import { firstNameOf, isParticipant, sharedPct } from '../../lib/social/rules';
import type { SharedGoal, SocialUser } from '../../lib/social/types';
import { GoalPic } from '../../screens/social/ColonyDetail';

function useMyShared() {
  const s = useSocial();
  if (!s) return null;
  const goals = s.world.sharedGoals.filter((g) => isParticipant(g, s.viewer));
  const others = (g: SharedGoal) => g.participants.filter((p) => p.user !== s.viewer).map((p) => s.world.users[p.user]).filter(Boolean);
  return { goals, others };
}

function Members({ goal, others }: { goal: SharedGoal; others: (g: SharedGoal) => SocialUser[] }) {
  const people = others(goal);
  if (!people.length) return <span className="xs subtle">Waiting for friends to join</span>;
  return (
    <span className="row" style={{ gap: 6, minWidth: 0 }}>
      <span className="row" style={{ gap: 0 }} aria-hidden>
        {people.slice(0, 4).map((u, i) => (
          <span key={i} style={{ marginLeft: i ? -6 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--surface)' }}>
            <Avatar user={u} size={20} />
          </span>
        ))}
      </span>
      <span className="xs subtle truncate">With {people.map((u) => firstNameOf(u.name)).join(', ')}</span>
    </span>
  );
}

/** Rows for the home goals card (the cop__ list). */
export function SharedGoalRows() {
  const m = useMyShared();
  if (!m) return null;
  return (
    <>
      {m.goals.map((g) => {
        const pct = sharedPct(g);
        return (
          <li key={g.id}>
            <Link to={`/shared-goal/${g.id}`} className="cop__goal" data-testid="shared-goal-row">
              <div className="cop__line">
                <GoalPic goal={g} size={30} />
                <span className="cop__name truncate">{g.name}</span>
                <span className="cop__amt money">
                  <b>{pct}%</b>
                </span>
              </div>
              <span className="cop__bar" aria-hidden>
                <i style={{ width: `${Math.max(pct, pct > 0 ? 1.5 : 0)}%`, background: 'var(--progress)' }} />
              </span>
              <div className="cop__meta">
                <Members goal={g} others={m.others} />
              </div>
            </Link>
          </li>
        );
      })}
    </>
  );
}

/** Cards for the Goals screen. */
export function SharedGoalCards() {
  const m = useMyShared();
  if (!m) return null;
  return (
    <>
      {m.goals.map((g) => {
        const pct = sharedPct(g);
        return (
          <Link key={g.id} to={`/shared-goal/${g.id}`} className="soc-goalcard" data-testid="shared-goal-card">
            <GoalPic goal={g} />
            <span className="grow stack" style={{ gap: 6, minWidth: 0 }}>
              <span className="row row--between">
                <span className="strong truncate">{g.name}</span>
                <span className="strong" style={{ color: 'var(--progress)' }}>
                  {pct}%
                </span>
              </span>
              <span className="soc-bar" role="progressbar" aria-label={`${g.name}: ${pct}%`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${pct}%` }} />
              </span>
              <Members goal={g} others={m.others} />
            </span>
            <ChevronRight size={18} className="subtle" aria-hidden />
          </Link>
        );
      })}
    </>
  );
}
