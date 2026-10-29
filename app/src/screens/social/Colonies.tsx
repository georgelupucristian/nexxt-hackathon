// /colonies: the viewer's colonies (at most 3), and making a new one from accepted friends.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronRight, Plus, Users } from '@/lib/icons';
import { Avatar, StreakCount } from '../../components/social/parts';
import { useSocial } from '../../components/social/SocialProvider';
import { Button, EmptyState, Sheet, TextField, useToast } from '../../components/ui';
import { plural } from '../../lib/plural';
import { COLONY_MAX, coloniesOf, firstNameOf, friendsOf, MAX_COLONIES, RuleError } from '../../lib/social/rules';
import type { UserId } from '../../lib/social/types';
import { colonyDetail } from '../../lib/social/view';

export function Colonies() {
  const s = useSocial();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const preset = params.get('new');
  useEffect(() => {
    if (preset !== null) setCreating(true);
  }, [preset]);
  if (!s) return null;
  const mine = coloniesOf(s.world.colonies, s.viewer);
  const full = mine.length >= MAX_COLONIES;
  return (
    <div className="screen">
      <header className="soc-head">
        <h1>Colonies</h1>
        <div className="soc-head__actions">
          <Button variant="primary" size="sm" icon={Plus} disabled={full} onClick={() => setCreating(true)}>
            New colony
          </Button>
        </div>
      </header>
      <p className="small muted">2 to 5 friends saving together. A day counts for the colony when everyone puts something aside. Nobody sees the amounts.</p>
      {full && <p className="small muted">You're already in {MAX_COLONIES} colonies, the most you can join.</p>}

      {mine.length ? (
        <ul className="soc-list stack" aria-label="Your colonies">
          {mine.map((c) => {
            const d = colonyDetail(s.world, c.id, s.viewer, s.now)!;
            return (
              <li key={c.id}>
                <Link to={`/colonies/${c.id}`} className="soc-goalcard" data-testid="colony-card">
                  <span className="soc-goalpic" style={{ width: 52, height: 52, background: 'var(--reward-bg)' }} aria-hidden>
                    <img src="/mascot/flame.webp" alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
                  </span>
                  <span className="grow stack" style={{ gap: 4, minWidth: 0 }}>
                    <span className="strong">{c.name}</span>
                    <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <StreakCount n={d.streak} />
                      <span className="small subtle">{plural(c.members.length, 'member', 'members')}</span>
                      {d.atRisk.length > 0 && <span className="soc-badge soc-badge--danger">{firstNameOf(s.world.users[d.atRisk[0]].name)} is in danger</span>}
                    </span>
                    <span className="row" style={{ gap: -6 }}>
                      {d.members.slice(0, 5).map((m) => (
                        <span key={m.id} style={{ marginRight: -8 }}>
                          <Avatar user={s.world.users[m.id]} size={26} />
                        </span>
                      ))}
                    </span>
                  </span>
                  <ChevronRight size={18} className="subtle" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="card">
          <EmptyState icon={Users} title="No colonies yet" body="Start one with 1 to 4 friends. You'll see each other's streaks and who saved today, never the money." action={<Button variant="primary" onClick={() => setCreating(true)}>New colony</Button>} />
        </div>
      )}
      <NewColonySheet
        open={creating}
        preset={preset}
        onClose={() => {
          setCreating(false);
          if (preset !== null) setParams({}, { replace: true });
        }}
      />
    </div>
  );
}

function NewColonySheet({ open, onClose, preset }: { open: boolean; onClose: () => void; preset: string | null }) {
  const s = useSocial();
  const nav = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<UserId[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setName('');
    setError(null);
    setPicked(preset ? [preset] : []);
  }, [open, preset]);
  if (!s) return null;
  const friends = friendsOf(s.world, s.viewer)
    .map((id) => s.world.users[id])
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
  const room = COLONY_MAX - 1;
  return (
    <Sheet open={open} onClose={onClose} title="New colony">
      <div className="stack-lg">
        <TextField label="Colony name" placeholder="e.g. Little Flame" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="stack">
          <p className="label">
            Friends <span className="subtle">({picked.length} of up to {room})</span>
          </p>
          <ul className="soc-list soc-list--sheet" role="group" aria-label="Pick friends">
            {friends.map((u) => {
              const on = picked.includes(u.id);
              return (
                <li key={u.id}>
                  <button type="button" role="checkbox" aria-checked={on} className="soc-pick" disabled={!on && picked.length >= room} onClick={() => setPicked(on ? picked.filter((x) => x !== u.id) : [...picked, u.id])}>
                    <Avatar user={u} size={34} />
                    <span className="grow strong">{u.name}</span>
                    <span className={`soc-check ${on ? 'is-on' : ''}`} aria-hidden>
                      {on && <Check size={14} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <Button
          variant="primary"
          block
          disabled={!name.trim() || !picked.length}
          onClick={async () => {
            try {
              const c = await s.repo.createColony(name, picked);
              onClose();
              toast(`Your colony «${c.name}» is ready.`);
              nav(`/colonies/${c.id}`);
            } catch (e) {
              setError(e instanceof RuleError ? e.message : "Couldn't create the colony.");
            }
          }}
        >
          Create colony
        </Button>
      </div>
    </Sheet>
  );
}
