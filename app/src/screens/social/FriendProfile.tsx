// /friends/:id: one person. Their streak and whether they saved today, the colonies you share,
// the freezes between the two of you (private), cheers, and the rest of the actions. No money.
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Binoculars, ChevronRight, MoreHorizontal, UserPlus, Users } from '@/lib/icons';
import { Avatar, CheerButtons, DangerBadge, FreezeActiveBadge, RescuedMoment, SavedToday, StreakCount, useGiveFreeze } from '../../components/social/parts';
import { useSocial } from '../../components/social/SocialProvider';
import { Button, Switch, TopBar, useToast } from '../../components/ui';
import { toKey } from '../../lib/dates';
import { areFriends, firstNameOf, RuleError } from '../../lib/social/rules';
import { asksFor, colonyDetail, savesBetween, sharedColonies, statusOf } from '../../lib/social/view';
import { FriendMenu } from './Friends';

export function FriendProfile() {
  const { id = '' } = useParams();
  const s = useSocial();
  const toast = useToast();
  const { give, ui } = useGiveFreeze();
  const [menu, setMenu] = useState(false);
  if (!s) return null;
  const u = s.world.users[id];
  if (!u || id === s.viewer) return <Navigate to="/friends" replace />;
  const st = statusOf(s.world, id, s.now);
  const mine = statusOf(s.world, s.viewer, s.now);
  const friends = areFriends(s.world, s.viewer, id);
  const pending = s.world.requests.some((r) => r.status === 'pending' && r.from === s.viewer && r.to === id);
  const colonies = sharedColonies(s.world, s.viewer, id);
  const between = savesBetween(s.world, s.viewer, id);
  const asked = asksFor(s.world, s.viewer, s.now).some((a) => a.from === id);
  const name = firstNameOf(u.name);
  const inDanger = !!st.danger && !st.danger.gift;
  const isWitness = s.world.witness[s.viewer] === id;
  // P1.1: if this person picked the viewer as their trusted friend, a weekly summary, never amounts
  const witnessOf = s.world.witness[id] === s.viewer;

  return (
    <div className="screen">
      <TopBar
        title="Friend"
        end={
          friends ? (
            <button type="button" className="icon-btn" aria-label="More" onClick={() => setMenu(true)}>
              <MoreHorizontal size={20} aria-hidden />
            </button>
          ) : undefined
        }
      />
      <section className="soc-hero" aria-labelledby="friend-name">
        <Avatar user={u} size={88} />
        <h1 id="friend-name">{u.name}</h1>
        <StreakCount n={st.streak} big />
        <SavedToday yes={st.savedToday} frozen={st.frozen.has(toKey(s.now))} />
        <div className="soc-hero__badges">
          {inDanger && <DangerBadge />}
          {st.freezeActive && <FreezeActiveBadge />}
          {st.hasDayFreeze && (
            <span className="soc-badge soc-badge--freeze">
              <img src="/mascot/ice.webp" alt="" aria-hidden /> Has a 1-day Freeze
            </span>
          )}
        </div>
      </section>

      {inDanger && (
        <section className="soc-help" aria-labelledby="help-h">
          <img src="/mascot/pose-ice-floe.webp" alt="" />
          <div className="stack" style={{ gap: 6, flex: 1 }}>
            <h2 id="help-h">{name} is in danger</h2>
            <p>{asked ? '“Can you spare a freeze?”' : "They didn't save yesterday and have no 1-day Freeze."}</p>
            {mine.hasDayFreeze ? (
              <Button variant="primary" size="sm" onClick={() => give(id)}>
                Give them your freeze
              </Button>
            ) : (
              <p className="xs">You don't have a freeze right now. A cheer helps too.</p>
            )}
          </div>
        </section>
      )}

      {!friends && (
        <Button
          variant="primary"
          block
          icon={UserPlus}
          disabled={pending}
          onClick={async () => {
            try {
              const out = await s.repo.sendRequest(id);
              toast(out === 'friends' ? `You're now friends with ${name}.` : `Request sent to ${name}.`);
            } catch (e) {
              toast(e instanceof RuleError ? e.message : "Couldn't send it.", 'error');
            }
          }}
        >
          {pending ? 'Request sent' : 'Add friend'}
        </Button>
      )}

      <section className="stack" aria-labelledby="cheer-h">
        <h2 id="cheer-h" className="group-label">
          Cheers
        </h2>
        <CheerButtons to={id} />
      </section>

      {s.simulated && (
      <section className="stack" aria-labelledby="col-h">
        <h2 id="col-h" className="group-label">
          Shared colonies
        </h2>
        {colonies.length ? (
          <div className="card card--flush">
            <ul className="list">
              {colonies.map((c) => {
                const d = colonyDetail(s.world, c.id, s.viewer, s.now);
                return (
                  <li key={c.id}>
                    <Link to={`/colonies/${c.id}`} className="list-row">
                      <span className="list-row__icon">
                        <Users size={18} aria-hidden />
                      </span>
                      <span className="list-row__body strong">{c.name}</span>
                      {d && <StreakCount n={d.streak} />}
                      <ChevronRight size={18} className="subtle" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="small muted">No shared colonies yet.</p>
        )}
      </section>
      )}

      <section className="stack" aria-labelledby="saves-h">
        <h2 id="saves-h" className="group-label">
          Between you two
        </h2>
        <div className="soc-stats">
          <div className="soc-stat">
            <b>{between.given}</b>
            <span>Saves given</span>
          </div>
          <div className="soc-stat">
            <b>{between.received}</b>
            <span>Saves received</span>
          </div>
        </div>
        <p className="xs subtle">Only you two see this. There are no leaderboards.</p>
      </section>

      {friends && s.simulated && (
        <section className="card row row--between" aria-label="Witness">
          <div className="row" style={{ gap: 12 }}>
            <span className="list-row__icon">
              <Binoculars size={18} aria-hidden />
            </span>
            <div>
              <h3>My witness</h3>
              <p className="small muted">Every week they get your streak and your goal percentage, never amounts. All they can do is cheer you on.</p>
            </div>
          </div>
          <Switch checked={isWitness} onChange={(v) => void Promise.resolve(s.repo.setWitness(v ? id : null)).catch(() => undefined)} label={`${name} is my witness`} />
        </section>
      )}

      {witnessOf && (
        <section className="card stack" aria-labelledby="weekly-h">
          <h2 id="weekly-h">Weekly summary: {name}</h2>
          <p className="small muted">They picked you as their witness. You only see the streak and the percentage, never amounts.</p>
          <div className="soc-stats">
            <div className="soc-stat">
              <b>{st.streak}</b>
              <span>days in a row</span>
            </div>
            <div className="soc-stat">
              <b>{Math.round(u.goalProgress * 100)}%</b>
              <span>of their personal goal</span>
            </div>
          </div>
        </section>
      )}

      {ui}
      <RescuedMoment />
      <FriendMenu id={menu ? id : null} onClose={() => setMenu(false)} onGive={give} />
    </div>
  );
}
