/**
 * Estados de interfaz compartidos: carga (SCRUM-451), error (SCRUM-452) y vacío (SCRUM-454).
 *
 * Este módulo no depende de ningún otro componente de la aplicación (solo de React) para poder usarse en
 * cualquier pantalla, de la tienda o del panel, sin acoplarse a un sistema de diseño en particular.
 */
import type { ReactNode } from 'react';

const SPINNER_SIZES = { sm: 'w-3 h-3', md: 'w-5 h-5', lg: 'w-8 h-8' } as const;
const SPACING = { normal: 'py-6', compact: 'py-2', none: '' } as const;

export interface LoadingStateProps {
  /** Texto que ve la persona y que anuncian los lectores de pantalla. Por defecto, "Cargando…". */
  children?: ReactNode;
  size?: keyof typeof SPINNER_SIZES;
  /** Alineación del indicador: centrado (por defecto) o al inicio, para cargas dentro de una lista o un formulario. */
  align?: 'center' | 'start';
  /** Espacio vertical: `normal` (bloque), `compact` (en línea) o `none` si el contenedor ya tiene su propio espacio. */
  spacing?: keyof typeof SPACING;
  className?: string;
}

/** Indicador de carga: ruedita + texto, anunciado como estado (`role="status"`) y marcado como ocupado. */
export function LoadingState({ children = 'Cargando…', size = 'md', align = 'center', spacing = 'normal', className = '' }: LoadingStateProps) {
  const classes = [
    'flex items-center gap-3 text-sm text-[var(--muted-foreground)]',
    align === 'center' ? 'justify-center' : '',
    SPACING[spacing],
    className,
  ].filter(Boolean).join(' ');
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={classes}>
      <span aria-hidden="true" className={`${SPINNER_SIZES[size]} shrink-0 border-2 border-current border-t-transparent rounded-full animate-spin`} />
      <span>{children}</span>
    </div>
  );
}

export interface ErrorStateProps {
  /** Mensaje para la persona: debe ser comprensible, sin términos técnicos. Si falta o está vacío se usa uno genérico. */
  children?: ReactNode;
  /** Título opcional, en negrita sobre el mensaje. */
  title?: string;
  /** Si se entrega, aparece un botón para volver a intentar. */
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

const DEFAULT_ERROR_MESSAGE = 'No pudimos cargar la información. Intenta nuevamente.';
const RETRY_BUTTON = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-150 select-none border border-[var(--border)] bg-white text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] text-xs px-3 py-1.5 h-7';

/** Error al cargar datos: mensaje claro, anunciado como alerta (`role="alert"`) y, si se puede, con botón para reintentar. */
export function ErrorState({ children, title, onRetry, retryLabel = 'Reintentar', className = '' }: ErrorStateProps) {
  const sinMensaje = children === undefined || children === null || children === false || (typeof children === 'string' && !children.trim());
  const classes = ['flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm bg-[var(--error-bg)] border-[var(--error)]', className].filter(Boolean).join(' ');
  return (
    <div role="alert" className={classes}>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-[var(--error)]">{title}</p>}
        <div className="text-[var(--foreground)]">{sinMensaje ? DEFAULT_ERROR_MESSAGE : children}</div>
      </div>
      {onRetry && <button type="button" onClick={onRetry} className={RETRY_BUTTON}>{retryLabel}</button>}
    </div>
  );
}

const EMPTY_SPACING = { normal: 'py-10', compact: 'py-4', none: '' } as const;

export interface EmptyListStateProps {
  /** Mensaje: qué falta y, si ayuda, qué hacer. */
  children: ReactNode;
  /** Título opcional, en negrita sobre el mensaje. */
  title?: string;
  /** Ícono o ilustración opcional (se oculta a los lectores de pantalla). */
  icon?: ReactNode;
  /** Acción sugerida para salir del estado vacío: un enlace o un botón. */
  action?: ReactNode;
  /** Alineación del contenido: centrado (por defecto) o al inicio, para vacíos dentro de una tarjeta o de un texto corrido. */
  align?: 'center' | 'start';
  /** Espacio vertical: `normal` (bloque), `compact` (en línea) o `none` si el contenedor ya tiene su propio espacio. */
  spacing?: keyof typeof EMPTY_SPACING;
  className?: string;
}

/**
 * Lista, tabla o panel sin datos. Para una pantalla completa vacía (por ejemplo el carrito) se usa el `EmptyState`
 * del sistema de diseño de la tienda.
 */
export function EmptyListState({ children, title, icon, action, align = 'center', spacing = 'normal', className = '' }: EmptyListStateProps) {
  const classes = [
    'flex flex-col gap-1 text-sm text-[var(--muted-foreground)]',
    align === 'center' ? 'items-center text-center' : 'items-start text-left',
    EMPTY_SPACING[spacing],
    className,
  ].filter(Boolean).join(' ');
  return (
    <div role="status" className={classes}>
      {icon && <div aria-hidden="true" className="mb-1">{icon}</div>}
      {title && <p className="font-semibold text-[var(--foreground)]">{title}</p>}
      <div>{children}</div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
