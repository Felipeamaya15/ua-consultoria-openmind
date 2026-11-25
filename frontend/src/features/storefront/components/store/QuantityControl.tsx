
export function QuantityControl({ value, onDecrease, onIncrease, increaseDisabled, allowRemoval=false, disabled=false, label='Cantidad', decreaseLabel='Disminuir cantidad', increaseLabel='Aumentar cantidad', className='' }: {
  value: number; onDecrease: () => void; onIncrease: () => void; increaseDisabled: boolean;
  allowRemoval?: boolean; disabled?:boolean; label?:string; decreaseLabel?:string; increaseLabel?:string; className?:string;
}) {
  return <div
    data-page-quantity
    className={`product-quantity ${className}`}
    role="group"
    aria-label={label}
    onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
        if (!disabled && (value > 1 || allowRemoval)) {
          event.preventDefault();
          onDecrease();
        }
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
        if (!disabled && !increaseDisabled) {
          event.preventDefault();
          onIncrease();
        }
      }
    }}
  >
    <button type="button" aria-label={decreaseLabel} disabled={disabled || (!allowRemoval && value <= 1)} onClick={onDecrease}>−</button>
    <span aria-live="polite" aria-atomic="true">{value}</span>
    <button type="button" aria-label={increaseLabel} disabled={disabled || increaseDisabled} onClick={onIncrease}>+</button>
  </div>;
}
