/** Shared presentation; stock limits and cart updates remain owned by the product page. */
export function QuantityControl({ value, onDecrease, onIncrease, increaseDisabled }: {
  value: number; onDecrease: () => void; onIncrease: () => void; increaseDisabled: boolean;
}) {
  return <div data-page-quantity className="product-quantity" role="group" aria-label="Cantidad">
    <button type="button" aria-label="Disminuir cantidad" disabled={value <= 1} onClick={onDecrease}>−</button>
    <span aria-live="polite" aria-atomic="true">{value}</span>
    <button type="button" aria-label="Aumentar cantidad" disabled={increaseDisabled} onClick={onIncrease}>+</button>
  </div>;
}
