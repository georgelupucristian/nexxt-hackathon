// /shared-goal/:id: saving together without moving money between people. Each contribution
// stays its owner's own, in a sub-pocket linked to the goal; the goal's progress is their sum.
// Everyone sees the total in % and each member's progress toward their own share in %, never
// anyone else's amount. A deposit is extra money, separate from the person's own savings. On the
// live backend it is real (Stripe, or the sandbox for test numbers); the offline demo says "Demo".
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Deposit, SignOutIcon, Withdraw } from '@/lib/icons';
import { Avatar, DemoLabel, DemoMoneySheet, SocialMoment, type Moment } from '../../components/social/parts';
import { useSocial } from '../../components/social/SocialProvider';
import { Button, TextField, TopBar, useToast } from '../../components/ui';
import { fromKey } from '../../lib/dates';
import { formatLei, parseLei } from '../../lib/money';
import { firstNameOf, isParticipant, MILESTONES, ownContribution, RuleError, sharedPct, shareProgressPct } from '../../lib/social/rules';
import { GoalPic } from './ColonyDetail';

const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

export function SharedGoalScreen() {
  const { id = '' } = useParams();
  const s = useSocial();
  const nav = useNavigate();
  const toast = useToast();
  const [sheet, setSheet] = useState<null | 'in' | 'out'>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [newTarget, setNewTarget] = useState('');
  const [shareRaw, setShareRaw] = useState<string | null>(null);
  const goal = s?.world.sharedGoals.find((g) => g.id === id) ?? null;
  const viewer = s?.viewer ?? '';
  const pct = goal ? sharedPct(goal) : 0;

  // the shared celebration: whoever opens the goal after it passed a milestone sees it once
  const unseen = goal && s && isParticipant(goal, viewer) ? [...goal.milestones].sort((a, b) => b - a).find((m) => !s.world.seen[`ms-${goal.id}-${m}-${viewer}`]) : undefined;
  useEffect(() => {
    if (!goal || !s || unseen === undefined || moment) return;
    setMoment(milestoneMoment(goal.name, unseen, goal.id, viewer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseen, goal?.id, viewer]);

  if (!s) return null;
  if (!goal) return <Navigate to="/goals" replace />;
  const colony = s.world.colonies.find((c) => c.id === goal.colony);
  const inColony = !!colony?.members.some((m) => m.user === viewer);
  const joined = isParticipant(goal, viewer);
  const invitedMe = !!goal.invited?.some((i) => i.user === viewer);
  const seats = 5 - goal.participants.length - (goal.invited?.length ?? 0);
  const canInvite = s.world.friendships
    .map((f) => (f.a === viewer ? f.b : f.b === viewer ? f.a : null))
    .filter((u): u is string => !!u && !isParticipant(goal, u) && !goal.invited?.some((i) => i.user === u));
  const own = ownContribution(goal, viewer);
  const share = goal.participants.find((p) => p.user === viewer)?.share ?? 0;
  const done = pct >= 100;

  const closeMoment = () => {
    if (moment && goal) for (const m of goal.milestones) s.repo.markSeen(`ms-${goal.id}-${m}-${viewer}`);
    setMoment(null);
  };

  return (
    <div className="screen">
      <TopBar title="Shared goal" />
      <section className="soc-goalhero" aria-labelledby="sg-name">
        <GoalPic goal={goal} size={96} />
        <h1 id="sg-name">{goal.name}</h1>
        <p className="small muted">
          {formatLei(goal.target)} by {monthYear.format(fromKey(goal.date))}
          {colony ? ` · colony «${colony.name}»` : ''}
        </p>
        <p className="soc-goalhero__pct" data-testid="shared-pct">
          {pct}%
        </p>
        <div className="soc-bar soc-bar--lg" style={{ width: '100%' }} role="progressbar" aria-label={`${goal.name}: ${pct}% saved`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <ol className="row" style={{ gap: 6, listStyle: 'none', margin: 0, padding: 0 }} aria-label="Milestones">
          {MILESTONES.map((m) => (
            <li key={m} className={`soc-badge ${pct >= m ? 'soc-badge--freeze' : ''}`} style={pct >= m ? { background: 'var(--progress-soft)', color: 'var(--progress)' } : { background: 'var(--surface-2)', color: 'var(--text-2)' }}>
              {m}%
            </li>
          ))}
        </ol>
      </section>

      {joined ? (
        <section className="card stack" aria-labelledby="mine-h">
          <div className="row row--between">
            <h2 id="mine-h">Your share</h2>
            {s.simulated && <DemoLabel />}
          </div>
          <p className="small muted">
            You've put in <strong className="money">{formatLei(own)}</strong> of your <strong className="money">{formatLei(share)}</strong> share ({shareProgressPct(goal, viewer)}%).
          </p>
          <div className="soc-moneyrow">
            <Button variant="primary" icon={Deposit} onClick={() => setSheet('in')}>
              Deposit
            </Button>
            <Button icon={Withdraw} onClick={() => setSheet('out')} disabled={own <= 0}>
              Withdraw
            </Button>
          </div>
          <p className="xs subtle">Extra money, separate from your own savings. It stays yours, linked to the goal. Only you can take it out, anytime.</p>
          {shareRaw === null ? (
            <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShareRaw(String(share / 100))}>
              Change your share
            </button>
          ) : (
            <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
              <div className="grow">
                <TextField label="Your share" inputMode="decimal" suffix="lei" hint="The rest of the target is split evenly between the others." value={shareRaw} onChange={(e) => setShareRaw(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} />
              </div>
              <Button
                disabled={!parseLei(shareRaw)}
                onClick={async () => {
                  try {
                    await s.repo.setSharedShare(goal.id, parseLei(shareRaw)!);
                    setShareRaw(null);
                    toast('Your share is updated.');
                  } catch (e) {
                    toast(e instanceof RuleError ? e.message : "Couldn't change it.", 'error');
                  }
                }}
              >
                Save
              </Button>
            </div>
          )}
        </section>
      ) : (
        (inColony || invitedMe) && (
          <div className="row" style={{ gap: 8 }}>
            <Button
              variant="primary"
              className="grow"
              onClick={async () => {
                try {
                  await s.repo.joinSharedGoal(goal.id);
                  toast("You're in. The target is now split evenly.");
                } catch (e) {
                  toast(e instanceof RuleError ? e.message : "Couldn't join.", 'error');
                }
              }}
            >
              Join the goal
            </Button>
            {invitedMe && (
              <Button
                onClick={async () => {
                  await s.repo.declineSharedGoal(goal.id);
                  nav('/friends?tab=requests', { replace: true });
                }}
              >
                No thanks
              </Button>
            )}
          </div>
        )
      )}

      {done && (
        <section className="soc-reward" role="status">
          <img src="/mascot/pose-celebrate.webp" alt="" style={{ width: 64, height: 64, objectFit: 'contain' }} />
          {/* TODO(requires real P2P payments): paying one organizer from everyone's part is out of scope;
              for now each person unlocks only their own share, from their own sub-pocket. */}
          <span>Done, 100%. Everyone unlocks their own share from their own pocket.</span>
        </section>
      )}

      {goal.rebalance && joined && (
        <section className="card stack" aria-labelledby="rb-h">
          <h2 id="rb-h">Someone left the goal</h2>
          <p className="small muted">What they put in went back to their own pocket. Choose how you carry on.</p>
          <Button
            onClick={async () => {
              await s.repo.redistributeShared(goal.id);
              toast('The target stays. We split it evenly again.');
            }}
          >
            Split the target again
          </Button>
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <div className="grow">
              <TextField label="Or a new target" inputMode="decimal" suffix="lei" placeholder={String(goal.target / 100)} value={newTarget} onChange={(e) => setNewTarget(e.target.value.replace(/[^\d.,]/g, ''))} />
            </div>
            <Button
              disabled={!parseLei(newTarget)}
              onClick={async () => {
                try {
                  await s.repo.adjustSharedTarget(goal.id, parseLei(newTarget)!);
                  setNewTarget('');
                  toast('Target updated.');
                } catch (e) {
                  toast(e instanceof RuleError ? e.message : "Couldn't change it.", 'error');
                }
              }}
            >
              Adjust
            </Button>
          </div>
        </section>
      )}

      <section className="stack" aria-labelledby="who-h">
        <h2 id="who-h" className="group-label">
          Who's saving
        </h2>
        <ul className="soc-list soc-card">
          {goal.participants.map((p) => {
            const u = s.world.users[p.user];
            if (!u) return null;
            const mine = shareProgressPct(goal, p.user);
            return (
              <li key={p.user} className="soc-row" data-testid="shared-member">
                <Avatar user={u} />
                <span className="soc-row__body">
                  <span className="soc-row__name">{p.user === viewer ? `${u.name} (you)` : u.name}</span>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="soc-bar grow" role="progressbar" aria-label={`${firstNameOf(u.name)}: ${mine}% of their share`} aria-valuenow={mine} aria-valuemin={0} aria-valuemax={100}>
                      <i style={{ width: `${mine}%` }} />
                    </span>
                    <span className="xs strong">{mine}%</span>
                  </span>
                  <span className="xs subtle">of their share</span>
                </span>
              </li>
            );
          })}
        </ul>
        {goal.invited?.length ? (
          <p className="xs subtle">Invited: {goal.invited.map((i) => firstNameOf(s.world.users[i.user]?.name ?? 'a friend')).join(', ')}</p>
        ) : null}
        <p className="xs subtle">Everyone only sees percentages. Each person's amounts stay their own.</p>
      </section>

      {joined && seats > 0 && canInvite.length > 0 && (
        <section className="stack" aria-labelledby="inv-h">
          <h2 id="inv-h" className="group-label">
            Invite friends
          </h2>
          <ul className="soc-list soc-card">
            {canInvite.slice(0, 8).map((u) => {
              const f = s.world.users[u];
              if (!f) return null;
              return (
                <li key={u} className="soc-row">
                  <Avatar user={f} />
                  <span className="soc-row__body">
                    <span className="soc-row__name">{f.name}</span>
                  </span>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await s.repo.inviteToSharedGoal(goal.id, [u]);
                        toast(`${firstNameOf(f.name)} is invited.`);
                      } catch (e) {
                        toast(e instanceof RuleError ? e.message : "Couldn't invite.", 'error');
                      }
                    }}
                  >
                    Invite
                  </Button>
                </li>
              );
            })}
          </ul>
          <p className="xs subtle">Up to 5 people, you included. Equal shares split again when someone joins.</p>
        </section>
      )}

      {joined && (
        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={async () => {
            const { returned } = await s.repo.leaveSharedGoal(goal.id);
            toast(returned > 0 ? `You left. Your ${formatLei(returned)} came back to you, ready to withdraw.` : 'You left the goal.');
            nav('/goals', { replace: true });
          }}
        >
          <SignOutIcon size={18} aria-hidden /> Leave goal
        </button>
      )}

      <DemoMoneySheet
        demo={s.simulated}
        open={sheet === 'in'}
        onClose={() => setSheet(null)}
        title={`Deposit for ${goal.name}`}
        verb="Deposit"
        note={s.simulated ? <>Simulated money. It stays yours, in a pocket linked to «{goal.name}».</> : <>Extra money for «{goal.name}», separate from your own savings. It doesn't count toward your personal goal or streak.</>}
        onSubmit={async (amount) => {
          const { crossed } = await s.repo.depositShared(goal.id, amount);
          setSheet(null);
          if (crossed.length) setMoment(milestoneMoment(goal.name, crossed[crossed.length - 1], goal.id, viewer));
          else toast(`+${formatLei(amount)} for ${goal.name}.`);
        }}
      />
      <DemoMoneySheet
        demo={s.simulated}
        open={sheet === 'out'}
        onClose={() => setSheet(null)}
        title="Withdraw from your share"
        verb="Withdraw"
        outgoing
        max={own}
        note={<>You can only withdraw what you put in: {formatLei(own)}. The others only see the new percentage.{s.simulated ? '' : ' The payout is simulated in the sandbox.'}</>}
        onSubmit={async (amount) => {
          await s.repo.withdrawShared(goal.id, amount);
          setSheet(null);
          toast(s.simulated ? `You withdrew ${formatLei(amount)}. It's back in your pocket.` : `You withdrew ${formatLei(amount)}.`);
        }}
      />
      <SocialMoment moment={moment} onClose={closeMoment} />
    </div>
  );
}

function milestoneMoment(name: string, m: number, goalId: string, viewer: string): Moment {
  return {
    key: `ms-${goalId}-${m}-${viewer}`,
    kip: 'celebrate',
    big: `${m}%`,
    title: m >= 100 ? `«${name}» is done!` : `${m === 25 ? 'A quarter of the way' : m === 50 ? 'Halfway' : 'Three quarters of the way'} to «${name}»`,
    sub: m >= 100 ? 'You did it together. Everyone unlocks their own share.' : 'Together, little by little. The whole colony sees this moment.',
  };
}
