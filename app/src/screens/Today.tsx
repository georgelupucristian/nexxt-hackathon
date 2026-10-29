import { HardDrive, RefreshCw } from '@/lib/icons';
import { useNavigate } from 'react-router-dom';
import { SourceLine } from '../components/domain';
import { Banner, Button, Sheet, useToast } from '../components/ui';
import { activeGoals, breakdown, goalSaved } from '../data/selectors';
import { useData, useStore } from '../data/store';
import { relativeTime } from '../lib/dates';
import { formatLei } from '../lib/money';

// The old Today screen (with its "check the plan" step) is gone: home took over, and a day only
// counts when money goes aside. What's left is the balance breakdown sheet the hub shell mounts.

export function BalanceDetails({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const { sync } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const b = breakdown(data.transactions);
  const goals = data.goals;
  const syncing = data.connection.status === 'syncing';
  return (
    <Sheet open={open} onClose={onClose} title="Balance details">
      <div className="stack-lg">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <SourceLine />
        </div>
        <dl className="card" style={{ margin: 0, paddingTop: 'var(--s-2)', paddingBottom: 'var(--s-2)' }}>
          <div className="kv">
            <dt>Total savings</dt>
            <dd className="money">{formatLei(b.total)}</dd>
          </div>
          {goals.map((g) => (
            <div className="kv" key={g.id}>
              <dt className="truncate" style={{ paddingLeft: 'var(--s-3)' }}>
                {g.name}
                {g.status === 'paused' ? ' (paused)' : g.status === 'archived' ? ' (archived)' : ''}
              </dt>
              <dd className="money">{formatLei(goalSaved(data.transactions, g.id))}</dd>
            </div>
          ))}
          <div className="kv">
            <dt style={{ paddingLeft: 'var(--s-3)' }}>No goal</dt>
            <dd className="money">{formatLei(b.unallocated)}</dd>
          </div>
          {(b.pendingIn > 0 || b.pendingOut > 0) && (
            <div className="kv">
              <dt>Pending (not counted)</dt>
              <dd className="money">
                {b.pendingIn > 0 && formatLei(b.pendingIn, { sign: true })} {b.pendingOut > 0 && formatLei(-b.pendingOut)}
              </dd>
            </div>
          )}
        </dl>
        <p className="small muted">
          Every leu is counted once: it belongs to a goal, or it has no goal. The total only includes confirmed entries. Pending and failed ones stay out.
        </p>
        {data.tracking === 'demo' ? (
          <div className="stack">
            <p className="small subtle">
              Demo Bank is simulated. Last sync: {data.connection.lastSyncAt ? relativeTime(data.connection.lastSyncAt) : 'never'}.
            </p>
            <Button
              block
              loading={syncing}
              icon={RefreshCw}
              onClick={async () => {
                try {
                  await sync();
                  toast('Synced. Pending transfers are confirmed.');
                } catch (e) {
                  toast((e as Error).message, 'error');
                }
              }}
            >
              Sync now
            </Button>
          </div>
        ) : (
          <Banner tone="neutral" icon={HardDrive}>
            These numbers are what you added yourself. Kip can't see your bank account.
          </Banner>
        )}
        <Button
          variant="ghost"
          block
          onClick={() => {
            onClose();
            nav('/activity');
          }}
        >
          See all activity
        </Button>
        {activeGoals(goals).length === 0 && <p className="small subtle">You have no goals yet, so everything is without a goal.</p>}
      </div>
    </Sheet>
  );
}
