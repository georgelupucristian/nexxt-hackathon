import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { CelebrationProvider } from './components/mascot/Celebration';
import { ToastProvider } from './components/ui';
import { StoreProvider } from './data/store';
import './styles/tailwind.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/alive.css';

createRoot(document.getElementById('root')!).render(
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
