// /friends: every accepted friend (no cap, paged as you scroll), the requests both ways, and
// inviting. Friends in danger are pinned to the top with "Give them your freeze" right on their row.
// Never an amount of money anywhere in the list.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AddressBook, Ban, ChatText, Copy, MoreHorizontal, Search, Share, UserMinus, UserPlus, Users, WhatsApp } from '@/lib/icons';
import { ContactsStep } from '../../components/social/Contacts';
import { InviteList } from '../../components/social/ContactsFinder';
import { INVITE_REWARD, inviteLink, inviteText } from '../../components/social/invite';
import {
  ActionRow,
  AskFreezeSheet,
  Avatar,
  CheerButtons,
  DangerBadge,
  FreezeActiveBadge,
  FreezeChip,
  FreezeDot,
  RescuedMoment,
  SavedToday,
  StreakCount,
  useGiveFreeze,
} from '../../components/social/parts';
import { useSocial } from '../../components/social/SocialProvider';
import { Button, ConfirmDialog, EmptyState, Sheet, TextField, useToast } from '../../components/ui';
import { relativeTime } from '../../lib/dates';
import { coloniesOf, firstNameOf, RuleError, searchFriendRows, sortFriendRows } from '../../lib/social/rules';
import type { DeviceContact } from '../../lib/social/contacts';
import type { FriendRowData, FriendSort, UserId } from '../../lib/social/types';
import { asksFor, friendRows, incomingRequests, outgoingRequests, statusOf } from '../../lib/social/view';
import { plural } from '../../lib/plural';

type Tab = 'friends' | 'requests' | 'invite';
const PAGE = 40;
const SORTS: { id: FriendSort; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'name', label: 'Name A-Z' },
  { id: 'streak', label: 'Longest streak' },
];

export function Friends() {
  const s = useSocial();
  const [params, setParams] = useSearchParams();
  const tab = (['friends', 'requests', 'invite'].includes(params.get('tab') ?? '') ? params.get('tab') : 'friends') as Tab;
  const setTab = (t: Tab) => setParams(t === 'friends' ? {} : { tab: t }, { replace: true });
  const { give, ui: giveUi } = useGiveFreeze();

  useEffect(() => {
    if (tab === 'requests') void Promise.resolve(s?.repo.markNoticesRead()).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, s?.viewer]);

  if (!s) return null;
  const waiting = incomingRequests(s.world, s.viewer).length + asksFor(s.world, s.viewer, s.now).length + s.world.colonyInvites.filter((i) => i.to === s.viewer && i.status === 'pending').length + s.world.sharedGoals.filter((g) => g.invited?.some((i) => i.user === s.viewer)).length;

  return (
    <div className="screen">
      <header className="soc-head">
        <h1>Friends</h1>
        <div className="soc-head__actions">
          <Link to="/colonies" className="btn btn--secondary btn--sm">
            <Users size={18} aria-hidden /> Colonies
          </Link>
        </div>
      </header>

      <MyStreakHelp />
      <FreezeChip />

      <div className="soc-tabs" role="tablist" aria-label="Friends">
        {(
          [
            ['friends', 'Friends'],
            ['requests', 'Requests'],
            ['invite', 'Invite'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}>
            {label}
            {id === 'requests' && waiting > 0 && (
              <span className="soc-tabs__count" aria-label={`${waiting} new`}>
                {waiting}
              </span>
            )}
          </button>
        ))}
      </div>

      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="stack-lg">
        {tab === 'friends' && <FriendsTab onGive={give} onInvite={() => setTab('invite')} />}
        {tab === 'requests' && <RequestsTab onGive={give} />}
        {tab === 'invite' && <InviteTab />}
      </section>
      {giveUi}
      <RescuedMoment />
    </div>
  );
}

/**
 * The viewer's own danger, on top: ask for a freeze with one tap, or (once a friend gave one)
 * put money aside with the save button on home.
 */
export function MyStreakHelp() {
  const s = useSocial();
  const nav = useNavigate();
  const [ask, setAsk] = useState(false);
  if (!s) return null;
  const st = statusOf(s.world, s.viewer, s.now);
  const d = st.danger;
  const giver = d?.gift ? s.world.users[d.gift.from] : null;
  const asked = !!d && s.world.asks.some((a) => a.from === s.viewer && a.day === d.danger.day);
  return (
    <>
      {d && (
        <section className="soc-help" aria-labelledby="my-danger" data-testid="my-danger">
          <img src={giver ? '/mascot/pose-wave.webp' : '/mascot/pose-ice-floe.webp'} alt="" />
          <div className="stack" style={{ gap: 6, flex: 1 }}>
            <h2 id="my-danger">{giver ? `${firstNameOf(giver.name)} gave you ${giver.gender === 'f' ? 'her' : giver.gender === 'm' ? 'his' : 'their'} freeze` : 'Your streak is in danger'}</h2>
            <p>{giver ? 'Put some money aside today and yesterday is covered.' : "You didn't save yesterday and you have no 1-day Freeze. Your friends can help until midnight."}</p>
            {giver ? (
              <Button variant="primary" size="sm" onClick={() => nav('/home')}>
                Save
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => setAsk(true)}>
                {asked ? 'Ask again' : 'Ask for a freeze'}
              </Button>
            )}
          </div>
        </section>
      )}
      <AskFreezeSheet open={ask} onClose={() => setAsk(false)} />
    </>
  );
}

// ---------- Friends ----------

function FriendsTab({ onGive, onInvite }: { onGive: (id: UserId) => void; onInvite: () => void }) {
  const s = useSocial()!;
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<FriendSort>('recent');
  const [limit, setLimit] = useState(PAGE);
  const [menu, setMenu] = useState<UserId | null>(null);
  const sentinel = useRef<HTMLLIElement>(null);
  const all = useMemo(() => friendRows(s.world, s.viewer, s.now), [s.world, s.viewer, s.now]);
  const rows = useMemo(() => sortFriendRows(searchFriendRows(all, q), sort), [all, q, sort]);
  const asks = new Set(asksFor(s.world, s.viewer, s.now).map((a) => a.from));
  const mine = statusOf(s.world, s.viewer, s.now);

  // hundreds of friends: the next page loads as the end of the list scrolls into view
  useEffect(() => setLimit(PAGE), [q, sort]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setLimit((n) => n + PAGE), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length, limit]);

  if (!all.length)
    return (
      <div className="card">
        <EmptyState icon={Users} title="No friends here yet" body="Find them in your contacts or send them your link. Friends only see your streak, never your money." action={<Button variant="primary" onClick={onInvite}>Find your friends</Button>} />
      </div>
    );

  return (
    <>
      <div className="soc-search">
        <Search size={18} aria-hidden />
        <input className="input" type="search" placeholder="Search by name" aria-label="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="soc-sort" role="group" aria-label="Sort friends">
        {SORTS.map((o) => (
          <button key={o.id} type="button" aria-pressed={sort === o.id} onClick={() => setSort(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="small muted" aria-live="polite" data-testid="friend-count">
        {q ? `${plural(rows.length, 'result', 'results')} of ${plural(all.length, 'friend', 'friends')}` : plural(all.length, 'friend', 'friends')}
      </p>
      {rows.length ? (
        <div className="soc-card">
          <ul className="soc-list" aria-label="Your friends" data-testid="friend-list">
            {rows.slice(0, limit).map((r) => (
              <FriendRow key={r.id} row={r} asked={asks.has(r.id)} canGive={r.inDanger && mine.hasDayFreeze} onGive={() => onGive(r.id)} onMore={() => setMenu(r.id)} />
            ))}
            {rows.length > limit && (
              <li ref={sentinel} className="soc-more">
                <Button size="sm" onClick={() => setLimit((n) => n + PAGE)}>
                  Show more
                </Button>
              </li>
            )}
          </ul>
        </div>
      ) : (
        <p className="muted">No friends with that name.</p>
      )}
      <FriendMenu id={menu} onClose={() => setMenu(null)} onGive={onGive} />
    </>
  );
}

function FriendRow({ row, asked, canGive, onGive, onMore }: { row: FriendRowData; asked: boolean; canGive: boolean; onGive: () => void; onMore: () => void }) {
  const s = useSocial()!;
  const u = s.world.users[row.id];
  return (
    <li className={`soc-row ${row.inDanger ? 'soc-row--danger' : ''}`} data-testid="friend-row" data-danger={row.inDanger || undefined}>
      <Link to={`/friends/${row.id}`} className="soc-row__main">
        <Avatar user={u} />
        <span className="soc-row__body">
          <span className="soc-row__name">
            <span>{row.name}</span>
            {row.hasDayFreeze && <FreezeDot />}
          </span>
          <span className="soc-row__meta">
            <StreakCount n={row.streak} />
            <SavedToday yes={row.savedToday} />
            {row.inDanger && <DangerBadge />}
            {row.freezeActive && <FreezeActiveBadge />}
          </span>
          {asked && <span className="soc-row__ask">“Can you spare a freeze?”</span>}
        </span>
      </Link>
      {canGive ? (
        <Button variant="primary" size="sm" className="soc-row__give" onClick={onGive}>
          Give them your freeze
        </Button>
      ) : (
        <button type="button" className="soc-row__more" aria-label={`More for ${row.name}`} onClick={onMore}>
          <MoreHorizontal size={20} aria-hidden />
        </button>
      )}
    </li>
  );
}

/** Everything you can do for or about a friend, in one sheet. */
export function FriendMenu({ id, onClose, onGive }: { id: UserId | null; onClose: () => void; onGive: (id: UserId) => void }) {
  const s = useSocial();
  const nav = useNavigate();
  const toast = useToast();
  const [confirm, setConfirm] = useState<null | 'remove' | 'block'>(null);
  const [colonyPick, setColonyPick] = useState(false);
  const [target, setTarget] = useState<UserId | null>(null);
  useEffect(() => {
    if (id) setTarget(id);
  }, [id]);
  if (!s) return null;
  const u = target ? s.world.users[target] : null;
  const st = target ? statusOf(s.world, target, s.now) : null;
  const mine = statusOf(s.world, s.viewer, s.now);
  const myColonies = coloniesOf(s.world.colonies, s.viewer).filter((c) => target && !c.members.some((m) => m.user === target));
  const name = u ? firstNameOf(u.name) : '';
  return (
    <>
      <Sheet open={!!id && !!u} onClose={onClose} title={u?.name ?? ''}>
        <div className="stack-lg">
          <CheerButtons to={target ?? ''} onSent={onClose} />
          <div className="card card--flush">
            <ul className="list">
              {st?.danger && !st.danger.gift && mine.hasDayFreeze && (
                <ActionRow
                  icon={() => <img src="/mascot/ice.webp" alt="" width={18} height={18} />}
                  label="Give them your freeze"
                  sub={`${name} is in danger`}
                  onClick={() => {
                    onClose();
                    onGive(target!);
                  }}
                />
              )}
              {(
                <ActionRow
                  icon={Users}
                  label="Invite to a colony"
                  sub={myColonies.length ? undefined : 'Start a colony with your friends'}
                  onClick={() => {
                    if (!myColonies.length) {
                      onClose();
                      nav(`/colonies?new=${target}`);
                    } else setColonyPick(true);
                  }}
                />
              )}
              <ActionRow
                icon={UserPlus}
                label="View profile"
                onClick={() => {
                  onClose();
                  nav(`/friends/${target}`);
                }}
              />
              <ActionRow icon={UserMinus} label="Remove friend" tone="quiet" onClick={() => setConfirm('remove')} />
              <ActionRow icon={Ban} label="Block" tone="quiet" onClick={() => setConfirm('block')} />
            </ul>
          </div>
        </div>
      </Sheet>
      <Sheet open={colonyPick} onClose={() => setColonyPick(false)} title="Which colony?">
        <ul className="soc-list soc-list--sheet">
          {myColonies.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="soc-pick"
                onClick={async () => {
                  try {
                    await s.repo.inviteToColony(c.id, target!);
                    toast(`Invite sent to ${name}.`);
                  } catch (e) {
                    toast(e instanceof RuleError ? e.message : "Couldn't send it.", 'error');
                  }
                  setColonyPick(false);
                  onClose();
                }}
              >
                <Users size={20} aria-hidden />
                <span className="grow strong">{c.name}</span>
                <span className="small subtle">{plural(c.members.length, 'member', 'members')}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
      <ConfirmDialog
        open={confirm === 'remove'}
        title={`Remove ${name} from your friends?`}
        body="You'll stop seeing each other's streaks. Shared colonies stay. You can add each other again anytime."
        confirmLabel="Yes, remove"
        cancelLabel="No, stay friends"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          try {
            await s.repo.removeFriend(target!);
            onClose();
            toast(`${name} is no longer on your list.`);
          } catch (e) {
            toast(e instanceof RuleError ? e.message : "That didn't work. Try again.", 'error');
          }
        }}
      />
      <ConfirmDialog
        open={confirm === 'block'}
        title={`Block ${name}?`}
        body="They won't be able to find you by your number or send you requests. They won't be notified."
        confirmLabel="Yes, block"
        cancelLabel="No"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          try {
            await s.repo.block(target!);
            onClose();
            toast(`${name} is blocked.`);
          } catch (e) {
            toast(e instanceof RuleError ? e.message : "That didn't work. Try again.", 'error');
          }
        }}
      />
    </>
  );
}

// ---------- Requests ----------

function RequestsTab({ onGive }: { onGive: (id: UserId) => void }) {
  const s = useSocial()!;
  const toast = useToast();
  const nav = useNavigate();
  const asks = asksFor(s.world, s.viewer, s.now);
  const incoming = incomingRequests(s.world, s.viewer);
  const outgoing = outgoingRequests(s.world, s.viewer);
  const invites = s.world.colonyInvites.filter((i) => i.to === s.viewer && i.status === 'pending');
  const goalInvites = s.world.sharedGoals.filter((g) => g.invited?.some((i) => i.user === s.viewer));
  const mine = statusOf(s.world, s.viewer, s.now);
  const notices = s.world.notices.filter((n) => n.to === s.viewer).slice(-8).reverse();
  const run = async (f: () => unknown, ok?: string) => {
    try {
      await f();
      if (ok) toast(ok);
    } catch (e) {
      toast(e instanceof RuleError ? e.message : "That didn't work. Try again.", 'error');
    }
  };
  const nothing = !asks.length && !incoming.length && !outgoing.length && !invites.length && !goalInvites.length;
  return (
    <>
      {asks.length > 0 && (
        <section className="stack" aria-labelledby="asks-h">
          <h2 id="asks-h" className="group-label">
            They need a freeze
          </h2>
          <ul className="soc-list soc-card">
            {asks.map((a) => {
              const u = s.world.users[a.from];
              return (
                <li key={a.id} className="soc-row soc-row--danger" data-testid="freeze-ask">
                  <Avatar user={u} />
                  <span className="soc-row__body">
                    <span className="soc-row__name">{u.name}</span>
                    <span className="soc-row__ask" style={{ marginTop: 0 }}>
                      “Can you spare a freeze?”
                    </span>
                    {!mine.hasDayFreeze && <span className="xs subtle">You don't have a 1-day Freeze right now. You can send them a cheer.</span>}
                  </span>
                  {mine.hasDayFreeze ? (
                    <Button variant="primary" size="sm" onClick={() => onGive(a.from)}>
                      Give them your freeze
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => nav(`/friends/${a.from}`)}>
                      View
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {goalInvites.length > 0 && (
        <section className="stack" aria-labelledby="ginv-h">
          <h2 id="ginv-h" className="group-label">
            Save together
          </h2>
          <ul className="soc-list soc-card">
            {goalInvites.map((g) => {
              const from = g.invited?.find((i) => i.user === s.viewer)?.by ?? g.createdBy;
              const u = s.world.users[from];
              return (
                <li key={g.id} className="soc-row" data-testid="shared-invite">
                  {u && <Avatar user={u} />}
                  <span className="soc-row__body">
                    <Link to={`/shared-goal/${g.id}`} className="soc-row__name">
                      {u ? firstNameOf(u.name) : 'A friend'} invited you to save for {g.name}
                    </Link>
                  </span>
                  <div className="row" style={{ gap: 6 }}>
                    <Button variant="primary" size="sm" onClick={() => run(() => s.repo.joinSharedGoal(g.id), "You're in. The target is split evenly.")}>
                      Join
                    </Button>
                    <Button size="sm" onClick={() => run(() => s.repo.declineSharedGoal(g.id))}>
                      No thanks
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {invites.length > 0 && (
        <section className="stack" aria-labelledby="cinv-h">
          <h2 id="cinv-h" className="group-label">
            Colony invites
          </h2>
          <ul className="soc-list soc-card">
            {invites.map((i) => {
              const c = s.world.colonies.find((x) => x.id === i.colony);
              if (!c) return null;
              return (
                <li key={i.id} className="soc-row">
                  <Avatar user={s.world.users[i.from]} />
                  <span className="soc-row__body">
                    <span className="soc-row__name">«{c.name}»</span>
                    <span className="small subtle">from {firstNameOf(s.world.users[i.from].name)}</span>
                  </span>
                  <Link to={`/colonies/invite/${c.code}`} className="btn btn--primary btn--sm">
                    View
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {incoming.length > 0 && (
        <section className="stack" aria-labelledby="in-h">
          <h2 id="in-h" className="group-label">
            Want to be friends · {incoming.length}
          </h2>
          <ul className="soc-list soc-card">
            {incoming.map((r) => {
              const u = s.world.users[r.from];
              return (
                <li key={r.id} className="soc-row" data-testid="incoming-request">
                  <Avatar user={u} />
                  <span className="soc-row__body">
                    <span className="soc-row__name">{u.name}</span>
                    <span className="xs subtle">{relativeTime(r.at, s.now)}</span>
                  </span>
                  <div className="row" style={{ gap: 6 }}>
                    <Button size="sm" onClick={() => run(() => s.repo.decline(r.id))}>
                      Decline
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => run(() => s.repo.accept(r.id), `You're now friends with ${firstNameOf(u.name)}.`)}>
                      Accept
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="stack" aria-labelledby="out-h">
          <h2 id="out-h" className="group-label">
            Sent, waiting for a reply · {outgoing.length}
          </h2>
          <ul className="soc-list soc-card">
            {outgoing.map((r) => {
              const u = s.world.users[r.to];
              return (
                <li key={r.id} className="soc-row" data-testid="outgoing-request">
                  <Avatar user={u} />
                  <span className="soc-row__body">
                    <span className="soc-row__name">{u.name}</span>
                    <span className="xs subtle">You'll be friends once they accept</span>
                  </span>
                  <Button size="sm" onClick={() => run(() => s.repo.cancel(r.id))}>
                    Cancel
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {nothing && <p className="muted">No requests right now.</p>}

      {notices.length > 0 && (
        <section className="stack" aria-labelledby="news-h">
          <h2 id="news-h" className="group-label">
            Updates
          </h2>
          <ul className="soc-list soc-card">
            {notices.map((n) => (
              <li key={n.id} className="soc-row">
                <span className="soc-row__body">
                  {n.link ? (
                    <Link to={n.link} className="strong" style={{ color: 'var(--text)' }}>
                      {n.text}
                    </Link>
                  ) : (
                    <span className="strong">{n.text}</span>
                  )}
                  <span className="xs subtle">{relativeTime(n.at, s.now)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ---------- Invite ----------

function InviteTab() {
  const s = useSocial()!;
  const toast = useToast();
  const [others, setOthers] = useState<DeviceContact[] | null>(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const me = s.world.users[s.viewer];
  const link = inviteLink(me);
  const text = inviteText(me);

  const addByNumber = async () => {
    setError(null);
    try {
      const id = await s.repo.findByPhone(phone);
      if (!id) {
        setError("We can't find anyone on Kip with that number. Send them your link.");
        return;
      }
      const out = await s.repo.sendRequest(id);
      const n = firstNameOf(s.repo.current()?.users[id]?.name ?? '');
      toast(out === 'friends' ? `You're now friends with ${n}.` : `Request sent to ${n}.`);
      setPhone('');
    } catch (e) {
      setError(e instanceof RuleError ? e.message : "Couldn't send it.");
    }
  };

  return (
    <>
      <section className="card stack" aria-labelledby="contacts-h">
        <div className="row" style={{ gap: 12 }}>
          <span className="list-row__icon">
            <AddressBook size={20} aria-hidden />
          </span>
          <h2 id="contacts-h" className="grow">
            From your contacts
          </h2>
        </div>
        <ContactsStep variant="inline" onFound={(f) => setOthers(f.others)} />
      </section>

      {others && others.length > 0 && (
        <section className="stack" aria-labelledby="noapp-h">
          <h2 id="noapp-h" className="group-label">
            Not on Kip yet · {others.length}
          </h2>
          <InviteList others={others} />
          <p className="xs subtle">Their numbers stay on your phone. Kip doesn't keep them.</p>
        </section>
      )}

      <section className="card stack" aria-labelledby="bynum-h">
        <h2 id="bynum-h">Add by number</h2>
        <TextField label="Phone number" type="tel" inputMode="tel" autoComplete="off" placeholder="07xx xxx xxx" value={phone} error={error} onChange={(e) => (setPhone(e.target.value), setError(null))} />
        <Button variant="primary" block disabled={phone.replace(/\D/g, '').length < 9} onClick={addByNumber}>
          Send request
        </Button>
      </section>

      <section className="card stack" aria-labelledby="link-h">
        <h2 id="link-h">Your link</h2>
        <p className="small muted">{INVITE_REWARD}</p>
        <p className="soc-warning" style={{ fontWeight: 600, wordBreak: 'break-all', background: 'var(--surface-2)', color: 'var(--text)' }}>
          {link}
        </p>
        <div className="soc-cheers">
          <a className="soc-cheer" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
            <WhatsApp size={18} aria-hidden /> WhatsApp
          </a>
          <a className="soc-cheer" href={`sms:?&body=${encodeURIComponent(text)}`}>
            <ChatText size={18} aria-hidden /> SMS
          </a>
          <button
            type="button"
            className="soc-cheer"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(
                () => toast('Link copied.'),
                () => toast("Couldn't copy it. Press and hold the link.", 'error'),
              );
            }}
          >
            <Copy size={18} aria-hidden /> Copy
          </button>
          {'share' in navigator && (
            <button type="button" className="soc-cheer" onClick={() => void navigator.share({ title: 'Kip', text }).catch(() => undefined)}>
              <Share size={18} aria-hidden /> Share
            </button>
          )}
        </div>
      </section>
    </>
  );
}
