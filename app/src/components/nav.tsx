import { Home, ListOrdered, Sprout, Target, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/activity', label: 'Activity', icon: ListOrdered },
  { to: '/profile', label: 'Profile', icon: User },
];

export function Brand() {
  return (
    <span className="brand">
      <span className="brand__mark" aria-hidden>
        <Sprout size={18} />
      </span>
      Kept
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell app-shell--nav">
      <aside className="sidenav" aria-label="Primary">
        <Brand />
        <nav>
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={20} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="app-main">{children}</main>
      <nav className="tabbar" aria-label="Primary">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="tab">
            <span className="tab__icon">
              <Icon size={22} aria-hidden />
            </span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
