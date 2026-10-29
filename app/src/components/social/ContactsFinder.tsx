// Finding friends in the address book. Only the phone numbers go to matching; the names stay here,
// on the device, in this component's memory (to say who's who in the invite list) and are gone
// when it closes. Numbers without an account are never kept.
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { ChatText, Check, UserPlus, WhatsApp } from '@/lib/icons';
import { contactsProvider, type DeviceContact } from '../../lib/social/contacts';
import { normalizePhone, RuleError } from '../../lib/social/rules';
import type { UserId } from '../../lib/social/types';
import { areFriends } from '../../lib/social/rules';
import { useToast } from '../ui';
import { Avatar } from './parts';
import { useSocial } from './SocialProvider';
import { inviteText } from './invite';

export interface FoundContacts {
  matched: UserId[];
  /** names and numbers of the people without Kip, only in memory, for "Invite" */
  others: DeviceContact[];
}

/** Asks the provider (from the tap on "Allow access") and matches the numbers. */
export function useFindContacts() {
  const s = useSocial();
  const [found, setFound] = useState<FoundContacts | null>(null);
  const [busy, setBusy] = useState(false);
  // the demo address book only ever for the demo; a real account uses the real Contact Picker
  const provider = contactsProvider(s?.simulated ?? false);
  async function find(): Promise<FoundContacts | null> {
    if (!s || !provider) return null;
    setBusy(true);
    try {
      const book = await provider.pick();
      const matched = await s.repo.matchContacts(book.flatMap((c) => c.phones));
      const users = s.repo.current()?.users ?? s.world.users;
      const known = new Set(matched.map((id) => users[id]?.phone).filter(Boolean));
      const others = book.filter((c) => !c.phones.some((p) => known.has(normalizePhone(p) ?? '')));
      s.repo.markContactsAsked();
      const out = { matched, others };
      setFound(out);
      return out;
    } finally {
      setBusy(false);
    }
  }
  return { find, found, busy, supported: !!provider };
}

/** The people found, each with "Add". Looks like onboarding's option rows. */
export function FoundList({ matched }: { matched: UserId[] }) {
  const s = useSocial();
  const toast = useToast();
  if (!s) return null;
  if (!matched.length) return <p className="text-[15px] text-ink-3">None of your contacts use Kip yet. Invite them with your link.</p>;
  return (
    <motion.ul className="m-0 flex list-none flex-col gap-3 p-0" initial="hidden" animate="shown" variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.06 } } }} aria-label="Friends on Kip">
      {matched.map((id) => {
        const u = s.world.users[id];
        const friends = areFriends(s.world, s.viewer, id);
        const sent = s.world.requests.some((r) => r.status === 'pending' && r.from === s.viewer && r.to === id);
        const asked = s.world.requests.some((r) => r.status === 'pending' && r.from === id && r.to === s.viewer);
        return (
          <motion.li key={id} className="soc-found" variants={{ hidden: { opacity: 0, y: 10 }, shown: { opacity: 1, y: 0 } }} data-testid="found-row">
            <Avatar user={u} size={42} />
            <span className="grow">
              <span className="text-[16px] font-bold text-ink">{u.name}</span>
              <span className="text-[13px] text-ink-3">{friends ? 'You\'re friends' : asked ? 'Already sent you a request' : sent ? 'Request sent' : 'Uses Kip'}</span>
            </span>
            <button
              type="button"
              className="soc-found__add"
              disabled={friends || sent}
              aria-label={friends ? `${u.name}: friends` : sent ? `${u.name}: request sent` : `Add ${u.name}`}
              onClick={async () => {
                try {
                  const outcome = await s.repo.sendRequest(id);
                  toast(outcome === 'friends' ? `You and ${u.name.split(' ')[0]} are friends now.` : `Request sent to ${u.name.split(' ')[0]}.`);
                } catch (e) {
                  toast(e instanceof RuleError ? e.message : 'It didn\'t send. Try again.', 'error');
                }
              }}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={friends ? 'f' : sent ? 's' : 'a'} className="inline-flex items-center gap-1.5" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                  {friends ? (
                    <>
                      <Check size={16} aria-hidden /> Friends
                    </>
                  ) : sent ? (
                    'Sent'
                  ) : (
                    <>
                      <UserPlus size={16} aria-hidden /> Add
                    </>
                  )}
                </motion.span>
              </AnimatePresence>
            </button>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

/** Contacts without Kip: a personal link by WhatsApp or SMS. Their numbers never leave this screen. */
export function InviteList({ others }: { others: DeviceContact[] }) {
  const s = useSocial();
  if (!s || !others.length) return null;
  const text = inviteText(s.world.users[s.viewer]);
  return (
    <ul className="soc-list soc-card" aria-label="Invite">
      {others.map((c) => (
        <li key={c.name + c.phones[0]} className="soc-row">
          <Avatar user={{ name: c.name, hue: 'soare' }} size={36} />
          <span className="grow strong truncate">{c.name}</span>
          <a className="soc-row__more" href={`https://wa.me/${(normalizePhone(c.phones[0]) ?? '').replace('+', '')}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" aria-label={`Invite ${c.name} on WhatsApp`}>
            <WhatsApp size={18} aria-hidden />
          </a>
          <a className="soc-row__more" href={`sms:${normalizePhone(c.phones[0]) ?? ''}?&body=${encodeURIComponent(text)}`} aria-label={`Invite ${c.name} by SMS`}>
            <ChatText size={18} aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}
