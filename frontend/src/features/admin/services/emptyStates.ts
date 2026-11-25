
export type EmptyKind = 'empty' | 'no-results';

export function emptyKind({ loading, error, shown, searching }: { loading: boolean; error: boolean | string; shown: number; searching: boolean }): EmptyKind | null {
  if (loading || error || shown > 0) return null;
  return searching ? 'no-results' : 'empty';
}


export const ORDER_FILTER_KEYS = ['estado', 'fecha_desde', 'fecha_hasta', 'periodo', 'q', 'metodo_pago', 'pago', 'entrega'] as const;

export function hasOrderFilters(params: URLSearchParams): boolean {
  return ORDER_FILTER_KEYS.some(key => {
    const value = params.get(key);
    return !!value && !(key === 'estado' && value === 'all');
  });
}
