import { MotionConfig } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { HubShell } from './components/hub/HubShell';
import { useStore } from './data/store';
import { Activity } from './screens/Activity';
import { HowItWorks, SignIn, Welcome } from './screens/Auth';
import { GoalDetail } from './screens/GoalDetail';
import { GoalEditor } from './screens/GoalEditor';
import { Goals } from './screens/Goals';
import { NotFound } from './screens/NotFound';
import { Onboarding } from './screens/Onboarding';
import { Profile, ProfileSection } from './screens/Profile';
import { Start } from './screens/Start';
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

/** /logout always works, from any state: clears the session and goes to the welcome screen. */
function Logout() {
  const { signOut } = useStore();
  useEffect(() => {
    signOut();
  }, [signOut]);
  return <Navigate to="/welcome" replace />;
}

export default function App() {
  const { account, data } = useStore();
  return (
    // "user" follows the OS setting; the in-app Reduce motion switch forces it on
    <MotionConfig reducedMotion={data?.prefs.reduceMotion ? 'always' : 'user'}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Navigate to={account ? '/home' : '/welcome'} replace />} />
        <Route path="/logout" element={<Logout />} />
        <Route path="/welcome" element={<GuestOnly><Welcome /></GuestOnly>} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        {/* not GuestOnly: Start signs you up itself and must stay mounted for its finale */}
        <Route path="/start" element={<Start />} />
        <Route path="/signup" element={<Navigate to="/start" replace />} />
        <Route path="/signin" element={<GuestOnly><SignIn /></GuestOnly>} />
        <Route path="/onboarding" element={<RequireAuth allowOnboarding><Onboarding /></RequireAuth>} />
        {/* every signed-in screen opens as a panel over the hub */}
        <Route element={<RequireAuth><HubShell /></RequireAuth>}>
          <Route path="/home" element={null} />
          {/* Today now lives on Home */}
          <Route path="/today" element={<Navigate to="/home" replace />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/goals/new" element={<GoalEditor />} />
          <Route path="/goals/:id" element={<GoalDetail />} />
          <Route path="/goals/:id/edit" element={<GoalEditor />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/activity/:id" element={<TransactionDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:section" element={<ProfileSection />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </MotionConfig>
  );
}
