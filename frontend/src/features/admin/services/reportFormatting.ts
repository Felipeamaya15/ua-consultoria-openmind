/** El agregado llega como decimal string: preservar centavos y no convertir importes a float. */
export function formatReportMoney(value: string): string {
  const [whole, cents] = value.split('.');
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${cents && cents !== '00' ? `,${cents}` : ''}`;
}
