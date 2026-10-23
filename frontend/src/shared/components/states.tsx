/**
 * Estados de interfaz compartidos: carga (SCRUM-451).
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
