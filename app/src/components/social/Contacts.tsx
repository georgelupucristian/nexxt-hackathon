// The contacts ask outside onboarding (Friends, then Invite): why, "Allow access", then who's
// already on Kip. Never mandatory: adding by number and the invite link sit right below it.
import { Button } from '../ui';
import { FoundList, useFindContacts, type FoundContacts } from './ContactsFinder';

export function ContactsStep({ onFound }: { variant: 'inline'; onFound?: (f: FoundContacts) => void }) {
  const { find, found, busy, supported } = useFindContacts();
  if (!supported)
    return <p className="small muted">Your browser won't let us read your contacts. Add friends by number below, or send them your link.</p>;
  if (found) return <FoundList matched={found.matched} />;
  return (
    <>
      <p className="small muted">So you can find friends who already save. We only send the numbers, never the names, and we don't keep numbers of people without Kip.</p>
      <Button
        variant="primary"
        block
        loading={busy}
        onClick={() => {
          void find().then(
            (f) => f && onFound?.(f),
            () => undefined,
          );
        }}
      >
        Allow access
      </Button>
    </>
  );
}
