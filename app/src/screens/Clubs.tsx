// Clubs: /clubs (yours, the ones you can rejoin, the ones to unlock), /clubs/:slug (a club and its
// promotions) and /promotions. Everything comes from the live backend (lib/clubs/api.ts): the
// slots, the pause and the codes are decided on the server; the clubs and offers are config.ts.
import { motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Copy, Gift, Lock, Users } from '@/lib/icons';
import { Banner, Button, ConfirmDialog, EmptyState, ProgressBar, Skeleton, TopBar, useToast } from '../components/ui';
import { primaryGoal } from '../data/selectors';
import { useData, useStore } from '../data/store';
import { claimPromo, clubsErrorText, joinClub, leaveClub, useClubs } from '../lib/clubs/api';
import { CLUB_BY_SLUG, CLUBS, COMEBACK_DAYS } from '../lib/clubs/config';
import { claimAction, clubForGoal, daysFromTo, daysUntilNextMonth, formatMembers, joinNote, membershipOf, monthName, monthOf, newPromoCount, promotionsFor } from '../lib/clubs/rules';
import type { Club, ClubSlug, ClubsState, MembershipStatus, Promo } from '../lib/clubs/types';
import { GOAL_ICONS } from '../lib/goalIcons';
import { GOAL_PALETTE } from '../lib/goalLook';
import '../styles/clubs.css';

const longDate = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortDate = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** Clubs live on the server, so only a signed-in (remote) account has them. */
function useMyClubs() {
  const { account } = useStore();
  const owner = account?.remote ? account.id : null;
  return { owner, ...useClubs(owner) };
}

// ---------- pieces ----------

export function ClubTile({ club, size = 44 }: { club: Club; size?: number }) {
  const Icon = GOAL_ICONS[club.icon]?.Icon ?? GOAL_ICONS.star.Icon;
  const pal = GOAL_PALETTE[club.colour];
  return (
    <span className="club-tile" style={{ width: size, height: size, background: pal.fill, color: '#0f2540' }} aria-hidden>
      <Icon size={size * 0.55} weight="duotone" />
    </span>
  );
}

function Kip({ pose = 'celebrate', size = 84 }: { pose?: string; size?: number }) {
  return <img className="club-kip" src={`/mascot/pose-${pose}.webp`} alt="" width={size} height={size} />;
}

function StatusPill({ status }: { status: MembershipStatus }) {
  return <span className={`club-pill club-pill--${status}`}>{status === 'active' ? 'Member' : status === 'paused' ? 'Paused' : 'Lost'}</span>;
}

function useJoin() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const join = async (club: Club) => {
    setBusy(club.slug);
    try {
      await joinClub(club.slug);
      toast(`You joined the ${club.name}`);
    } catch (e) {
      toast(clubsErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  return { join, busy };
}

function PromoCard({ promo, status, code, lock, showClub }: { promo: Promo; status: MembershipStatus | null; code?: string; lock?: string | null; showClub?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const club = CLUB_BY_SLUG[promo.club];
  const tint = GOAL_PALETTE[club.colour].tint;
  const action = claimAction(status, !!code);
  const Logo = promo.logo;
  const claim = async () => {
    setBusy(true);
    try {
      await claimPromo(promo.promoId);
    } catch (e) {
      toast(clubsErrorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="promo glass" data-promo={promo.promoId}>
      <div className="promo__head">
        <span className="promo__logo" style={{ background: tint }} aria-hidden>
          <Logo size={24} weight="duotone" />
        </span>
        <div className="grow">
          <div className="promo__company">
            {promo.company}
            <span className="soc-demo">Demo</span>
            {promo.isNew && <span className="promo__new">New</span>}
          </div>
          <div className="promo__title">{promo.title}</div>
          {showClub && (
            <Link className="promo__club" to={`/clubs/${club.slug}`}>
              {club.name}
            </Link>
          )}
        </div>
        <span className="promo__discount">{promo.discount}</span>
      </div>
      <p className="promo__desc">{promo.description}</p>
      <dl className="promo__meta">
        <div>
          <dt>Valid</dt>
          <dd>
            {shortDate(promo.validFrom)} to {shortDate(promo.validTo)}
          </dd>
        </div>
        <div>
          <dt>Conditions</dt>
          <dd>{promo.conditions}</dd>
        </div>
        {promo.codeLimit && (
          <div>
            <dt>Codes</dt>
            <dd>Limited to {promo.codeLimit}</dd>
          </div>
        )}
      </dl>
      {action === 'show-code' && code ? (
        <div className="promo__code">
          <span>
            Your code <strong data-code>{code}</strong>
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon={Copy}
            onClick={() => {
              void navigator.clipboard?.writeText(code).then(() => toast('Code copied'), () => undefined);
            }}
          >
            Copy
          </Button>
        </div>
      ) : action === 'claim' ? (
        <Button variant="primary" block loading={busy} onClick={claim}>
          Claim
        </Button>
      ) : (
        <div className="promo__lock">
          <Lock size={16} aria-hidden />
          {status === 'paused' ? 'Paused: win your comeback to claim again' : (lock ?? 'Join this club to claim')}
        </div>
      )}
    </article>
  );
}

/** "What you keep": the streak restarts, the clubs wait. Blame-free, every number spelled out. */
function ComebackCard({ state }: { state: ClubsState }) {
  const cb = state.comeback;
  if (!cb) return null;
  const paused = state.memberships.filter((m) => m.status === 'paused').map((m) => CLUB_BY_SLUG[m.slug]).filter(Boolean);
  return (
    <section className="club-card club-card--pause glass" aria-labelledby="pause-title">
      <div className="club-card__row">
        <Kip pose="ice-floe" size={72} />
        <div className="grow">
          <h2 id="pause-title">Your clubs are paused, not lost</h2>
          <p>
            Your streak starts again from day 1. Your clubs are paused, not lost: save {COMEBACK_DAYS} days in a row by {longDate(cb.until)} and you keep all of
            them.
          </p>
        </div>
      </div>
      <div className="club-comeback">
        <div className="club-comeback__label">
          <strong>
            Comeback: {cb.progress} / {cb.needed} days
          </strong>
          <span> · {days(cb.daysLeft)} left</span>
        </div>
        <ProgressBar value={cb.progress / cb.needed} label="Comeback progress" />
        {state.inDanger && <p className="club-note">Yesterday is still open. A friend's freeze can cover it and keep your comeback going.</p>}
      </div>
      <ul className="club-paused-list">
        {paused.map((c) => (
          <li key={c.slug}>
            <Link to={`/clubs/${c.slug}`}>
              <ClubTile club={c} size={28} /> {c.name}
              <span className="club-note">promotions still visible</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const seenKey = (owner: string, what: string) => `kip:clubs:${owner}:${what}`;
function useOnce(key: string | null): [boolean, () => void] {
  const read = () => {
    try {
      return !!key && localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  };
  const [seen, setSeen] = useState(read);
  useEffect(() => setSeen(read()), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [
    seen,
    () => {
      try {
        if (key) localStorage.setItem(key, '1');
      } catch {
        /* private mode: it just shows again */
      }
      setSeen(true);
    },
  ];
}

function Moment({ title, body, onClose, children }: { title: string; body?: string; onClose?: () => void; children?: ReactNode }) {
  return (
    <motion.section className="club-card club-card--moment glass" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} aria-live="polite">
      <div className="club-card__row">
        <motion.div initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
          <Kip />
        </motion.div>
        <div className="grow">
          <h2>{title}</h2>
          {body && <p>{body}</p>}
        </div>
      </div>
      {children}
      {onClose && (
        <Button size="sm" variant="ghost" onClick={onClose}>
          Got it
        </Button>
      )}
    </motion.section>
  );
}

function MonthBanner({ state }: { state: ClubsState }) {
  if (state.today.slice(8, 10) !== '01') return null;
  const month = monthOf(state.today);
  const mine = state.memberships.filter((m) => m.status === 'active').reduce((n, m) => n + newPromoCount(CLUB_BY_SLUG[m.slug], month), 0);
  return (
    <Banner tone="info" icon={Gift}>
      New month, new promotions: {mine} new in your clubs for {monthName(month)}.
    </Banner>
  );
}

function ClubRow({ club, state, children }: { club: Club; state: ClubsState; children?: ReactNode }) {
  const m = membershipOf(state, club.slug);
  const friends = state.friends[club.slug]?.count ?? 0;
  const count = promotionsFor(club, monthOf(state.today)).length;
  const member = m?.status === 'active' || m?.status === 'paused';
  const fresh = newPromoCount(club, monthOf(state.today));
  return (
    <li className="club-row glass">
      <Link to={`/clubs/${club.slug}`} className="club-row__link">
        <ClubTile club={club} />
        <div className="grow">
          <div className="club-row__name">
            {club.name} {m && m.status !== 'active' && <StatusPill status={m.status} />}
          </div>
          {/* members get the details; for everyone else the "new" badge says it, so no extra line */}
          {member && (
            <div className="club-row__sub">
              {count} promotions this month{friends ? ` · ${friends} ${friends === 1 ? 'friend' : 'friends'} here` : ''}
            </div>
          )}
        </div>
        {!member && fresh > 0 && (
          <span className="club-row__badge">
            <Gift size={13} aria-hidden /> {fresh} new
          </span>
        )}
        <ChevronRight size={18} aria-hidden />
      </Link>
      {children}
    </li>
  );
}

/** progress toward the slot this club needs, with the days left, or the Join/Rejoin button */
function Unlock({ club, state, status }: { club: Club; state: ClubsState; status: MembershipStatus | null }) {
  const { join, busy } = useJoin();
  const left = state.freeSlotIn;
  if (left === 0)
    return (
      <div className="club-row__foot">
        <Button size="sm" variant="primary" loading={busy === club.slug} onClick={() => join(club)}>
          {status === 'lost' ? 'Rejoin' : 'Join'}
        </Button>
      </div>
    );
  const target = left == null ? 0 : state.streak + left;
  if (left == null)
    return (
      <div className="club-row__foot">
        <span className="club-note">{joinNote(club, status, left)}</span>
      </div>
    );
  return (
    <div className="club-row__foot club-row__foot--progress">
      <div className="club-progress">
        <ProgressBar value={target ? state.streak / target : 0} label={`Progress to the ${club.name}`} />
        <span className="club-progress__num">
          {state.streak}
          <small>/{target}</small>
        </span>
      </div>
      <span className="club-row__left">
        <Lock size={14} aria-hidden />
        <b>
          {left} {left === 1 ? 'day' : 'days'}
        </b>{' '}
        {status === 'lost' ? 'to rejoin' : 'to join'}
      </span>
    </div>
  );
}

function Loading({ error }: { error: string | null }) {
  if (error) return <Banner tone="warn">{error}</Banner>;
  return (
    <div className="club-stack" aria-busy="true">
      <Skeleton h={88} r={24} />
      <Skeleton h={72} r={24} />
      <Skeleton h={72} r={24} />
    </div>
  );
}

function NoClubs() {
  return <EmptyState icon={Users} title="Clubs need a Kip account" body="Sign in with your phone number to join clubs and claim their promotions." />;
}

// ---------- /clubs ----------

export function Clubs() {
  const { owner, state, error } = useMyClubs();
  const data = useData();
  const { join, busy } = useJoin();
  const [wonSeen, markWon] = useOnce(owner && state?.comebackWonOn ? seenKey(owner, `won-${state.comebackWonOn}`) : null);
  if (!owner) return <div className="screen"><TopBar title="Clubs" /><NoClubs /></div>;
  if (!state) return <div className="screen"><TopBar title="Clubs" /><Loading error={error} /></div>;

  const mine = state.memberships.filter((m) => m.status !== 'lost');
  const lost = state.memberships.filter((m) => m.status === 'lost');
  const others = CLUBS.filter((c) => !membershipOf(state, c.slug));
  const free = state.slots - state.active;
  const suggested = clubForGoal(CLUBS, primaryGoal(data.goals));
  const suggest = suggested && !membershipOf(state, suggested.slug) ? suggested : null;
  const goalName = primaryGoal(data.goals)?.name;
  const recentWin = !!state.comebackWonOn && daysFromTo(state.comebackWonOn, state.today) <= 7 && !wonSeen;

  return (
    <div className="screen clubs">
      <h1 className="clubs__title">Clubs</h1>
      <p className="clubs__lede">
        {state.active} of {state.slots} {state.slots === 1 ? 'slot' : 'slots'} used · {state.streak}-day streak
        {state.nextSlot && ` · next slot in ${days(state.nextSlot.days)}`}
      </p>
      <MonthBanner state={state} />
      {recentWin && <Moment title="You're back! All your clubs are yours again." body="Fourteen days in a row. Every club you had is active again." onClose={markWon} />}
      <ComebackCard state={state} />
      {free > 0 && (
        <Moment
          title={state.active === 0 ? 'Pick your first club' : 'You unlocked a new club! Pick where you go.'}
          body={state.active === 0 ? 'Your streak opens more slots: 2 at 14 days, 3 at 30.' : undefined}
        >
          {suggest && (
            <div className="club-suggest">
              <ClubTile club={suggest} size={36} />
              <span className="grow">
                Saving for {suggest.slug === 'erasmus' ? 'Erasmus' : (goalName ?? suggest.name)}? Start with the {suggest.name}.
              </span>
              <Button size="sm" variant="primary" loading={busy === suggest.slug} onClick={() => join(suggest)}>
                Join
              </Button>
            </div>
          )}
        </Moment>
      )}

      <section aria-labelledby="yours">
        <h2 id="yours" className="clubs__h2">Your clubs</h2>
        {mine.length ? (
          <ul className="club-list">
            {mine.map((m) => (
              <ClubRow key={m.slug} club={CLUB_BY_SLUG[m.slug]} state={state} />
            ))}
          </ul>
        ) : (
          <p className="club-note">No clubs yet. Pick one below.</p>
        )}
      </section>

      {lost.length > 0 && (
        <section aria-labelledby="rejoin">
          <h2 id="rejoin" className="clubs__h2">Clubs you can rejoin</h2>
          <ul className="club-list">
            {lost.map((m) => (
              <ClubRow key={m.slug} club={CLUB_BY_SLUG[m.slug]} state={state}>
                <Unlock club={CLUB_BY_SLUG[m.slug]} state={state} status="lost" />
              </ClubRow>
            ))}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section aria-labelledby="unlock">
          <h2 id="unlock" className="clubs__h2">Clubs to unlock</h2>
          <ul className="club-list">
            {others.map((c) => (
              <ClubRow key={c.slug} club={c} state={state}>
                <Unlock club={c} state={state} status={null} />
              </ClubRow>
            ))}
          </ul>
        </section>
      )}

      <Link to="/promotions" className="club-row glass club-row__link">
        <Gift size={22} aria-hidden />
        <span className="grow">All promotions</span>
        <ChevronRight size={18} aria-hidden />
      </Link>
    </div>
  );
}

// ---------- /clubs/:slug ----------

export function ClubDetail() {
  const { slug } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { owner, state, error } = useMyClubs();
  const { join, busy } = useJoin();
  const [leaving, setLeaving] = useState(false);
  const club = CLUB_BY_SLUG[slug as ClubSlug];
  if (!club) return <div className="screen"><TopBar title="Clubs" /><EmptyState icon={Users} title="No such club" body="It may have moved." /></div>;
  if (!owner) return <div className="screen"><TopBar title={club.name} /><NoClubs /></div>;
  if (!state) return <div className="screen"><TopBar title={club.name} /><Loading error={error} /></div>;

  const m = membershipOf(state, club.slug);
  const status = m?.status ?? null;
  const month = monthOf(state.today);
  const promos = promotionsFor(club, month);
  const members = state.counts[club.slug] ?? 0;
  const friends = state.friends[club.slug];
  const lock = joinNote(club, status, state.freeSlotIn);
  const codes = new Map(state.claims.map((c) => [c.promoId, c.code]));
  const next = daysUntilNextMonth(state.today);

  return (
    <div className="screen clubs">
      <TopBar title={club.name} />
      <header className="club-hero glass" style={{ background: `linear-gradient(160deg, ${GOAL_PALETTE[club.colour].tint}, rgba(255,255,255,0.6))` }}>
        <ClubTile club={club} size={72} />
        <h1>{club.name}</h1>
        <p>{club.blurb}</p>
        <div className="club-hero__facts">
          <span>{formatMembers(members)}</span>
          {friends && friends.count > 0 && (
            <span>
              <Users size={16} aria-hidden /> {friends.count} {friends.count === 1 ? 'friend is' : 'friends are'} here: {friends.names.join(', ')}
            </span>
          )}
        </div>
        {status === 'active' ? (
          <div className="club-hero__action">
            <StatusPill status="active" />
            <Button size="sm" variant="ghost" onClick={() => setLeaving(true)}>
              Leave club
            </Button>
          </div>
        ) : status === 'paused' ? (
          <div className="club-hero__action">
            <StatusPill status="paused" />
            {state.comeback && (
              <span className="club-note">
                Comeback: {state.comeback.progress} / {state.comeback.needed} days · {days(state.comeback.daysLeft)} left
              </span>
            )}
          </div>
        ) : state.freeSlotIn === 0 ? (
          <Button variant="primary" block loading={busy === club.slug} onClick={() => join(club)}>
            {status === 'lost' ? `Rejoin the ${club.name}` : `Join the ${club.name}`}
          </Button>
        ) : (
          <div className="club-hero__lock">
            <Lock size={16} aria-hidden /> {lock}
          </div>
        )}
      </header>

      <section aria-labelledby="promos">
        <div className="clubs__h2row">
          <h2 id="promos" className="clubs__h2">{monthName(month)} promotions</h2>
          <span className="club-note">New promotions in {days(next)}</span>
        </div>
        <div className="club-stack">
          {promos.map((p) => (
            <PromoCard key={p.promoId} promo={p} status={status} code={codes.get(p.promoId)} lock={lock} />
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={leaving}
        title={`Leave the ${club.name}?`}
        body="Your codes stay yours. You can join again when you have a free slot."
        confirmLabel="Leave"
        cancelLabel="Stay"
        onClose={() => setLeaving(false)}
        onConfirm={async () => {
          setLeaving(false);
          try {
            await leaveClub(club.slug);
            nav('/clubs');
          } catch (e) {
            toast(clubsErrorText(e), 'error');
          }
        }}
      />
    </div>
  );
}

// ---------- /promotions ----------

export function Promotions() {
  const { owner, state, error } = useMyClubs();
  if (!owner) return <div className="screen"><TopBar title="Promotions" /><NoClubs /></div>;
  if (!state) return <div className="screen"><TopBar title="Promotions" /><Loading error={error} /></div>;
  const month = monthOf(state.today);
  const codes = new Map(state.claims.map((c) => [c.promoId, c.code]));
  const status = (s: ClubSlug) => membershipOf(state, s)?.status ?? null;
  const all = CLUBS.flatMap((c) => promotionsFor(c, month));
  const yours = all.filter((p) => status(p.club) === 'active' || codes.has(p.promoId));
  const elsewhere = all.filter((p) => status(p.club) !== 'active' && !codes.has(p.promoId) && p.isNew);
  return (
    <div className="screen clubs">
      <h1 className="clubs__title">Promotions</h1>
      <MonthBanner state={state} />
      <p className="clubs__lede">New promotions in {days(daysUntilNextMonth(state.today))}</p>
      <section aria-labelledby="your-promos">
        <h2 id="your-promos" className="clubs__h2">Your promotions</h2>
        {yours.length ? (
          <div className="club-stack">
            {yours.map((p) => (
              <PromoCard key={p.promoId} promo={p} status={status(p.club)} code={codes.get(p.promoId)} showClub />
            ))}
          </div>
        ) : (
          <p className="club-note">
            Join a club to see its promotions here. <Link to="/clubs">Clubs</Link>
          </p>
        )}
      </section>
      <section aria-labelledby="new-elsewhere">
        <h2 id="new-elsewhere" className="clubs__h2">New in clubs you're not in</h2>
        <div className="club-stack">
          {elsewhere.map((p) => (
            <PromoCard key={p.promoId} promo={p} status={status(p.club)} lock={joinNote(CLUB_BY_SLUG[p.club], status(p.club), state.freeSlotIn)} showClub />
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------- the home row ----------

/** One small line under the goals card: "Clubs: 2 of 3 slots". */
export function ClubsHomeRow() {
  const { owner, state } = useMyClubs();
  if (!owner || !state) return null;
  const first = state.today.slice(8, 10) === '01';
  const sub = state.comeback
    ? `Comeback ${state.comeback.progress} / ${state.comeback.needed}`
    : first
      ? 'New promotions today'
      : state.slots > state.active
        ? 'A slot is free'
        : state.nextSlot
          ? `Next slot in ${days(state.nextSlot.days)}`
          : '';
  return (
    <Link to="/clubs" className="club-home glass" data-testid="clubs-home-row">
      <Users size={20} aria-hidden />
      <span className="grow">
        Clubs: {state.active} of {state.slots} {state.slots === 1 ? 'slot' : 'slots'}
      </span>
      {sub && <span className="club-note">{sub}</span>}
      <ChevronRight size={16} aria-hidden />
    </Link>
  );
}
