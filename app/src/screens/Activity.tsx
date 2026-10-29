import { ListOrdered, Plus } from '@/lib/icons';
import { useMemo, useState } from 'react';
import { TxRow } from '../components/domain';
import { MoneySheet } from '../components/sheets';
import { Select } from '../components/watermelon/select';
import { Button, EmptyState } from '../components/ui';
import { sortTx } from '../data/selectors';
import { useData } from '../data/store';
import type { Transaction } from '../data/types';
import { formatDay } from '../lib/dates';
import { formatLei } from '../lib/money';

type Filter = 'all' | 'contribution' | 'withdrawal' | 'pending';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'contribution', label: 'Deposits' },
  { value: 'withdrawal', label: 'Withdrawals' },
  { value: 'pending', label: 'Pending and failed' },
];

export function Activity() {
  const data = useData();
  const [filter, setFilter] = useState<Filter>('all');
  const [goalFilter, setGoalFilter] = useState('all');
  const [adding, setAdding] = useState(false);

  const list = useMemo(() => {
    return sortTx(data.transactions).filter((t) => {
      if (filter === 'pending' ? t.status === 'confirmed' : filter !== 'all' && t.type !== filter) return false;
      if (goalFilter === 'none') return t.goalId === null;
      if (goalFilter !== 'all') return t.goalId === goalFilter;
      return true;
    });
  }, [data.transactions, filter, goalFilter]);

  const groups = useMemo(() => {
    const out: { date: string; items: Transaction[]; net: number }[] = [];
    for (const t of list) {
      const last = out[out.length - 1];
      const signed = t.status === 'confirmed' ? (t.type === 'contribution' ? t.amount : -t.amount) : 0;
      if (last && last.date === t.date) {
        last.items.push(t);
        last.net += signed;
      } else out.push({ date: t.date, items: [t], net: signed });
    }
    return out;
  }, [list]);

  return (
    <div className="screen">
      <header className="page-head">
        <h1>Activity</h1>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setAdding(true)}>
          Add an entry
        </Button>
      </header>

      <div className="stack">
        <div className="chips" role="group" aria-label="Filter by type">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" className="chip" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        {data.goals.length > 0 && (
          <Select
            size="sm"
            label="Goal"
            value={goalFilter}
            onChange={setGoalFilter}
            options={[{ value: 'all', label: 'All goals' }, ...data.goals.map((g) => ({ value: g.id, label: g.name })), { value: 'none', label: 'No goal' }]}
          />
        )}
      </div>

      {data.transactions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ListOrdered}
            title="Nothing here yet"
            body="Every deposit and withdrawal you add shows up here, with where it came from."
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add your first savings
              </Button>
            }
          />
        </div>
      ) : groups.length === 0 ? (
        <div className="card">
          <EmptyState icon={ListOrdered} title="No results" body="Nothing matches these filters." action={<Button onClick={() => { setFilter('all'); setGoalFilter('all'); }}>Reset filters</Button>} />
        </div>
      ) : (
        <div className="stack-lg">
          {groups.map((g) => (
            <section key={g.date} className="section" aria-label={formatDay(g.date)}>
              <div className="section-head">
                <h2 className="small" style={{ fontSize: 'var(--fs-sm)' }}>
                  {formatDay(g.date)}
                </h2>
                {g.net !== 0 && <span className="small subtle money">{formatLei(g.net, { sign: true })}</span>}
              </div>
              <div className="card card--flush">
                <ul className="list">
                  {g.items.map((t) => (
                    <li key={t.id}>
                      <TxRow tx={t} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
          <p className="small subtle" style={{ textAlign: 'center' }}>
            Pending and failed entries show up here, but never count toward your savings.
          </p>
        </div>
      )}
      <MoneySheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
