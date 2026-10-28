// Adapted from Watermelon UI "Floating Input" (ui.watermelon.sh/animated-components/floating-input):
// the label rests inside the field and floats up on focus or once there's a value. Added error
// and hint text, a show/hide toggle for passwords, and app colours.
import { Eye, EyeOff } from '@/lib/icons';
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FloatingInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: ReactNode;
}

export function FloatingInput({ label, error, hint, className, type = 'text', id, ...props }: FloatingInputProps) {
  const auto = useId();
  const fid = id ?? auto;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  const describedBy = error || hint ? `${fid}-d` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <input
          id={fid}
          type={isPassword && reveal ? 'text' : type}
          placeholder=" "
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'peer h-14 w-full rounded-2xl border-2 bg-surface px-4 pt-4 text-[17px] font-medium text-ink outline-none transition-[border-color,box-shadow] duration-200',
            error ? 'border-danger' : 'border-line hover:border-[#cfcac0] focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]',
            isPassword && 'pr-12',
            className,
          )}
          {...props}
        />
        <label
          htmlFor={fid}
          className={cn(
            'pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[17px] text-ink-3 transition-all duration-200',
            'peer-focus:top-3.5 peer-focus:text-xs peer-focus:font-semibold peer-focus:text-accent',
            'peer-[:not(:placeholder-shown)]:top-3.5 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:font-semibold',
            error && 'peer-focus:text-danger',
          )}
        >
          {label}
        </label>
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            className="absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            {reveal ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
          </button>
        )}
      </div>
      {(error || hint) && (
        <p id={describedBy} role={error ? 'alert' : undefined} className={cn('m-0 px-1 text-sm', error ? 'font-medium text-danger' : 'text-ink-3')}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
