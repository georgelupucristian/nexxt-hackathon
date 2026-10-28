import { ArrowDownLeft, ArrowUpRight, Clock, FlaskConical, PenLine, Trash2, XCircle } from '@/lib/icons';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { MoneySheet } from '../components/sheets';
import { Banner, Button, ConfirmDialog, TopBar, TxStatusPill, txStatusText, useToast } from '../components/ui';
import { ActionError, useData, useStore } from '../data/store';
import { formatDate } from '../lib/dates';
import { formatLei } from '../lib/money';

export function TransactionDetail() {
  const { id } = useParams();
  const data = useData();
  const { deleteTransaction } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const tx = data.transactions.find((t) => t.id === id);
  if (!tx) return <Navigate to="/activity" replace />;
  const goal = tx.goalId ? data.goals.find((g) => g.id === tx.goalId) : null;
  const isIn = tx.type === 'contribution';
  const recorded = new Date(tx.createdAt);

  return (
    <div className="screen">
      <TopBar title={isIn ? 'Depunere' : 'Retragere'} />
      <section className="stack" style={{ alignItems: 'center', textAlign: 'center', paddingBlock: 'var(--s-4)' }}>
        <span className="list-row__icon" style={{ width: 56, height: 56, ...(isIn ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' } : {}) }} aria-hidden>
          {isIn ? <ArrowDownLeft size={26} /> : <ArrowUpRight size={26} />}
        </span>
        <p
          className={`money ${isIn && tx.status === 'confirmed' ? 'positive' : ''}`}
          style={{ fontSize: 'var(--fs-3xl)', fontWeight: 750, letterSpacing: '-0.03em', textDecoration: tx.status === 'failed' ? 'line-through' : undefined, color: tx.status !== 'confirmed' ? 'var(--ink-3)' : undefined }}
        >
          {formatLei(isIn ? tx.amount : -tx.amount, { sign: true, forceDecimals: true })}
        </p>
        <p className="muted clamp-2">{tx.note || (isIn ? 'Depunere' : 'Retragere')}</p>
        <TxStatusPill tx={tx} />
      </section>

      {tx.status === 'pending' && (
        <Banner tone="warn" icon={Clock}>
          <strong>Transfer în așteptare.</strong> Nu intră încă în totalul economiilor. {tx.source === 'demo' ? 'Se confirmă la următoarea sincronizare simulată.' : ''}
        </Banner>
      )}
      {tx.status === 'failed' && (
        <Banner tone="danger" icon={XCircle}>
          <strong>Transferul a eșuat.</strong> Nu s-a adăugat niciun ban și nu contează nicăieri.
        </Banner>
      )}
      {tx.source === 'demo' && (
        <Banner tone="demo" icon={FlaskConical}>
          Simulat de conexiunea demo. Nu e o înregistrare bancară reală.
        </Banner>
      )}

      <section className="card">
        <dl style={{ margin: 0 }}>
          <div className="kv">
            <dt>Stare</dt>
            <dd>{txStatusText(tx)}</dd>
          </div>
          <div className="kv">
            <dt>Sursă</dt>
            <dd>{tx.source === 'demo' ? 'Banca Demo (simulată)' : 'Intrare manuală'}</dd>
          </div>
          <div className="kv">
            <dt>{isIn ? 'Pentru' : 'Luat din'}</dt>
            <dd>{goal ? <Link to={`/goals/${goal.id}`}>{goal.name}</Link> : 'Economii nealocate'}</dd>
          </div>
          <div className="kv">
            <dt>Data</dt>
            <dd>{formatDate(tx.date)}</dd>
          </div>
          <div className="kv">
            <dt>Adăugat</dt>
            <dd>
              {formatDate(tx.createdAt.slice(0, 10))}, {recorded.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
            </dd>
          </div>
          {tx.updatedAt !== tx.createdAt && tx.source === 'manual' && (
            <div className="kv">
              <dt>Editat ultima dată</dt>
              <dd>{formatDate(tx.updatedAt.slice(0, 10))}</dd>
            </div>
          )}
        </dl>
      </section>

      {tx.source === 'manual' ? (
        <div className="btn-row">
          <Button icon={PenLine} onClick={() => setEditing(true)}>
            Editează
          </Button>
          <Button variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>
            Șterge
          </Button>
        </div>
      ) : (
        <p className="small subtle">Intrările din conexiunea demo nu pot fi editate sau șterse, la fel ca înregistrările importate dintr-o bancă reală.</p>
      )}

      <MoneySheet open={editing} onClose={() => setEditing(false)} editing={tx} />
      <ConfirmDialog
        open={confirm}
        title="Ștergi intrarea asta?"
        danger
        body={`${isIn ? `Scoatem ${formatLei(tx.amount)} din` : `Punem ${formatLei(tx.amount)} înapoi în`} ${goal ? goal.name : 'economiile nealocate'}. Istoricul seriei tale nu se schimbă.`}
        confirmLabel="Șterge"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          try {
            deleteTransaction(tx.id);
            toast('Intrare ștearsă');
            nav('/activity', { replace: true });
          } catch (e) {
            setConfirm(false);
            toast(e instanceof ActionError ? e.message : 'Nu am putut șterge intrarea.', 'error');
          }
        }}
      />
    </div>
  );
}
