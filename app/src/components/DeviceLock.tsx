import { motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Fingerprint } from '@/lib/icons';
import { useStore } from '../data/store';
import { hasDeviceUnlock, isUnlocked, unlockWithDevice } from '../lib/deviceUnlock';
import { MascotSays } from './mascot/MascotSays';

/**
 * Face ID / fingerprint, when it was turned on for this account on this device: once per tab,
 * Kip asks for it before showing any money. It's a lock on this phone's screen and nothing more:
 * the passkey never goes to a server, and "Sign out" is always there (signing back in with the
 * phone number and its code is the real proof of who you are).
 */
export function DeviceLock({ children }: { children: ReactNode }) {
  const { account, signOut } = useStore();
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = account && !account.isDemo ? account.id : null;
  if (!id || !hasDeviceUnlock(id) || isUnlocked(id)) return <>{children}</>;

  async function unlock() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await unlockWithDevice(id);
      setTick((n) => n + 1);
    } catch {
      setError('That didn\'t work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="start start--center lock" style={{ maxWidth: 460 }}>
      <h1 className="sr-only">Kip is locked</h1>
      <motion.div className="start__done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <MascotSays state="wave" layout="stack" size={150} appear="none" message={account?.name ? `Hi, ${account.name}. Is that you?` : 'Hi. Is that you?'} />
        {error && (
          <p className="small" role="alert" style={{ color: 'var(--danger)', textAlign: 'center' }}>
            {error}
          </p>
        )}
        <button type="button" className="btn btn--primary btn--block btn--xl" disabled={busy} onClick={() => void unlock()}>
          {busy ? <span className="spinner" aria-label="Unlocking" /> : <><Fingerprint size={20} aria-hidden /> Unlock</>}
        </button>
        <button type="button" className="btn btn--ghost btn--block" onClick={signOut}>
          Sign out
        </button>
      </motion.div>
    </main>
  );
}
