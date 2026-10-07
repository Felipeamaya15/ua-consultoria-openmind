interface StockFeedbackProps {
  sku: string;
  maxStock: number;
  quantity: number;
  className?: string;
}

export function StockFeedback({ sku, maxStock, quantity, className = 'mt-2 text-xs' }: StockFeedbackProps) {
  if (maxStock <= 0) return null;
  const message = quantity >= maxStock
    ? `Has alcanzado el stock disponible (${maxStock} ${maxStock === 1 ? 'unidad' : 'unidades'}).`
    : maxStock <= 5
      ? `Stock bajo: solo quedan ${maxStock} ${maxStock === 1 ? 'unidad' : 'unidades'} disponibles.`
      : null;
  if (!message) return null;
  return <p role="status" aria-live="polite" className={className}>
    {sku}: {message}
  </p>;
}
