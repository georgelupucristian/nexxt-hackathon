// How Stripe objects turn into Kip's ledger rows and plan states. Pure: no Stripe calls and no
// database, so the unit tests feed it plain objects shaped like Stripe's. The webhook and the
// payments function do the I/O around it.
import { bucharestDate } from './dates.ts';

/** The values profiles.subscription_status allows (see the check constraint in 0001). */
export type PlanStatus = 'none' | 'incomplete' | 'active' | 'past_due' | 'paused' | 'canceled';

/** A Stripe subscription's state as Kip shows it. Paused collection wins over Stripe's own status. */
export function mapSubscriptionStatus(sub: { status: string; pause_collection?: unknown }): PlanStatus {
  if (sub.pause_collection && ['active', 'trialing', 'past_due'].includes(sub.status)) return 'paused';
  switch (sub.status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'paused':
      return 'paused';
    case 'incomplete':
      return 'incomplete';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'none';
  }
}

/** The ledger date for a Stripe timestamp: its Bucharest day (clock time for demo customers). */
export function dateOf(unix: number | null | undefined): string {
  return bucharestDate(unix ? new Date(unix * 1000) : new Date());
}

interface InvoiceLine {
  amount: number;
  metadata?: Record<string, string> | null;
}

/**
 * invoice.paid: what was paid splits into the monthly top-up and the extra deposits that rode on
 * the same invoice (their own lines, tagged by payments.extra_deposit). Each becomes its own
 * ledger row, so the top-up amount never includes an extra deposit.
 */
export function splitPaidInvoice(inv: { amount_paid: number; lines: { data: InvoiceLine[] } }): {
  topup: number;
  extra: number;
  extraNote: string | null;
} {
  const extraLines = inv.lines.data.filter((l) => l.metadata?.type === 'extra_deposit');
  const extra = extraLines.reduce((s, l) => s + l.amount, 0);
  const extraNote = extraLines.map((l) => l.metadata?.note).filter(Boolean).join(' · ').slice(0, 140) || null;
  return { topup: inv.amount_paid - extra, extra, extraNote };
}

export interface PaymentMoney {
  userId: string;
  type: 'parent_match' | 'extra_deposit';
  bucket: 'goal' | 'de_pus_deoparte';
  amount: number;
  status: 'confirmed' | 'failed';
  object: string;
  matched: boolean;
  note: string | null;
  /** The day stamped on the payment when it was created; null means "today" for that student. */
  entryDate: string | null;
}

/**
 * payment_intent.succeeded / payment_failed: the ledger row a one-off payment settles. A parent's
 * match goes straight into the goal and is marked matched (it can't be withdrawn); an extra
 * deposit lands in de_pus_deoparte. Anything else Stripe sends is not Kip money: null.
 */
export function paymentIntentMoney(
  pi: { id: string; amount: number; metadata?: Record<string, string> | null },
  status: 'confirmed' | 'failed',
): PaymentMoney | null {
  const type = pi.metadata?.type;
  const userId = pi.metadata?.user_id;
  if (!userId || (type !== 'parent_match' && type !== 'extra_deposit')) return null;
  const entryDate = pi.metadata?.entry_date ?? null;
  if (type === 'parent_match') {
    return { userId, type, bucket: 'goal', amount: pi.amount, status, object: pi.id, matched: true, note: null, entryDate };
  }
  return { userId, type, bucket: 'de_pus_deoparte', amount: pi.amount, status, object: pi.id, matched: false, note: pi.metadata?.note ?? null, entryDate };
}
