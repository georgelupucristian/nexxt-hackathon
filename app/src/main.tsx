import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { CelebrationProvider } from './components/mascot/Celebration';
import { ToastProvider } from './components/ui';
import { StoreProvider } from './data/store';
import { isEmbedded } from './frame/embed';
import { createFramedRoot } from './frame/PhoneFrame';
import './styles/tailwind.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/alive.css';
import './styles/celebrate.css';
import './styles/txlist.css';
import './styles/shell.css';
import './styles/money.css';
import './styles/tour.css';

// on a laptop or desktop this page draws a phone and the app runs inside it (src/frame/PhoneFrame.tsx)
createFramedRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <ToastProvider>
          <CelebrationProvider>
            <App />
          </CelebrationProvider>
        </ToastProvider>
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);

// installed app: register the service worker in production builds only (dev keeps live reload),
// and only from the top page, never again from the app inside the laptop phone frame
if (import.meta.env.PROD && 'serviceWorker' in navigator && !isEmbedded) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
