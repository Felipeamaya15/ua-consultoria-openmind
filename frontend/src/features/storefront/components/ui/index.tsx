import { Link } from 'react-router-dom';
import React, { useId, useEffect, ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

// ── Button ────────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

const btnBase = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none';
const btnVariants: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--primary)] text-white hover:bg-[#0f2a56] focus-visible:outline-[var(--primary)]',
  secondary: 'bg-[var(--secondary)] text-[var(--primary)] hover:bg-[#dce4f4] focus-visible:outline-[var(--primary)]',
  outline: 'border border-[var(--border)] bg-white text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:outline-[var(--ring)]',
  ghost: 'bg-transparent text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:outline-[var(--ring)]',
  danger: 'bg-[var(--error)] text-white hover:bg-red-700 focus-visible:outline-red-600',
  accent: 'bg-[var(--accent)] text-white hover:bg-[#c43a10] focus-visible:outline-[var(--accent)]',
};
const btnSizes: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5 h-7',
  md: 'text-sm px-4 py-2 h-9',
  lg: 'text-base px-6 py-2.5 h-11',
};

export function Button({ variant = 'primary', size = 'md', loading, icon, iconRight, fullWidth, children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      className={`${btnBase} ${btnVariants[variant]} ${btnSizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : icon}
      {children}
      {iconRight && !loading && iconRight}
    </button>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'w-3 h-3', md: 'w-5 h-5', lg: 'w-8 h-8' }[size];
  return <div className={`${s} border-2 border-current border-t-transparent rounded-full animate-spin ${className}`} role="status" aria-label="Cargando" />;
}

// ── Input ─────────────────────────────────────────────────────────────────────
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export function Input({ label, error, hint, icon, iconRight, className = '', id, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col gap-1">
      {label && <label htmlFor={inputId} className="text-sm font-medium text-[var(--foreground)]">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">{icon}</span>}
        <input
          id={inputId}
          className={`w-full h-9 text-sm border rounded-lg px-3 bg-white text-[var(--foreground)] placeholder-[var(--muted-foreground)] transition-colors
            focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)]
            disabled:bg-[var(--muted)] disabled:text-[var(--muted-foreground)] disabled:cursor-not-allowed
            ${error ? 'border-[var(--error)]' : 'border-[var(--border)]'}
            ${icon ? 'pl-9' : ''} ${iconRight ? 'pr-9' : ''} ${className}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {iconRight && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">{iconRight}</span>}
      </div>
      {error && <p id={`${inputId}-error`} className="text-xs text-[var(--error)]" role="alert">{error}</p>}
      {hint && !error && <p id={`${inputId}-hint`} className="text-xs text-[var(--muted-foreground)]">{hint}</p>}
    </div>
  );
}

// ── Textarea ──────────────────────────────────────────────────────────────────
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Textarea({ label, error, hint, className = '', id, ...props }: TextareaProps) {
  const elId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && <label htmlFor={elId} className="text-sm font-medium text-[var(--foreground)]">{label}</label>}
      <textarea
        id={elId}
        className={`w-full text-sm border rounded-lg px-3 py-2 bg-white text-[var(--foreground)] placeholder-[var(--muted-foreground)] transition-colors resize-y
          focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)]
          ${error ? 'border-[var(--error)]' : 'border-[var(--border)]'} ${className}`}
        rows={4}
        {...props}
      />
      {error && <p className="text-xs text-[var(--error)]">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>}
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, error, hint, options, className = '', id, ...props }: SelectProps) {
  const elId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && <label htmlFor={elId} className="text-sm font-medium text-[var(--foreground)]">{label}</label>}
      <select
        id={elId}
        className={`w-full h-9 text-sm border rounded-lg px-3 bg-white text-[var(--foreground)] transition-colors
          focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)]
          ${error ? 'border-[var(--error)]' : 'border-[var(--border)]'} ${className}`}
        {...props}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-[var(--error)]">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';
const badgeStyles: Record<BadgeVariant, string> = {
  default: 'bg-[var(--muted)] text-[var(--muted-foreground)]',
  success: 'bg-[var(--success-bg)] text-[var(--success)]',
  warning: 'bg-[var(--warning-bg)] text-[var(--warning)]',
  error: 'bg-[var(--error-bg)] text-[var(--error)]',
  info: 'bg-[var(--info-bg)] text-[var(--info)]',
  accent: 'bg-[var(--accent)] text-white',
};

export function Badge({ variant = 'default', children, className = '' }: { variant?: BadgeVariant; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${badgeStyles[variant]} ${className}`}>{children}</span>;
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      className={`bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal aria-label={title}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizes[size]} animate-fade-in`}>
        {title && (
          <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
            <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 rounded-lg hover:bg-[var(--muted)] transition-colors" aria-label="Cerrar">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
type ToastVariant = 'success' | 'error' | 'warning' | 'info';
const toastIcons: Record<ToastVariant, string> = {
  success: '✓', error: '✕', warning: '⚠', info: 'ℹ',
};
const toastColors: Record<ToastVariant, string> = {
  success: 'bg-[var(--success-bg)] border-[var(--success)] text-[var(--success)]',
  error: 'bg-[var(--error-bg)] border-[var(--error)] text-[var(--error)]',
  warning: 'bg-[var(--warning-bg)] border-[var(--warning)] text-[var(--warning)]',
  info: 'bg-[var(--info-bg)] border-[var(--info)] text-[var(--info)]',
};

export function Toast({ variant, message, onClose }: { variant: ToastVariant; message: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium shadow-lg animate-fade-in ${toastColors[variant]}`} role="alert">
      <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-current/10">{toastIcons[variant]}</span>
      <span className="text-[var(--foreground)]">{message}</span>
      <button onClick={onClose} className="ml-auto opacity-60 hover:opacity-100" aria-label="Cerrar">✕</button>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
interface Tab { id: string; label: string; icon?: ReactNode }
export function Tabs({ tabs, active, onChange }: { tabs: Tab[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex border-b border-[var(--border)] gap-1" role="tablist">
      {tabs.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
            ${active === t.id ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
        >
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
export function Pagination({ page, total, pageSize = 12, onChange }: { page: number; total: number; pageSize?: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center gap-1" aria-label="Paginación">
      <button onClick={() => onChange(page - 1)} disabled={page === 1} className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] disabled:opacity-40 hover:bg-[var(--muted)] transition-colors">
        ←
      </button>
      {Array.from({ length: Math.min(pages, 7) }, (_, i) => i + 1).map(p => (
        <button key={p} onClick={() => onChange(p)} aria-current={page === p ? 'page' : undefined}
          className={`w-8 h-8 text-sm rounded-lg transition-colors ${page === p ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--muted)]'}`}>
          {p}
        </button>
      ))}
      <button onClick={() => onChange(page + 1)} disabled={page === pages} className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] disabled:opacity-40 hover:bg-[var(--muted)] transition-colors">
        →
      </button>
    </nav>
  );
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Ruta de navegación">
      <ol className="flex items-center gap-1 text-sm text-[var(--muted-foreground)]">
        {items.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="opacity-40">/</span>}
            {item.href ? (
              <Link to={item.href} className="hover:text-[var(--foreground)] transition-colors">{item.label}</Link>
            ) : (
              <span className="text-[var(--foreground)] font-medium">{item.label}</span>
            )}
          </React.Fragment>
        ))}
      </ol>
    </nav>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────
interface Step { id: string; label: string }
export function Stepper({ steps, current }: { steps: Step[]; current: string }) {
  const idx = steps.findIndex(s => s.id === current);
  return (
    <nav aria-label="Pasos del proceso">
      <ol className="flex items-center gap-0">
        {steps.map((step, i) => {
          const done = i < idx, active = i === idx;
          return (
            <React.Fragment key={step.id}>
              <li className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors
                  ${done ? 'bg-[var(--primary)] border-[var(--primary)] text-white' : active ? 'border-[var(--primary)] text-[var(--primary)] bg-white' : 'border-[var(--border)] text-[var(--muted-foreground)] bg-white'}`}>
                  {done ? '✓' : i + 1}
                </div>
                <span className={`text-xs whitespace-nowrap ${active ? 'font-semibold text-[var(--primary)]' : done ? 'text-[var(--muted-foreground)]' : 'text-[var(--muted-foreground)]'}`}>{step.label}</span>
              </li>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 ${i < idx ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`} />
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

// ── Alert ─────────────────────────────────────────────────────────────────────
type AlertVariant = 'success' | 'error' | 'warning' | 'info';
const alertStyles: Record<AlertVariant, string> = {
  success: 'bg-[var(--success-bg)] border-[var(--success)] text-[var(--success)]',
  error: 'bg-[var(--error-bg)] border-[var(--error)] text-[var(--error)]',
  warning: 'bg-[var(--warning-bg)] border-[var(--warning)] text-[var(--warning)]',
  info: 'bg-[var(--info-bg)] border-[var(--info)] text-[var(--info)]',
};

export function Alert({ variant, title, children }: { variant: AlertVariant; title?: string; children: ReactNode }) {
  return (
    <div className={`flex gap-3 p-4 rounded-xl border ${alertStyles[variant]}`} role="alert">
      <div className="flex-1">
        {title && <p className="font-semibold text-sm mb-0.5">{title}</p>}
        <div className="text-sm text-[var(--foreground)] opacity-90">{children}</div>
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center gap-4">
      {icon && <div className="text-5xl text-[var(--muted-foreground)] opacity-40">{icon}</div>}
      <div>
        <h3 className="text-lg font-semibold text-[var(--foreground)]">{title}</h3>
        {description && <p className="text-sm text-[var(--muted-foreground)] mt-1">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label?: string; id?: string }) {
  const elId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none" htmlFor={elId}>
      <div className="relative">
        <input id={elId} type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className={`w-10 h-5 rounded-full transition-colors ${checked ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
      {label && <span className="text-sm text-[var(--foreground)]">{label}</span>}
    </label>
  );
}

// ── Institutional Badge ───────────────────────────────────────────────────────
export function InstitutionalBadge({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 bg-[var(--institutional)] text-white ${compact ? 'px-2.5 py-1.5 rounded-lg text-xs' : 'px-4 py-2 rounded-xl text-sm'} font-semibold`}>
      <img
        src="/logo-universidad-autonoma.png"
        alt="Logo Universidad Autónoma de Chile"
        className={compact ? 'w-6 h-6 object-contain bg-white rounded-md p-0.5 shadow-sm' : 'w-8 h-8 object-contain bg-white rounded-md p-1 shadow-sm'}
      />
      {compact ? 'UAutónoma' : 'Universidad Autónoma de Chile'}
    </div>
  );
}
export { Icon } from './Icon';