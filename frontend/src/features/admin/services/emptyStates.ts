/**
 * Qué mostrar cuando una lista del panel no tiene filas (SCRUM-454).
 *
 * Distingue "todavía no hay nada" de "hay datos, pero los filtros o la búsqueda no encuentran ninguno", porque
 * el mensaje y la acción sugerida son distintos en cada caso.
 */
export type EmptyKind = 'empty' | 'no-results';

export function emptyKind({ loading, error, shown, searching }: { loading: boolean; error: boolean | string; shown: number; searching: boolean }): EmptyKind | null {
  if (loading || error || shown > 0) return null;
  return searching ? 'no-results' : 'empty';
}

/** Parámetros de la dirección de Pedidos que actúan como filtros; son los mismos que borra el botón "Limpiar filtros". */
export const ORDER_FILTER_KEYS = ['estado', 'fecha_desde', 'fecha_hasta', 'periodo', 'q', 'metodo_pago', 'pago', 'entrega'] as const;

export function hasOrderFilters(params: URLSearchParams): boolean {
  return ORDER_FILTER_KEYS.some(key => {
    const value = params.get(key);
    return !!value && !(key === 'estado' && value === 'all');
  });
}
