/** El agregado llega como decimal string: preservar centavos y no convertir importes a float. */
export function formatReportMoney(value: string | number, currency: 'CLP' | 'USD' = 'CLP'): string {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return '—';
  const [whole, cents] = raw.split('.');
  const decimal = currency === 'USD' ? (cents || '00').padEnd(2, '0') : cents && !/^0+$/.test(cents) ? cents : '';
  return `${currency === 'USD' ? 'US$' : '$'}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${decimal ? `,${decimal}` : ''} ${currency}`;
}
