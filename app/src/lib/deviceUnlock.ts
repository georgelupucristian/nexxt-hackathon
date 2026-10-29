// Face ID / fingerprint as a local unlock for this device: a passkey on the phone's own
// authenticator, remembered here, asked for once per tab (components/DeviceLock.tsx). It never
// reaches a server and is not account security: the account is still the phone number and its code.

const unlockKey = (accountId: string) => `kip.unlock.${accountId}`;
const UNLOCKED = 'kip.unlocked';

const toB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Remembers the passkey just made on this device; this tab counts as unlocked. */
export function rememberDeviceUnlock(accountId: string, rawId: ArrayBuffer) {
  try {
    localStorage.setItem(unlockKey(accountId), toB64(rawId));
    sessionStorage.setItem(UNLOCKED, accountId);
  } catch {
    /* private mode: no lock, nothing lost */
  }
}

export const hasDeviceUnlock = (accountId: string) => {
  try {
    return !!localStorage.getItem(unlockKey(accountId));
  } catch {
    return false;
  }
};

export const isUnlocked = (accountId: string) => {
  try {
    return sessionStorage.getItem(UNLOCKED) === accountId;
  } catch {
    return true;
  }
};

export function disableDeviceUnlock(accountId: string) {
  localStorage.removeItem(unlockKey(accountId));
}

/** Asks for the face or finger that registered the passkey. Resolves once this tab is unlocked. */
export async function unlockWithDevice(accountId: string): Promise<void> {
  const id = localStorage.getItem(unlockKey(accountId));
  if (!id) return;
  await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: fromB64(id), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60_000,
    },
  });
  sessionStorage.setItem(UNLOCKED, accountId);
}
