// "Add Kip to your home screen". Chrome and Edge on Android fire `beforeinstallprompt` when the PWA is
// installable (manifest + service worker), so we keep that event and show our own button. iPhone
// Safari has no such event: there, the button explains Share > Add to Home Screen instead.
// Nothing shows once Kip already runs as an installed app.
import { useEffect, useState } from 'react';
import { Download } from '@/lib/icons';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    window.dispatchEvent(new Event('kip:installable'));
  });
}

const installed = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const iPhone = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
// inside the laptop phone frame there's nothing to install
const framed = () => typeof window !== 'undefined' && window.self !== window.top;

export function InstallApp() {
  const [ready, setReady] = useState(deferred !== null);
  const [done, setDone] = useState(installed());
  const [howTo, setHowTo] = useState(false);

  useEffect(() => {
    const onReady = () => setReady(true);
    const onInstalled = () => setDone(true);
    window.addEventListener('kip:installable', onReady);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('kip:installable', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (done || framed() || (!ready && !iPhone())) return null;

  async function install() {
    if (!deferred) return setHowTo(true);
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    setReady(false);
    if (outcome === 'accepted') setDone(true);
  }

  return (
    <section className="card install-app" aria-label="Install Kip">
      <span className="install-app__icon" aria-hidden>
        <img src="/mascot/icon-192.png" alt="" width={44} height={44} />
      </span>
      <div className="grow">
        <strong>Add Kip to your home screen</strong>
        <p className="small muted">
          {howTo ? 'In Safari, tap Share (the square with the arrow), then "Add to Home Screen".' : 'Opens like an app, full screen, one tap away.'}
        </p>
      </div>
      {!howTo && (
        <button type="button" className="btn btn--primary btn--sm" onClick={install}>
          <Download size={16} aria-hidden /> Install
        </button>
      )}
    </section>
  );
}
