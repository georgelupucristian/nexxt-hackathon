import { ChevronDown, Plus, Target } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoalCard } from '../components/domain';
import { Button, EmptyState } from '../components/ui';
import { breakdown } from '../data/selectors';
import { useData } from '../data/store';
import { formatLei } from '../lib/money';

export function Goals() {
  const data = useData();
  const nav = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const b = breakdown(data.transactions);
  const sorted = [...data.goals].sort((a, b2) => Number(b2.isPrimary) - Number(a.isPrimary));
  const active = sorted.filter((g) => g.status === 'active');
  const paused = sorted.filter((g) => g.status === 'paused');
  const archived = sorted.filter((g) => g.status === 'archived');

  return (
    <div className="screen screen--wide">
      <header className="page-head">
        <h1>Goals</h1>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => nav('/goals/new')}>
          New goal
        </Button>
      </header>

      {data.goals.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Target}
            title="Save with goals"
            body="A goal gives your savings a purpose and a plan. Start with one — you can add more anytime."
            action={
              <Button variant="primary" onClick={() => nav('/goals/new')}>
                Create a goal
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="card card--tint row" style={{ flexWrap: 'wrap', gap: 'var(--s-6)' }}>
            <div className="stat">
              <span>Total savings</span>
              <strong>{formatLei(b.total)}</strong>
            </div>
            <div className="stat">
              <span>In goals</span>
              <strong>{formatLei(b.allocated)}</strong>
            </div>
            <div className="stat">
              <span>Unallocated</span>
              <strong>{formatLei(b.unallocated)}</strong>
            </div>
          </div>

          {active.length > 0 && (
            <section className="section" aria-label="Active goals">
              <h2 className="group-label">Active · {active.length}</h2>
              <div className="goals-grid">
                {active.map((g) => (
                  <GoalCard key={g.id} goal={g} />
                ))}
              </div>
            </section>
          )}
          {active.length === 0 && (
            <p className="muted">No active goals. Resume a paused goal or create a new one.</p>
          )}
          {paused.length > 0 && (
            <section className="section" aria-label="Paused goals">
              <h2 className="group-label">Paused · {paused.length}</h2>
              <div className="goals-grid">
                {paused.map((g) => (
                  <GoalCard key={g.id} goal={g} compact />
                ))}
              </div>
            </section>
          )}
          {archived.length > 0 && (
            <section className="section">
              <button type="button" className="link-btn row" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)} style={{ textDecoration: 'none', gap: 6 }}>
                Archived · {archived.length}
                <ChevronDown size={16} aria-hidden style={{ transform: showArchived ? 'rotate(180deg)' : undefined }} />
              </button>
              {showArchived && (
                <div className="goals-grid">
                  {archived.map((g) => (
                    <GoalCard key={g.id} goal={g} compact />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
