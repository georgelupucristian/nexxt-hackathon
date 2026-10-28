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
  { value: 'all', label: 'Toate' },
  { value: 'contribution', label: 'Depuneri' },
  { value: 'withdrawal', label: 'Retrageri' },
  { value: 'pending', label: 'În așteptare și eșuate' },
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
        <h1>Activitate</h1>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setAdding(true)}>
          Adaugă o intrare
        </Button>
      </header>

      <div className="stack">
        <div className="chips" role="group" aria-label="Filtrează după tip">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" className="chip" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        {data.goals.length > 0 && (
          <Select
            size="sm"
            label="Obiectiv"
            value={goalFilter}
            onChange={setGoalFilter}
            options={[{ value: 'all', label: 'Toate obiectivele' }, ...data.goals.map((g) => ({ value: g.id, label: g.name })), { value: 'none', label: 'Nealocat' }]}
          />
        )}
      </div>

      {data.transactions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ListOrdered}
            title="Nimic adăugat încă"
            body="Fiecare depunere și retragere pe care o adaugi apare aici, cu sursa ei."
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                Adaugă primele economii
              </Button>
            }
          />
        </div>
      ) : groups.length === 0 ? (
        <div className="card">
          <EmptyState icon={ListOrdered} title="Niciun rezultat" body="Nimic nu se potrivește cu filtrele astea." action={<Button onClick={() => { setFilter('all'); setGoalFilter('all'); }}>Resetează filtrele</Button>} />
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
            Intrările în așteptare și cele eșuate apar aici, dar nu intră niciodată în economiile tale.
          </p>
        </div>
      )}
      <MoneySheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
