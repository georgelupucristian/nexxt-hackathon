import { ArrowDownLeft, ArrowUpRight, Clock, FlaskConical, PenLine, Trash2, XCircle } from 'lucide-react';
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
      <TopBar title={isIn ? 'Contribution' : 'Withdrawal'} />
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
        <p className="muted clamp-2">{tx.note || (isIn ? 'Contribution' : 'Withdrawal')}</p>
        <TxStatusPill tx={tx} />
      </section>

      {tx.status === 'pending' && (
        <Banner tone="warn" icon={Clock}>
          <strong>Transfer pending.</strong> This isn’t part of your savings total yet. {tx.source === 'demo' ? 'It confirms on the next simulated sync.' : ''}
        </Banner>
      )}
      {tx.status === 'failed' && (
        <Banner tone="danger" icon={XCircle}>
          <strong>This transfer failed.</strong> No money was added, and it isn’t counted anywhere.
        </Banner>
      )}
      {tx.source === 'demo' && (
        <Banner tone="demo" icon={FlaskConical}>
          Simulated by the demo connection. Not a real bank record.
        </Banner>
      )}

      <section className="card">
        <dl style={{ margin: 0 }}>
          <div className="kv">
            <dt>Status</dt>
            <dd>{txStatusText(tx)}</dd>
          </div>
          <div className="kv">
            <dt>Source</dt>
            <dd>{tx.source === 'demo' ? 'Demo Bank (simulated)' : 'Manual entry'}</dd>
          </div>
          <div className="kv">
            <dt>{isIn ? 'Towards' : 'Taken from'}</dt>
            <dd>{goal ? <Link to={`/goals/${goal.id}`}>{goal.name}</Link> : 'Unallocated savings'}</dd>
          </div>
          <div className="kv">
            <dt>Date</dt>
            <dd>{formatDate(tx.date)}</dd>
          </div>
          <div className="kv">
            <dt>Recorded</dt>
            <dd>
              {formatDate(tx.createdAt.slice(0, 10))}, {recorded.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </dd>
          </div>
          {tx.updatedAt !== tx.createdAt && tx.source === 'manual' && (
            <div className="kv">
              <dt>Last edited</dt>
              <dd>{formatDate(tx.updatedAt.slice(0, 10))}</dd>
            </div>
          )}
        </dl>
      </section>

      {tx.source === 'manual' ? (
        <div className="btn-row">
          <Button icon={PenLine} onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>
            Delete
          </Button>
        </div>
      ) : (
        <p className="small subtle">Entries from the demo connection can’t be edited or deleted — just like records imported from a real bank.</p>
      )}

      <MoneySheet open={editing} onClose={() => setEditing(false)} editing={tx} />
      <ConfirmDialog
        open={confirm}
        title="Delete this entry?"
        danger
        body={`${formatLei(tx.amount)} ${isIn ? 'will be removed from' : 'will be added back to'} ${goal ? goal.name : 'unallocated savings'}. Your streak history isn’t affected.`}
        confirmLabel="Delete"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          try {
            deleteTransaction(tx.id);
            toast('Entry deleted');
            nav('/activity', { replace: true });
          } catch (e) {
            setConfirm(false);
            toast(e instanceof ActionError ? e.message : 'Could not delete this entry.', 'error');
          }
        }}
      />
    </div>
  );
}
