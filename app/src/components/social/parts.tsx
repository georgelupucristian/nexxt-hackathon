// The small pieces every social screen shares: avatars, the streak and "saved today" marks, the
// freeze badges, Kip's full-screen moments, giving and asking for a freeze, cheers and
// the simulated money sheet. Never an amount of someone else's money anywhere in here.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Circle, LifeBuoy, Lightning, Megaphone, type LucideIcon } from '@/lib/icons';
import { AmountInput, QuickAmounts } from '../MoneySheets';
import { Seal, type SealState } from '../mascot/Seal';
import { Button, ConfirmDialog, Sheet, useToast } from '../ui';
import { formatLei, parseLei } from '../../lib/money';
import { plural } from '../../lib/plural';
import { CHEERS, canCheer, firstNameOf, rescuedLine, RuleError, saverLine } from '../../lib/social/rules';
import type { CheerKind, SocialUser, UserId } from '../../lib/social/types';
import { connected, everyone, statusOf } from '../../lib/social/view';
import { addDays, fromKey, toKey } from '../../lib/dates';
import { GOAL_PALETTE } from '../../lib/goalLook';
import { useSocial } from './SocialProvider';
import '../../styles/social.css';

const dayMonthFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });
/** "5 November" */
export const dayMonth = (d: Date | string) => dayMonthFmt.format(typeof d === 'string' ? new Date(d) : d);

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toLocaleUpperCase('en-GB'))
    .join('');

export function Avatar({ user, size = 44 }: { user: Pick<SocialUser, 'name' | 'hue'> | undefined; size?: number }) {
  const look = GOAL_PALETTE[user?.hue ?? 'cer'];
  return (
    <span className="soc-avatar" style={{ width: size, height: size, background: look.fill, fontSize: Math.round(size * 0.36) }} aria-hidden>
      {initials(user?.name ?? '?')}
    </span>
  );
}

/** The run, with the same flame as the home card. */
export function StreakCount({ n, big }: { n: number; big?: boolean }) {
  return (
    <span className={`soc-streak ${big ? 'soc-streak--big' : ''}`} aria-label={`${plural(n, 'day', 'days')} in a row`}>
      <img src="/mascot/flame.webp" alt="" aria-hidden />
      <b aria-hidden>{n}</b>
    </span>
  );
}

/** Saved today or not: an icon and words, never the colour alone. */
export function SavedToday({ yes, frozen }: { yes: boolean; frozen?: boolean }) {
  if (frozen && !yes)
    return (
      <span className="soc-today soc-today--frozen">
        <img src="/mascot/ice.webp" alt="" aria-hidden /> Covered by a freeze today
      </span>
    );
  return yes ? (
    <span className="soc-today soc-today--yes">
      <Check size={14} aria-hidden /> Saved today
    </span>
  ) : (
    <span className="soc-today">
      <Circle size={14} aria-hidden /> Not yet today
    </span>
  );
}

export function DangerBadge() {
  return (
    <span className="soc-badge soc-badge--danger">
      <LifeBuoy size={13} aria-hidden /> In danger
    </span>
  );
}

export function FreezeActiveBadge() {
  return (
    <span className="soc-badge soc-badge--freeze">
      <img src="/mascot/ice.webp" alt="" aria-hidden /> Freeze on
    </span>
  );
}

/** A small snowflake: has a 1-day Freeze ready (so whoever is in danger knows whom to ask). */
export function FreezeDot() {
  return (
    <span className="soc-freezedot" title="Has a 1-day Freeze">
      <img src="/mascot/ice.webp" alt="" aria-hidden />
      <span className="sr-only">Has a 1-day Freeze</span>
    </span>
  );
}

/** Only on the simulated money screens (shared goals, a simulated person's saving). */
export function DemoLabel() {
  return <span className="soc-demo">Demo</span>;
}

/**
 * The viewer's freezes: the 1-day one ("1", or "0, recharges on 5 November") and, once earned,
 * the 1-week one with its single button (the demo only, for now).
 */
export function FreezeChip() {
  const s = useSocial();
  const toast = useToast();
  if (!s) return null;
  const st = statusOf(s.world, s.viewer, s.now);
  const back = st.freezes.dayRechargeAt;
  const week = st.freezes;
  const today = toKey(s.now);
  const running = !!week.weekFrom && today >= week.weekFrom && today <= addDays(week.weekFrom, 6);
  return (
    <div className="soc-freezechip" data-testid="freeze-chip">
      <img src="/mascot/ice.webp" alt="" aria-hidden />
      <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
        <p className="soc-freezechip__title">
          1-day Freeze: <b data-testid="freeze-count">{st.freezes.day}</b>
        </p>
        <p className="soc-freezechip__sub">{st.freezes.day === 1 ? 'Ready to use. It kicks in on its own if you miss a day.' : back ? `Recharges on ${dayMonth(back)}` : 'Recharges soon'}</p>
        {running && <p className="soc-freezechip__sub">1-week Freeze on, until {dayMonth(fromKey(addDays(week.weekFrom!, 6)))}.</p>}
        {week.week === 1 && !running && s.simulated && (
          <>
            <p className="soc-freezechip__title">1-week Freeze: 1</p>
            <Button
              size="sm"
              variant="primary"
              style={{ whiteSpace: 'normal' }}
              onClick={async () => {
                try {
                  await s.repo.activateWeekFreeze();
                  toast('Your 1-week Freeze is on. It covers today and the next 6 days.');
                } catch (e) {
                  toast(e instanceof RuleError ? e.message : 'It didn\'t start.', 'error');
                }
              }}
            >
              Turn on the 1-week Freeze
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Kip's full-screen moments ----------

export interface Moment {
  key: string;
  title: string;
  sub?: string;
  /** Kip's state ("wave" for the rescued, "celebrate" for the giver and milestones) */
  kip: SealState;
  /** a big picture over Kip's shoulder (the snowflake for a freeze) */
  badge?: 'ice' | 'flame';
  /** e.g. "51%" for a shared goal */
  big?: string;
}

/** Duolingo-style: Kip comes in, one line, Continue. No confetti on money (see Celebration.tsx). */
export function SocialMoment({ moment, onClose }: { moment: Moment | null; onClose: () => void }) {
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!moment) return;
    const t = window.setTimeout(() => go.current?.focus(), 500);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [moment, onClose]);
  return createPortal(
    <AnimatePresence>
      {moment && (
        <motion.div key={moment.key} className="soc-moment" role="dialog" aria-modal="true" aria-labelledby="soc-moment-title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="soc-moment__inner">
            <div className="soc-moment__kip">
              {moment.badge && (
                <motion.img
                  src={moment.badge === 'ice' ? '/mascot/ice.webp' : '/mascot/flame.webp'}
                  alt=""
                  className="soc-moment__badge"
                  initial={{ scale: 0.2, opacity: 0, rotate: -30 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.35 }}
                />
              )}
              <Seal state={moment.kip} size={170} appear="pop" title="" />
            </div>
            {moment.big && (
              <motion.p className="soc-moment__big" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.25 }}>
                {moment.big}
              </motion.p>
            )}
            <motion.h2 id="soc-moment-title" className="soc-moment__title" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
              {moment.title}
            </motion.h2>
            {moment.sub && (
              <motion.p className="soc-moment__sub" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
                {moment.sub}
              </motion.p>
            )}
          </div>
          <motion.button ref={go} type="button" className="btn btn--primary btn--lg soc-moment__go" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} onClick={onClose}>
            Continue
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------- giving a freeze ----------

/**
 * "Give them your freeze": the warning first (you stay without protection until it recharges), then
 * the gift and Kip's moment for the giver.
 */
export function useGiveFreeze() {
  const s = useSocial();
  const toast = useToast();
  const [to, setTo] = useState<UserId | null>(null);
  const [moment, setMoment] = useState<Moment | null>(null);
  const until = s ? new Date(s.now.getTime() + 7 * 86_400_000) : new Date();
  const user = to && s ? s.world.users[to] : null;
  const ui = (
    <>
      <ConfirmDialog
        open={!!to}
        title={user ? `Your freeze for ${firstNameOf(user.name)}?` : ''}
        body={
          <div className="stack">
            <p className="soc-warning" data-testid="give-warning">
              If you give away your freeze, you're unprotected until {dayMonth(until)}.
            </p>
            <p className="small">It only counts if {user ? firstNameOf(user.name) : ''} saves in the next 24 hours. Otherwise it comes back to you.</p>
          </div>
        }
        confirmLabel="Give your freeze"
        cancelLabel="Not now"
        onClose={() => setTo(null)}
        onConfirm={async () => {
          if (!s || !to || !user) return;
          try {
            await s.repo.giveFreeze(to);
            setTo(null);
            setMoment({ key: `gave-${to}-${Date.now()}`, kip: 'celebrate', badge: 'ice', title: saverLine(user), sub: `Your freeze is with ${firstNameOf(user.name)} now. It counts once they save.` });
          } catch (e) {
            setTo(null);
            toast(e instanceof RuleError ? e.message : 'Couldn\'t give the freeze. Try again.', 'error');
          }
        }}
      />
      <SocialMoment moment={moment} onClose={() => setMoment(null)} />
    </>
  );
  return { give: setTo, ui };
}

/** The rescued person's moment, once: "Mihai gave you his freeze", Kip waving. */
export function RescuedMoment() {
  const s = useSocial();
  const gift = s ? statusOf(s.world, s.viewer, s.now).danger?.gift ?? null : null;
  const key = gift ? `received-${gift.id}` : '';
  const show = !!s && !!gift && !s.world.seen[key];
  const giver = gift && s ? s.world.users[gift.from] : null;
  return (
    <SocialMoment
      moment={show && giver ? { key, kip: 'wave', badge: 'ice', title: rescuedLine(giver), sub: 'Save something today and your streak is safe.' } : null}
      onClose={() => s?.repo.markSeen(key)}
    />
  );
}

// ---------- asking for a freeze ----------

export function AskFreezeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSocial();
  const toast = useToast();
  const [picked, setPicked] = useState<UserId[]>([]);
  const people = s
    ? everyone(s.world)
        .filter((u) => u.id !== s.viewer && connected(s.world, s.viewer, u.id))
        .map((u) => ({ u, st: statusOf(s.world, u.id, s.now) }))
        // the ones who can actually help first
        .sort((a, b) => Number(b.st.hasDayFreeze) - Number(a.st.hasDayFreeze) || a.u.name.localeCompare(b.u.name, 'en-GB'))
    : [];
  useEffect(() => {
    if (open) setPicked(people.filter((p) => p.st.hasDayFreeze).slice(0, 3).map((p) => p.u.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!s) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Ask for a freeze">
      <p className="small muted">Pick your friends. We only send them "Can you help me with a freeze?", nothing else.</p>
      <ul className="soc-list soc-list--sheet" role="group" aria-label="Friends">
        {people.map(({ u, st }) => {
          const on = picked.includes(u.id);
          return (
            <li key={u.id}>
              <button type="button" role="checkbox" aria-checked={on} className="soc-pick" onClick={() => setPicked(on ? picked.filter((x) => x !== u.id) : [...picked, u.id])}>
                <Avatar user={u} size={36} />
                <span className="grow">
                  <span className="strong">{u.name}</span>
                  <span className="small subtle">{st.hasDayFreeze ? 'Has a 1-day Freeze' : 'No freeze right now'}</span>
                </span>
                <span className={`soc-check ${on ? 'is-on' : ''}`} aria-hidden>
                  {on && <Check size={14} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Button
        variant="primary"
        block
        disabled={!picked.length}
        onClick={async () => {
          try {
            await s.repo.askForFreeze(picked);
            onClose();
            toast(picked.length === 1 ? 'Request sent.' : `Request sent to ${picked.length} friends.`);
          } catch (e) {
            toast(e instanceof RuleError ? e.message : 'It didn\'t send. Try again.', 'error');
          }
        }}
      >
        Send request
      </Button>
    </Sheet>
  );
}

// ---------- cheers ----------

const CHEER_ICON: Record<CheerKind, ReactNode> = {
  bravo: <Megaphone size={18} aria-hidden />,
  poti: <Lightning size={18} aria-hidden />,
  aici: <img src="/mascot/ice.webp" alt="" aria-hidden className="soc-cheer__ice" />,
};

/** Three predefined reactions, no free text; at most 3 a day to the same friend. */
export function CheerButtons({ to, onSent }: { to: UserId; onSent?: () => void }) {
  const s = useSocial();
  const toast = useToast();
  if (!s) return null;
  const left = canCheer(s.world.cheers, s.viewer, to, toKey(s.now));
  return (
    <div className="soc-cheers" role="group" aria-label="Cheer on">
      {CHEERS.map((c) => (
        <button
          key={c.kind}
          type="button"
          className="soc-cheer"
          disabled={!left}
          onClick={async () => {
            try {
              await s.repo.cheer(to, c.kind);
              toast(`You sent "${c.text}"`);
              onSent?.();
            } catch (e) {
              toast(e instanceof RuleError ? e.message : 'It didn\'t send.', 'error');
            }
          }}
        >
          {CHEER_ICON[c.kind]}
          <span>{c.text}</span>
        </button>
      ))}
      {!left && <p className="xs subtle">You've already sent 3 cheers today. You can send more tomorrow.</p>}
    </div>
  );
}

// ---------- simulated money ----------

/** Putting in or taking out simulated money (the demo's shared goals). Always labelled Demo. */
export function DemoMoneySheet({
  open,
  onClose,
  title,
  verb,
  max,
  note,
  onSubmit,
  outgoing,
  demo = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** "Deposit" / "Withdraw" */
  verb: string;
  max?: number;
  note: ReactNode;
  onSubmit: (amount: number) => void | Promise<void>;
  outgoing?: boolean;
  /** false on the live backend: real money, no "Demo" label */
  demo?: boolean;
}) {
  const [raw, setRaw] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const amount = parseLei(raw) ?? 0;
  const tooMuch = max !== undefined && amount > max;
  useEffect(() => {
    if (!open) return;
    setRaw('');
    const t = window.setTimeout(() => input.current?.focus(), 120);
    return () => window.clearTimeout(t);
  }, [open]);
  const go = async () => {
    if (amount <= 0 || tooMuch) return;
    try {
      await onSubmit(amount);
    } catch (e) {
      toast(e instanceof RuleError ? e.message : 'Nothing was saved. Try again.', 'error');
    }
  };
  const quick = outgoing && max !== undefined ? [...[50_00, 100_00].filter((v) => v < max).map((value) => ({ value })), ...(max > 0 ? [{ value: max, text: `All (${formatLei(max)})` }] : [])] : [10_00, 50_00, 100_00].map((value) => ({ value }));
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="saves">
        <p className="soc-sheetnote">
          {demo && <DemoLabel />} {note}
        </p>
        <AmountInput raw={raw} onRaw={setRaw} onEnter={go} inputRef={input} label="Amount, in lei" />
        {tooMuch ? (
          <p className="saves__error" role="alert">
            You can withdraw up to {formatLei(max!)}.
          </p>
        ) : (
          <QuickAmounts values={quick} amount={amount} onPick={(v) => setRaw(String(v / 100))} label="Quick amounts" />
        )}
        <button type="button" className={outgoing ? 'btn btn--secondary btn--block btn--lg' : 'btn btn--primary btn--block btn--lg'} disabled={amount <= 0 || tooMuch} onClick={go}>
          {amount > 0 && !tooMuch ? `${verb} ${formatLei(amount)}` : 'Enter an amount'}
        </button>
      </div>
    </Sheet>
  );
}

/** A row of icon + label buttons, for an action sheet. */
export function ActionRow({ icon: Icon, label, sub, onClick, disabled, tone }: { icon: LucideIcon | (() => JSX.Element); label: string; sub?: string; onClick: () => void; disabled?: boolean; tone?: 'quiet' }) {
  return (
    <li>
      <button type="button" className={`list-row ${tone === 'quiet' ? 'soc-quietrow' : ''}`} onClick={onClick} disabled={disabled}>
        <span className="list-row__icon">
          <Icon size={18} aria-hidden />
        </span>
        <span className="list-row__body">
          <span className="strong">{label}</span>
          {sub && <span className="small subtle">{sub}</span>}
        </span>
      </button>
    </li>
  );
}
