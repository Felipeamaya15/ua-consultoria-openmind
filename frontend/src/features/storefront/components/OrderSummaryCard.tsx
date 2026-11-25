import { formatPrice } from '../data/mockData';

export interface OrderSummaryItem {
  id: string | number;
  name: string;
  quantity: number;
  price: number;
  variantAttributes?: Record<string, string>;
  image?: string;
}

export interface OrderSummaryData {
  items: OrderSummaryItem[];
  subtotal: number;
  shippingCost?: number;
  discount?: number;
  total: number;
}

interface Props {
  summary: OrderSummaryData;
  className?: string;
  title?: string;
}

export default function OrderSummaryCard({
  summary,
  className = '',
  title = 'Resumen de compra',
}: Props) {
  if (!summary || !summary.items || summary.items.length === 0) {
    return null;
  }

  const { items, subtotal, shippingCost = 0, discount = 0, total } = summary;

  return (
    <div
      data-page-panel
      data-testid="order-summary-card"
      className={`rounded-2xl border border-[var(--border,rgba(0,0,0,0.08))] bg-[var(--visual-page-panel-background,rgba(255,255,255,0.7))] p-6 text-left shadow-sm backdrop-blur-sm ${className}`}
    >
      <div className="flex items-center justify-between border-b border-[var(--border,rgba(0,0,0,0.08))] pb-3 mb-4">
        <h3 className="text-base font-semibold text-[var(--foreground,currentColor)]">
          {title}
        </h3>
        <span className="text-xs text-[var(--muted-foreground,rgba(100,100,100,0.8))]">
          {items.reduce((acc, it) => acc + (it.quantity || 1), 0)} {items.reduce((acc, it) => acc + (it.quantity || 1), 0) === 1 ? 'producto' : 'productos'}
        </span>
      </div>

      <div className="divide-y divide-[var(--border,rgba(0,0,0,0.06))] space-y-3">
        {items.map((item, index) => {
          const variantText = item.variantAttributes
            ? Object.entries(item.variantAttributes)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ')
            : '';

          return (
            <div key={`${item.id}-${index}`} className="pt-3 first:pt-0 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-[var(--border,rgba(0,0,0,0.08))]"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-[var(--muted,rgba(0,0,0,0.05))] flex items-center justify-center flex-shrink-0 text-xs font-bold text-[var(--muted-foreground,rgba(100,100,100,0.7))]">
                    {item.quantity}x
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground,currentColor)] truncate">
                    {item.name}
                  </p>
                  {variantText && (
                    <p className="text-xs text-[var(--muted-foreground,rgba(100,100,100,0.8))] truncate mt-0.5">
                      {variantText}
                    </p>
                  )}
                  <p className="text-xs text-[var(--muted-foreground,rgba(100,100,100,0.8))] mt-0.5">
                    Cant: {item.quantity} × {formatPrice(item.price)}
                  </p>
                </div>
              </div>
              <div className="text-sm font-semibold text-[var(--foreground,currentColor)] text-right flex-shrink-0">
                {formatPrice(item.price * item.quantity)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-[var(--border,rgba(0,0,0,0.08))] mt-5 pt-4 space-y-2 text-xs text-[var(--muted-foreground,rgba(100,100,100,0.8))]">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="font-medium text-[var(--foreground,currentColor)]">{formatPrice(subtotal)}</span>
        </div>
        {shippingCost > 0 && (
          <div className="flex justify-between">
            <span>Envío</span>
            <span className="font-medium text-[var(--foreground,currentColor)]">{formatPrice(shippingCost)}</span>
          </div>
        )}
        {discount > 0 && (
          <div className="flex justify-between text-[var(--success,#10b981)]">
            <span>Descuento</span>
            <span className="font-medium">-{formatPrice(discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold text-[var(--foreground,currentColor)] pt-2 border-t border-[var(--border,rgba(0,0,0,0.08))]">
          <span>Total</span>
          <span className="text-base text-[var(--primary,#000)]">{formatPrice(total)}</span>
        </div>
      </div>
    </div>
  );
}
