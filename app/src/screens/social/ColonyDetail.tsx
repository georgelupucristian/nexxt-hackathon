// /colonies/:id: the colony's streak, who's in it and who saved today, anyone in danger (with
// "Give them your freeze"), the shared goal, the week's challenge, inviting, and leaving in one tap.
// Members see each other's name, streak and "saved today"; progress only if they switched it on.
import { useRef, useState, type ChangeEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Camera, Check, ChevronRight, Coffee, Copy, Plus, Share, SignOutIcon, UserPlus } from '@/lib/icons';
import { recapImage } from '../../components/social/recap';
import { Avatar, FreezeDot, RescuedMoment, SavedToday, StreakCount, useGiveFreeze } from '../../components/social/parts';
import { useSocial } from '../../components/social/SocialProvider';
import { MyStreakHelp } from './Friends';
import { Button, Sheet, Switch, TextField, TopBar, useToast } from '../../components/ui';
import { GOAL_ICONS } from '../../lib/goalIcons';
import { formatLei, parseLei } from '../../lib/money';
import { plural } from '../../lib/plural';
import { COLONY_MAX, firstNameOf, friendsOf, RuleError, sharedPct } from '../../lib/social/rules';
import { colonyDetail, statusOf } from '../../lib/social/view';
import type { SharedGoal } from '../../lib/social/types';
import { addMonths, todayKey } from '../../lib/dates';

export function ColonyDetail() {
  const { id = '' } = useParams();
  const s = useSocial();
  const nav = useNavigate();
  const toast = useToast();
  const { give, ui } = useGiveFreeze();
  const [inviting, setInviting] = useState(false);
  const [proposing, setProposing] = useState(false);
  if (!s) return null;
  const d = colonyDetail(s.world, id, s.viewer, s.now);
  if (!d) return <Navigate to="/colonies" replace />;
  const member = d.members.some((m) => m.isViewer);
  if (!member) return <Navigate to={`/colonies/invite/${d.colony.code}`} replace />;
  const me = s.world.users[s.viewer];
  const mine = statusOf(s.world, s.viewer, s.now);
  const ch = d.colony.challenge;
  const allDone = !!ch && d.members.every((m) => ch.done.includes(m.id));

  return (
    <div className="screen">
      <TopBar title="Colony" />
      <section className="soc-colonyhero" aria-labelledby="colony-name" data-testid="colony-hero">
        <img src="/mascot/flame.webp" alt="" />
        <div className="grow">
          <h1 id="colony-name" style={{ fontSize: 'var(--fs-lg)', color: '#fff' }}>
            {d.colony.name}
          </h1>
          <b data-testid="colony-streak">{d.streak}</b>
          <p>{plural(d.streak, 'day', 'days').replace(/^\S+ /, '')} in a row, together</p>
          {d.atRisk.length > 0 && <span className="soc-colonyhero__risk">The colony's streak is waiting for a freeze</span>}
        </div>
      </section>

      <MyStreakHelp />

      {d.atRisk
        .filter((uid) => uid !== s.viewer)
        .map((uid) => {
          const u = s.world.users[uid];
          const helpers = d.members.filter((m) => m.id !== uid && m.hasDayFreeze && !m.isViewer).map((m) => firstNameOf(m.name));
          return (
            <section key={uid} className="soc-help" aria-label={`${firstNameOf(u.name)} is in danger`} data-testid="colony-danger">
              <img src="/mascot/pose-ice-floe.webp" alt="" />
              <div className="stack" style={{ gap: 6, flex: 1 }}>
                <h2>{firstNameOf(u.name)} is in danger</h2>
                <p>They didn't save yesterday. A 1-day Freeze keeps the colony's streak going.</p>
                {mine.hasDayFreeze ? (
                  <Button variant="primary" size="sm" onClick={() => give(uid)}>
                    Give them your freeze
                  </Button>
                ) : (
                  helpers.length > 0 && <p className="xs">Has a freeze: {helpers.join(', ')}.</p>
                )}
              </div>
            </section>
          );
        })}

      <section className="stack" aria-labelledby="members-h">
        <h2 id="members-h" className="group-label">
          Today · {d.members.filter((m) => m.savedToday || m.frozenToday).length} of {d.members.length} put money aside
        </h2>
        <ul className="soc-list soc-card">
          {d.members.map((m) => {
            const u = s.world.users[m.id];
            const row = (
              <>
                <Avatar user={u} />
                <span className="soc-row__body">
                  <span className="soc-row__name">
                    <span>{m.isViewer ? `${m.name} (you)` : m.name}</span>
                    {m.hasDayFreeze && <FreezeDot />}
                  </span>
                  <span className="soc-row__meta">
                    <StreakCount n={m.streak} />
                    <SavedToday yes={m.savedToday} frozen={m.frozenToday} />
                    {m.inDanger && <span className="soc-badge soc-badge--danger">In danger</span>}
                  </span>
                  {m.progressPct !== null && (
                    <span className="row" style={{ gap: 8 }}>
                      <span className="soc-bar grow" role="progressbar" aria-label={`${firstNameOf(m.name)}: personal goal progress`} aria-valuenow={m.progressPct} aria-valuemin={0} aria-valuemax={100}>
                        <i style={{ width: `${m.progressPct}%` }} />
                      </span>
                      <span className="xs strong">{m.progressPct}%</span>
                    </span>
                  )}
                </span>
              </>
            );
            return (
              <li key={m.id} className="soc-row" data-testid="colony-member">
                {m.isViewer ? <div className="soc-row__main">{row}</div> : <Link to={`/friends/${m.id}`} className="soc-row__main">{row}</Link>}
              </li>
            );
          })}
        </ul>
        <div className="card row row--between">
          <div>
            <h3>Show my progress</h3>
            <p className="small muted">Your colony only sees your goal's percentage, never the amount.</p>
          </div>
          <Switch checked={me.showProgress} onChange={(v) => void Promise.resolve(s.repo.setShowProgress(v)).catch(() => undefined)} label="Show my progress" />
        </div>
      </section>

      <section className="stack" aria-labelledby="goal-h">
        <h2 id="goal-h" className="group-label">
          Shared goal
        </h2>
        {d.goal ? (
          <SharedGoalCard goal={d.goal} />
        ) : (
          <div className="card stack">
            <p className="small muted">Something you all save for, each in your own pocket. Money never moves from one of you to another.</p>
            <Button variant="primary" icon={Plus} onClick={() => setProposing(true)}>
              Suggest a goal
            </Button>
          </div>
        )}
      </section>

      {ch && (
        <section className="card stack" aria-labelledby="ch-h">
          <h2 id="ch-h">This week's challenge</h2>
          <p className="strong">“{ch.title}”</p>
          <ul className="soc-list stack" style={{ gap: 6 }}>
            {d.members.map((m) => (
              <li key={m.id} className="row" style={{ gap: 8 }}>
                <Avatar user={s.world.users[m.id]} size={24} />
                <span className="grow small">{m.isViewer ? 'You' : firstNameOf(m.name)}</span>
                <span className={`soc-today ${ch.done.includes(m.id) ? 'soc-today--yes' : ''}`}>{ch.done.includes(m.id) ? <><Check size={14} aria-hidden /> Done</> : 'Not yet'}</span>
              </li>
            ))}
          </ul>
          <Button variant={ch.done.includes(s.viewer) ? 'secondary' : 'primary'} onClick={() => void Promise.resolve(s.repo.tickChallenge(d.colony.id)).catch(() => undefined)}>
            {ch.done.includes(s.viewer) ? 'Done. Undo' : 'I did it'}
          </Button>
          {allDone && (
            <div className="soc-reward" role="status">
              <Coffee size={28} aria-hidden />
              <span>The whole colony made it. Everyone gets a free coffee from our partner (demo card).</span>
            </div>
          )}
        </section>
      )}

      <section className="stack" aria-label="Invite and share">
        <Button icon={UserPlus} block disabled={d.members.length >= COLONY_MAX} onClick={() => setInviting(true)}>
          {d.members.length >= COLONY_MAX ? `The colony has ${COLONY_MAX} members` : 'Invite a friend'}
        </Button>
        <RecapButton detail={d} />
        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={async () => {
            const { returned } = await s.repo.leaveColony(d.colony.id);
            toast(returned > 0 ? `You left «${d.colony.name}». Your ${formatLei(returned)} from the shared goal went back to your pocket.` : `You left «${d.colony.name}».`);
            nav('/colonies', { replace: true });
          }}
        >
          <SignOutIcon size={18} aria-hidden /> Leave colony
        </button>
      </section>

      <InviteSheet open={inviting} onClose={() => setInviting(false)} colonyId={d.colony.id} code={d.colony.code} memberIds={d.members.map((m) => m.id)} />
      <ProposeGoalSheet open={proposing} onClose={() => setProposing(false)} colonyId={d.colony.id} />
      {ui}
      <RescuedMoment />
    </div>
  );
}

export function GoalPic({ goal, size = 56 }: { goal: Pick<SharedGoal, 'photo' | 'icon'>; size?: number }) {
  const { Icon } = GOAL_ICONS[goal.icon] ?? GOAL_ICONS.star;
  return (
    <span className="soc-goalpic" style={{ width: size, height: size }} aria-hidden>
      {goal.photo ? <img src={goal.photo} alt="" /> : <Icon size={Math.round(size * 0.56)} weight="duotone" />}
    </span>
  );
}

function SharedGoalCard({ goal }: { goal: SharedGoal }) {
  const pct = sharedPct(goal);
  return (
    <Link to={`/shared-goal/${goal.id}`} className="soc-goalcard" data-testid="shared-goal-card">
      <GoalPic goal={goal} />
      <span className="grow stack" style={{ gap: 6, minWidth: 0 }}>
        <span className="row row--between">
          <span className="strong truncate">{goal.name}</span>
          <span className="strong" style={{ color: 'var(--progress)' }}>
            {pct}%
          </span>
        </span>
        <span className="soc-bar" role="progressbar" aria-label={`${goal.name}: ${pct}%`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${pct}%` }} />
        </span>
        <span className="xs subtle">{plural(goal.participants.length, 'participant', 'participants')}</span>
      </span>
      <ChevronRight size={18} className="subtle" aria-hidden />
    </Link>
  );
}

function InviteSheet({ open, onClose, colonyId, code, memberIds }: { open: boolean; onClose: () => void; colonyId: string; code: string; memberIds: string[] }) {
  const s = useSocial();
  const toast = useToast();
  if (!s) return null;
  const link = `${window.location.origin}/colonies/invite/${code}`;
  const friends = friendsOf(s.world, s.viewer)
    .filter((id) => !memberIds.includes(id) && s.world.users[id])
    .map((id) => s.world.users[id])
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
  const sent = new Set(s.world.colonyInvites.filter((i) => i.colony === colonyId && i.status === 'pending').map((i) => i.to));
  return (
    <Sheet open={open} onClose={onClose} title="Invite a friend">
      <p className="small muted">Only friends who accepted your request. The invite shows up in their Requests.</p>
      <ul className="soc-list soc-list--sheet">
        {friends.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              className="soc-pick"
              disabled={sent.has(u.id)}
              onClick={async () => {
                try {
                  await s.repo.inviteToColony(colonyId, u.id);
                  toast(`Invite sent to ${firstNameOf(u.name)}.`);
                } catch (e) {
                  toast(e instanceof RuleError ? e.message : "Couldn't send it.", 'error');
                }
              }}
            >
              <Avatar user={u} size={34} />
              <span className="grow strong">{u.name}</span>
              <span className="small subtle">{sent.has(u.id) ? 'Invited' : 'Invite'}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button
        block
        icon={Copy}
        onClick={() =>
          void navigator.clipboard?.writeText(link).then(
            () => toast('Link copied.'),
            () => toast("Couldn't copy it.", 'error'),
          )
        }
      >
        Copy colony link
      </Button>
    </Sheet>
  );
}

/** "Vama Veche", a photo, 2,000 lei, July: proposed by one member, the others opt in. */
function ProposeGoalSheet({ open, onClose, colonyId }: { open: boolean; onClose: () => void; colonyId: string }) {
  const s = useSocial();
  const nav = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState(addMonths(todayKey(), 8));
  const [photo, setPhoto] = useState<string | null>(null);
  const [icon, setIcon] = useState('beach');
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  if (!s) return null;
  const amount = parseLei(target);
  const onPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // a small square thumbnail, so the picture fits next to everything else in local storage
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 160;
      const side = Math.min(img.width, img.height);
      c.getContext('2d')?.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 160, 160);
      setPhoto(c.toDataURL('image/jpeg', 0.8));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  };
  const icons = ['beach', 'plane', 'ticket', 'home', 'star', 'gift'].filter((k) => GOAL_ICONS[k]);
  return (
    <Sheet open={open} onClose={onClose} title="New shared goal">
      <div className="stack-lg">
        <TextField label="What are you saving for?" placeholder="e.g. Vama Veche" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="stack">
          <p className="label">Photo</p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="soc-cheer" onClick={() => file.current?.click()}>
              <Camera size={18} aria-hidden /> {photo ? 'Another photo' : 'Choose a photo'}
            </button>
            {icons.map((k) => (
              <button key={k} type="button" aria-pressed={!photo && icon === k} aria-label={`Icon: ${k}`} className="soc-cheer" style={!photo && icon === k ? { borderColor: 'var(--struct)', background: 'var(--struct-soft)' } : undefined} onClick={() => (setIcon(k), setPhoto(null))}>
                <GoalPic goal={{ photo: null, icon: k }} size={26} />
              </button>
            ))}
            <input ref={file} type="file" accept="image/*" hidden onChange={onPhoto} />
          </div>
          {photo && <GoalPic goal={{ photo, icon }} size={72} />}
        </div>
        <TextField label="Target" inputMode="decimal" suffix="lei" placeholder="2000" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} />
        <TextField label="By when" type="date" min={todayKey()} value={date} onChange={(e) => setDate(e.target.value || date)} />
        <p className="small muted">The target is split evenly between everyone who joins. Anyone can change their share.</p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <Button
          variant="primary"
          block
          disabled={!name.trim() || !amount}
          onClick={async () => {
            try {
              const g = await s.repo.proposeSharedGoal(colonyId, { name, photo, icon, target: amount!, date });
              onClose();
              toast('Goal suggested. The others can join whenever they like.');
              nav(`/shared-goal/${g.id}`);
            } catch (e) {
              setError(e instanceof RuleError ? e.message : "Couldn't suggest it.");
            }
          }}
        >
          Suggest goal
        </Button>
      </div>
    </Sheet>
  );
}

/** P1.4: a picture for Instagram Stories: the colony's streak, the shared goal's %, Kip. Never amounts. */
function RecapButton({ detail }: { detail: NonNullable<ReturnType<typeof colonyDetail>> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      block
      icon={Share}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const blob = await recapImage({ colony: detail.colony.name, streak: detail.streak, goal: detail.goal ? { name: detail.goal.name, pct: sharedPct(detail.goal) } : null });
          const file = new File([blob], 'kip-recap.png', { type: 'image/png' });
          if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Kip' });
          else {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'kip-recap.png';
            a.click();
            URL.revokeObjectURL(a.href);
            toast('Image downloaded. You can post it to your Stories.');
          }
        } catch {
          /* closed the share sheet */
        } finally {
          setBusy(false);
        }
      }}
    >
      Weekly recap
    </Button>
  );
}
