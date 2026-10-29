import { MotionConfig } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { HubShell } from './components/hub/HubShell';
import { DeviceLock } from './components/DeviceLock';
import { SplashTransitionProvider } from './components/splash-transition';
import { useStore } from './data/store';
import { Activity } from './screens/Activity';
import { HowItWorks, SignIn, Welcome } from './screens/Auth';
import { GoalDetail } from './screens/GoalDetail';
import { Goals } from './screens/Goals';
import { NewGoal } from './screens/NewGoal';
import { NotFound } from './screens/NotFound';
import { Onboarding } from './screens/Onboarding';
import { Profile, ProfileSection } from './screens/Profile';
import { TransactionDetail } from './screens/TransactionDetail';
import { SocialSync } from './components/social/SocialProvider';
import { Friends } from './screens/social/Friends';
import { FriendProfile } from './screens/social/FriendProfile';
import { Colonies } from './screens/social/Colonies';
import { ColonyDetail } from './screens/social/ColonyDetail';
import { ColonyInvite } from './screens/social/ColonyInvite';
import { SharedGoalScreen } from './screens/social/SharedGoal';
import { ClubDetail, Clubs, Promotions } from './screens/Clubs';

/** An unfinished setup resumes in sign-up itself, which picks up where it was left. */
const RESUME = '/start';

/** Signed out → welcome. Signed in but onboarding unfinished → resume onboarding. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { account, data } = useStore();
  if (!account || !data) return <Navigate to="/welcome" replace />;
  if (!data.onboarding.completed) return <Navigate to={RESUME} replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { account, data } = useStore();
  if (account && data) return <Navigate to={data.onboarding.completed ? '/home' : RESUME} replace />;
  return <>{children}</>;
}

/** "/" keeps its query: Stripe Checkout returns to /?checkout=success&session_id=… */
function Root() {
  const { account } = useStore();
  const { search } = useLocation();
  return <Navigate to={account ? `/home${search}` : '/welcome'} replace />;
}

/** While the saved Supabase session is being checked, a calm Kip instead of a flash of the welcome screen. */
function Splash() {
  return (
    <div className="start start--center" aria-busy="true">
      <img src="/mascot/pose-cool.webp" alt="" width={120} height={120} style={{ objectFit: 'contain', margin: '0 auto' }} />
      <span className="spinner" aria-label="Loading" style={{ margin: '16px auto 0' }} />
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** The old edit page is now a sheet on the goal itself: open the goal with that sheet showing. */
function EditGoalRedirect() {
  const { id } = useParams();
  return <Navigate to={`/goals/${id}`} replace state={{ edit: true }} />;
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
  const { data, ready } = useStore();
  if (!ready) return <Splash />;
  return (
    // "user" follows the OS setting; the in-app Reduce motion switch forces it on
    <MotionConfig reducedMotion={data?.prefs.reduceMotion ? 'always' : 'user'}>
      <ScrollToTop />
      {/* the splash covers the screen during a route change, so it sits around all of them */}
      <SplashTransitionProvider>
      <DeviceLock>
      {/* friends, colonies and freezes: the signed-in account's social world, kept in step with its savings */}
      <SocialSync>
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/logout" element={<Logout />} />
        <Route path="/welcome" element={<GuestOnly><Welcome /></GuestOnly>} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        {/* not GuestOnly: sign-up makes the account halfway through and carries on after */}
        <Route path="/start" element={<Onboarding />} />
        <Route path="/signup" element={<Navigate to="/start" replace />} />
        <Route path="/signin" element={<GuestOnly><SignIn /></GuestOnly>} />
        <Route path="/onboarding" element={<Navigate to="/start" replace />} />
        {/* a new goal is its own full-screen, one-question-per-screen flow, like signup */}
        <Route path="/goals/new" element={<RequireAuth><NewGoal /></RequireAuth>} />
        {/* every signed-in screen opens as a panel over the hub */}
        <Route element={<RequireAuth><HubShell /></RequireAuth>}>
          <Route path="/home" element={null} />
          {/* Today now lives on Home */}
          <Route path="/today" element={<Navigate to="/home" replace />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/goals/:id" element={<GoalDetail />} />
          <Route path="/goals/:id/edit" element={<EditGoalRedirect />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/activity/:id" element={<TransactionDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:section" element={<ProfileSection />} />
          {/* friends, colonies, shared goals: one panel over home, like the sections above */}
          {/* clubs and their partner promotions, on the live backend */}
          <Route path="/clubs" element={<Clubs />} />
          <Route path="/clubs/:slug" element={<ClubDetail />} />
          <Route path="/promotions" element={<Promotions />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/friends/:id" element={<FriendProfile />} />
          <Route path="/colonies" element={<Colonies />} />
          <Route path="/colonies/invite/:cod" element={<ColonyInvite />} />
          <Route path="/colonies/:id" element={<ColonyDetail />} />
          <Route path="/shared-goal/:id" element={<SharedGoalScreen />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      </SocialSync>
      </DeviceLock>
      </SplashTransitionProvider>
    </MotionConfig>
  );
}
