import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/nav';
import { useStore } from './data/store';
import { Activity } from './screens/Activity';
import { HowItWorks, SignIn, SignUp, Welcome } from './screens/Auth';
import { GoalDetail } from './screens/GoalDetail';
import { GoalEditor } from './screens/GoalEditor';
import { Goals } from './screens/Goals';
import { Home } from './screens/Home';
import { NotFound } from './screens/NotFound';
import { Onboarding } from './screens/Onboarding';
import { Profile, ProfileSection } from './screens/Profile';
import { TransactionDetail } from './screens/TransactionDetail';

/** Signed out → welcome. Signed in but onboarding unfinished → resume onboarding. */
function RequireAuth({ children, allowOnboarding }: { children: ReactNode; allowOnboarding?: boolean }) {
  const { account, data } = useStore();
  if (!account || !data) return <Navigate to="/welcome" replace />;
  if (!allowOnboarding && !data.onboarding.completed) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { account, data } = useStore();
  if (account && data) return <Navigate to={data.onboarding.completed ? '/home' : '/onboarding'} replace />;
  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const inApp = (el: ReactNode) => (
  <RequireAuth>
    <AppShell>{el}</AppShell>
  </RequireAuth>
);

export default function App() {
  const { account } = useStore();
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Navigate to={account ? '/home' : '/welcome'} replace />} />
        <Route path="/welcome" element={<GuestOnly><Welcome /></GuestOnly>} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/signup" element={<GuestOnly><SignUp /></GuestOnly>} />
        <Route path="/signin" element={<GuestOnly><SignIn /></GuestOnly>} />
        <Route path="/onboarding" element={<RequireAuth allowOnboarding><Onboarding /></RequireAuth>} />
        <Route path="/home" element={inApp(<Home />)} />
        <Route path="/goals" element={inApp(<Goals />)} />
        <Route path="/goals/new" element={inApp(<GoalEditor />)} />
        <Route path="/goals/:id" element={inApp(<GoalDetail />)} />
        <Route path="/goals/:id/edit" element={inApp(<GoalEditor />)} />
        <Route path="/activity" element={inApp(<Activity />)} />
        <Route path="/activity/:id" element={inApp(<TransactionDetail />)} />
        <Route path="/profile" element={inApp(<Profile />)} />
        <Route path="/profile/:section" element={inApp(<ProfileSection />)} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
