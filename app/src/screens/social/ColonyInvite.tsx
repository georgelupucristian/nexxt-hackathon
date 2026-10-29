// /colonies/invite/:cod: someone invited you to a colony. Who's in it, its streak, and one button.
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Avatar, StreakCount } from '../../components/social/parts';
import { useSocial } from '../../components/social/SocialProvider';
import { Button, TopBar, useToast } from '../../components/ui';
import { plural } from '../../lib/plural';
import { firstNameOf, RuleError } from '../../lib/social/rules';
import { colonyDetail } from '../../lib/social/view';

export function ColonyInvite() {
  const { cod = '' } = useParams();
  const s = useSocial();
  const nav = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  if (!s) return null;
  const colony = s.world.colonies.find((c) => c.code.toUpperCase() === cod.toUpperCase());
  if (!colony)
    return (
      <div className="screen">
        <TopBar title="Invite" heading />
        <p className="muted">This invite is no longer valid. The colony may have closed in the meantime.</p>
        <Button onClick={() => nav('/colonies')}>Your colonies</Button>
      </div>
    );
  if (colony.members.some((m) => m.user === s.viewer)) return <Navigate to={`/colonies/${colony.id}`} replace />;
  const d = colonyDetail(s.world, colony.id, s.viewer, s.now)!;
  const invite = s.world.colonyInvites.find((i) => i.colony === colony.id && i.to === s.viewer && i.status === 'pending');
  const from = invite ? s.world.users[invite.from] : null;
  return (
    <div className="screen">
      <TopBar title="Invite" />
      <section className="soc-hero" aria-labelledby="inv-h">
        <img src="/mascot/pose-wave.webp" alt="" style={{ width: 140, height: 140, objectFit: 'contain' }} />
        <h1 id="inv-h">«{colony.name}»</h1>
        <p className="muted">{from ? `${firstNameOf(from.name)} invited you to the colony.` : "You've been invited to a colony."}</p>
        <StreakCount n={d.streak} big />
        <p className="small muted">{plural(colony.members.length, 'member', 'members')} · you see each other's streaks and who saved today, never the money</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {d.members.map((m) => (
            <span key={m.id} style={{ marginRight: -8 }} title={m.name}>
              <Avatar user={s.world.users[m.id]} size={40} />
            </span>
          ))}
        </div>
      </section>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="stack">
        <Button
          variant="primary"
          block
          onClick={async () => {
            try {
              await s.repo.joinColony(colony.id);
              toast(`Welcome to «${colony.name}»!`);
              nav(`/colonies/${colony.id}`, { replace: true });
            } catch (e) {
              setError(e instanceof RuleError ? e.message : "Couldn't join. Try again.");
            }
          }}
        >
          Join the colony
        </Button>
        <Button
          block
          onClick={async () => {
            await s.repo.declineColonyInvite(colony.id);
            nav('/friends', { replace: true });
          }}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
