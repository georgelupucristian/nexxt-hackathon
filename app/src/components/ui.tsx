import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FlaskConical,
  Laptop,
  PenLine,
  Plane,
  ShieldCheck,
  Target,
  X,
  XCircle,
  type LucideIcon,
} from '@/lib/icons';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { GoalKind, GoalStatus, Transaction } from '../data/types';
import { splitLei } from '../lib/money';
import { Emoji3D, GOAL_EMOJI } from './Emoji3D';

// ---------- Buttons ----------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  size?: 'md' | 'sm';
  loading?: boolean;
  icon?: LucideIcon;
}

export function Button({ variant = 'secondary', block, size = 'md', loading, icon: Icon, children, className = '', disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`btn btn--${variant} ${block ? 'btn--block' : ''} ${size === 'sm' ? 'btn--sm' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : Icon ? <Icon size={18} aria-hidden /> : null}
      {children}
    </button>
  );
}

export function IconButton({ label, icon: Icon, filled, ...rest }: { label: string; icon: LucideIcon; filled?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`icon-btn ${filled ? 'icon-btn--filled' : ''}`} aria-label={label} title={label} {...rest}>
      <Icon size={20} aria-hidden />
    </button>
  );
}

export function TopBar({ title, back = true, end, onBack }: { title?: string; back?: boolean; end?: ReactNode; onBack?: () => void }) {
  const nav = useNavigate();
  return (
    <header className="topbar">
      <div>{back && <IconButton label="Back" icon={ArrowLeft} onClick={onBack ?? (() => (window.history.length > 1 ? nav(-1) : nav('/home')))} />}</div>
      <div className="topbar__title truncate">{title}</div>
      <div className="topbar__end">{end}</div>
    </header>
  );
}

// ---------- Forms ----------

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="field-error" role="alert">
          <AlertCircle size={16} aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p className="hint">{hint}</p>
      ) : null}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  suffix?: string;
}

export function TextField({ label, hint, error, suffix, id, ...rest }: TextFieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const input = <input id={fid} className="input" aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${fid}-d` : undefined} {...rest} />;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fid}>
      {suffix ? (
        <div className="input-affix">
          {input}
          <span className="input-affix__suffix">{suffix}</span>
        </div>
      ) : (
        input
      )}
    </Field>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DayPicker({ value, onChange }: { value: number | null; onChange: (d: number) => void }) {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div className="day-picker" role="group" aria-label="Day of the week">
      {names.map((n, i) => (
        <button key={n} type="button" aria-pressed={value === i} onClick={() => onChange(i)}>
          {n}
        </button>
      ))}
    </div>
  );
}

// ---------- Display ----------

export function BigAmount({ value, size = 'lg', hidden }: { value: number; size?: 'lg' | 'md'; hidden?: boolean }) {
  const { int, dec } = splitLei(value);
  if (hidden) {
    return (
      <div className={`big-amount ${size === 'md' ? 'big-amount--md' : ''}`} aria-label="Balance hidden">
        <span className="big-amount__int">••••</span>
        <span className="big-amount__cur">lei</span>
      </div>
    );
  }
  return (
    <div className={`big-amount ${size === 'md' ? 'big-amount--md' : ''}`}>
      <span className="big-amount__int">
        {value < 0 ? '−' : ''}
        {int}
      </span>
      <span className="big-amount__dec">,{dec}</span>
      <span className="big-amount__cur">lei</span>
    </div>
  );
}

export function ProgressBar({ value, label, size, paused, onDark }: { value: number; label: string; size?: 'lg'; paused?: boolean; onDark?: boolean }) {
  const pct = Math.round(value * 100);
  return (
    <div
      className={`progress ${size === 'lg' ? 'progress--lg' : ''} ${paused ? 'progress--paused' : ''} ${onDark ? 'progress--on-dark' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="progress__fill" style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%` }} />
    </div>
  );
}

export function Banner({ tone = 'info', icon: Icon = AlertCircle, children, action }: { tone?: 'info' | 'warn' | 'danger' | 'demo' | 'neutral'; icon?: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`banner banner--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden />
      <div className="grow">{children}</div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon">
        <Icon size={24} aria-hidden />
      </div>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}

// ---------- Status ----------

export const GOAL_ICON: Record<GoalKind, LucideIcon> = {
  emergency: ShieldCheck,
  tech: Laptop,
  travel: Plane,
  custom: Target,
};

export function GoalGlyph({ kind, size, status }: { kind: GoalKind; size?: 'lg'; status?: GoalStatus }) {
  return (
    <span className={`goal-glyph goal-glyph--${kind} ${size === 'lg' ? 'goal-glyph--lg' : ''} ${status && status !== 'active' ? 'goal-glyph--paused' : ''}`} aria-hidden>
      <Emoji3D name={GOAL_EMOJI[kind]} size={size === 'lg' ? 38 : 30} />
    </span>
  );
}

/** One pill per transaction that says both where it came from and whether it counts. */
export function TxStatusPill({ tx }: { tx: Transaction }) {
  if (tx.status === 'failed')
    return (
      <span className="pill pill--danger">
        <XCircle aria-hidden /> Failed
      </span>
    );
  if (tx.status === 'pending')
    return (
      <span className="pill pill--warn">
        <Clock aria-hidden /> Pending
      </span>
    );
  if (tx.source === 'demo')
    return (
      <span className="pill pill--demo">
        <FlaskConical aria-hidden /> Simulated
      </span>
    );
  return (
    <span className="pill">
      <PenLine aria-hidden /> Manual
    </span>
  );
}

export function txStatusText(tx: Transaction): string {
  if (tx.status === 'failed') return 'Failed, not counted in your savings';
  if (tx.status === 'pending') return tx.source === 'demo' ? 'Transfer pending. Counts once confirmed.' : 'Pending';
  return tx.source === 'demo' ? 'Confirmed (simulated, demo connection)' : 'Recorded manually by you';
}

// ---------- Sheet / dialog ----------

function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter((n) => !n.hasAttribute('disabled'));
    // Focus the first form control if there is one, else the sheet itself.
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const a = f[0];
        const z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
    // onClose identity changes every render; the trap only needs to reset when open flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return ref;
}

export function Sheet({ open, onClose, title, children, dialog }: { open: boolean; onClose: () => void; title: string; children: ReactNode; dialog?: boolean }) {
  const ref = useFocusTrap(open, onClose);
  const tid = useId();
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`sheet ${dialog ? 'dialog' : ''}`} role="dialog" aria-modal="true" aria-labelledby={tid}>
        {!dialog && <div className="sheet__handle" aria-hidden />}
        <div className="sheet__head">
          <h2 id={tid}>{title}</h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} dialog>
      <div className="stack-lg">
        <div className="muted">{body}</div>
        <div className="btn-row">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger-solid' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------- Toasts ----------

interface ToastMsg {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'error') => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-1), { id, text, tone }]);
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-region" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'toast--error' : ''}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            {t.tone === 'error' ? <AlertCircle size={18} aria-hidden /> : <CheckCircle2 size={18} aria-hidden />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
