import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { StockFeedback } from '../components/store/StockFeedback';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../data/mockData';
import { Button, EmptyState, Icon } from '../components/ui';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

export default function Cart() {
  const {
    items,
    removeItem,
    updateQuantity,
    subtotal,
    discount,
    promoCode,
    shipping,
    total,
    applyPromo,
    promoNotice,
    count,
    loading,
  } = useCart();
  const shippingLabel = shipping === null ? 'Se calcula en checkout' : shipping === 0 ? 'Gratis' : formatPrice(shipping);

  const { route, isMinimal, isVisual, isCatalog } = useStorefrontTemplate();
  const navigate = useNavigate();

  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');
  const [promoSuccess, setPromoSuccess] = useState('');

  const [promoBusy, setPromoBusy] = useState(false);

  const handleApplyPromo = async () => {
    if (promoBusy) return;
    setPromoBusy(true);
    const result = await applyPromo(promoInput);
    setPromoBusy(false);

    if (result.ok) {
      setPromoSuccess(result.message);
      setPromoError('');
    } else {
      setPromoError(result.message);
      setPromoSuccess('');
    }
  };
  useEffect(() => {
    if (!promoNotice) return;
    setPromoError(promoNotice);
    setPromoSuccess('');
  }, [promoNotice]);

  if (loading && items.length === 0) return <p role="status" className="p-8 text-center">Cargando carrito…</p>;

  // ==========================================================
  // CARRITO VACÍO — PLANTILLA 4 / CATALOG
  // ==========================================================
  if (isCatalog && items.length === 0) {
    return (
      <div className="bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]">
        <div className="max-w-[1160px] mx-auto px-5 py-20 md:py-28 text-center">
          <p className="text-[var(--primary)] text-[10px] font-black uppercase tracking-[0.16em]">
            Tu selección
          </p>

          <div className="w-20 h-20 mx-auto mt-7 rounded-full bg-[var(--visual-page-panel-background)] border border-[var(--visual-global-border)]/10 flex items-center justify-center">
            <Icon name="cart" className="w-7 h-7 text-white/70" />
          </div>

          <h1 className="mt-7 text-[42px] sm:text-[54px] leading-[0.96] tracking-[-0.045em] font-black">
            Tu carrito está vacío.
          </h1>

          <p className="max-w-md mx-auto mt-5 text-[13px] leading-6 text-[var(--visual-page-color)]/45">
            Explora el catálogo y agrega los productos que quieras llevar.
          </p>

          <Link data-page-action="primary"
            to={route('catalogo')}
            className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--primary)] px-7 mt-8 text-[12px] font-bold text-[var(--visual-page-color)] hover:bg-[var(--primary)] transition-colors"
          >
            Explorar catálogo
          </Link>
        </div>
      </div>
    );
  }

  // ==========================================================
  // CARRITO VACÍO — PLANTILLA 3 / VELTA
  // ==========================================================
  if (isVisual && items.length === 0) {
    return (
      <div className="bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]">
        <div className="max-w-[1180px] mx-auto px-5 md:px-8 py-16 md:py-24">
          <div className="max-w-xl mx-auto text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--visual-page-panel-background)] flex items-center justify-center">
              <Icon name="cart" className="w-6 h-6" />
            </div>

            <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--visual-page-color)]">
              Tu selección
            </p>

            <h1 className="font-serif text-[42px] md:text-[52px] leading-none tracking-[-0.025em]">
              Tu carrito está vacío
            </h1>

            <p className="mt-5 text-[14px] leading-6 text-[var(--visual-page-color)]">
              Agrega productos de nuestra colección para comenzar tu compra.
            </p>

            <Link data-page-action="primary"
              to={route('catalogo')}
              className="inline-flex h-12 items-center justify-center rounded-[8px] bg-[var(--visual-page-panel-background)] px-7 mt-8 text-[12px] font-semibold text-[var(--visual-page-color)] transition-opacity hover:opacity-80"
            >
              Ver colección
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================
  // CARRITO VACÍO — PLANTILLAS 1 Y 2
  // ==========================================================
  if (items.length === 0) {
    return (
      <div
        className={
          isMinimal
            ? 'max-w-6xl mx-auto px-4 md:px-8 py-20'
            : 'max-w-7xl mx-auto px-4 py-16'
        }
      >
        <EmptyState
          icon={<Icon name="cart" className="w-12 h-12" />}
          title="Tu carrito está vacío"
          description="Agrega productos para comenzar tu compra."
          action={
            <Link to={route('catalogo')}>
              <Button variant="primary">Ir al catálogo</Button>
            </Link>
          }
        />
      </div>
    );
  }

  // ==========================================================
  // CARRITO CON PRODUCTOS — PLANTILLA 4 / CATALOG
  // ==========================================================
  if (isCatalog) {
    return (
      <div className="bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]">
        <div className="max-w-[1160px] mx-auto px-5 py-10 md:py-14 pb-20 md:pb-28">
          <div className="mb-9 md:mb-12">
            <p className="text-[var(--primary)] text-[10px] font-black uppercase tracking-[0.16em]">
              Tu selección
            </p>

            <h1 className="mt-3 text-[44px] sm:text-[56px] md:text-[64px] leading-[0.94] tracking-[-0.05em] font-black">
              Carrito.
            </h1>

            <p className="mt-4 text-[13px] text-[var(--visual-page-color)]/45">
              {count} {count === 1 ? 'producto en tu carrito' : 'productos en tu carrito'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8 items-start">
            <div className="space-y-3">
              {items.map((item) => {
                const hasDiscount = Boolean(item.comparePrice);
                const canIncrease = item.quantity < item.maxStock;

                return (
                  <article data-page-panel
                    key={`${item.productId}-${item.variantId}`}
                    className="rounded-[16px] bg-[var(--visual-page-panel-background)] p-4 sm:p-5 text-[var(--visual-page-color)]"
                  >
                    <div className="flex gap-4 sm:gap-5">
                      <Link data-page-action="outline"
                        to={route(`producto/${item.productId}`)}
                        className="h-28 w-24 sm:h-32 sm:w-28 flex-shrink-0 overflow-hidden rounded-[11px] bg-[var(--visual-page-panel-background)]"
                      >
                        <img data-page-item-image
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </Link>

                      <div className="min-w-0 flex-1 flex flex-col">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--primary)]">
                              Producto
                            </p>

                            <Link data-page-action="ghost"
                              to={route(`producto/${item.productId}`)}
                              className="mt-2 block text-[17px] sm:text-[19px] font-extrabold leading-tight tracking-[-0.02em] hover:opacity-60 transition-opacity"
                            >
                              {item.name}
                            </Link>

                            <p className="mt-2 text-[10px] leading-5 text-[var(--visual-page-color)]/45">
                              {Object.entries(item.attributes)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(' · ')}
                              {Object.keys(item.attributes).length > 0 ? ' · ' : ''}
                              SKU: {item.sku}
                            </p>

                            <StockFeedback sku={item.sku} maxStock={item.maxStock} quantity={item.quantity} className="mt-2 text-[10px] font-semibold text-[#e04b1a]" />
                          </div>

                          <button data-page-action="danger"
                            type="button"
                            onClick={() => removeItem(item.productId, item.variantId)}
                            className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-[var(--visual-page-color)]/35 hover:bg-[var(--visual-page-panel-background)]/[0.06] hover:text-[var(--visual-page-color)] transition-colors"
                            aria-label={`Eliminar ${item.name}`}
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        </div>

                        <div className="mt-auto pt-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                          <div data-page-quantity className="flex h-9 w-[112px] items-center overflow-hidden rounded-[8px] border border-[var(--visual-global-border)]/10 bg-[var(--visual-page-panel-background)]">
                            <button data-page-action="ghost"
                              type="button"
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.variantId,
                                  item.quantity - 1,
                                )
                              }
                              className="h-full w-9 text-sm hover:bg-[var(--visual-page-panel-background)]/[0.04] transition-colors"
                              aria-label={`Disminuir cantidad de ${item.name}`}
                            >
                              −
                            </button>

                            <span className="h-full flex-1 flex items-center justify-center border-x border-[var(--visual-global-border)]/10 text-[11px] font-black">
                              {item.quantity}
                            </span>

                            <button data-page-action="ghost"
                              type="button"
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.variantId,
                                  item.quantity + 1,
                                )
                              }
                              disabled={!canIncrease}
                              className="h-full w-9 text-sm hover:bg-[var(--visual-page-panel-background)]/[0.04] transition-colors disabled:opacity-25"
                              aria-label={`Aumentar cantidad de ${item.name}`}
                            >
                              +
                            </button>
                          </div>

                          <div className="text-left sm:text-right">
                            <p data-page-price className="text-[15px] font-black">
                              {formatPrice(item.price * item.quantity)}<span className="block text-xs font-normal">{formatPrice(item.price)} por unidad</span>
                            </p>

                            {hasDiscount && item.comparePrice && (
                              <p className="mt-1 text-[10px] text-[var(--visual-page-color)]/35 line-through">
                                {formatPrice(item.comparePrice * item.quantity)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}

              <Link data-page-action="ghost"
                to={route('catalogo')}
                className="inline-flex items-center gap-2 pt-4 text-[11px] font-semibold text-[var(--primary)] hover:opacity-70 transition-opacity"
              >
                ← Seguir comprando
              </Link>
            </div>

            <aside data-visual-section="pagePanel" className="lg:sticky lg:top-28">
              <div data-page-panel className="rounded-[16px] bg-[var(--visual-page-panel-background)] p-5 sm:p-6 text-[var(--visual-page-color)]">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--visual-page-color)]/45">
                  Resumen
                </p>

                <h2 className="mt-2 text-[26px] font-black tracking-[-0.03em]">
                  Tu pedido
                </h2>

                <div className="mt-6 space-y-3 border-b border-[var(--visual-global-border)]/10 pb-5 text-[12px]">
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--visual-page-color)]/50">Subtotal</span>
                    <span data-page-price className="font-semibold">{formatPrice(subtotal)}</span>
                  </div>

                  {discount > 0 && (
                    <div className="flex justify-between gap-4 text-[var(--primary)]">
                      <span>Descuento{promoCode ? ` (${promoCode})` : ''}</span>
                      <span className="font-semibold">−{formatPrice(discount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--visual-page-color)]/50">Envío</span>
                    <span className="font-semibold">
                      {shippingLabel}
                    </span>
                  </div>
                </div>

                <div className="border-b border-[var(--visual-global-border)]/10 py-5">
                  <label
                    htmlFor="catalog-promo"
                    className="mb-2 block text-[9px] font-black uppercase tracking-[0.14em] text-[var(--visual-page-color)]/45"
                  >
                    Código promocional
                  </label>

                  <div className="flex gap-2">
                    <input
                      id="catalog-promo"
                      value={promoInput}
                      onChange={(event) => setPromoInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          handleApplyPromo();
                        }
                      }}
                      placeholder="Ej: VERANO20"
                      className="h-10 min-w-0 flex-1 rounded-[8px] border border-[var(--visual-global-border)]/10 bg-[var(--visual-page-panel-background)] px-3 text-[11px] text-[var(--visual-page-color)] outline-none focus:border-[var(--primary)]"
                    />

                    <button data-page-action="primary"
                      type="button"
                      onClick={handleApplyPromo}
                      className="h-10 rounded-[8px] bg-[var(--visual-page-panel-background)] px-4 text-[10px] font-bold text-[var(--visual-page-color)] hover:bg-[var(--visual-page-panel-background)] transition-colors"
                    >
                      Aplicar
                    </button>
                  </div>

                  {promoError && (
                    <p className="mt-2 text-[10px] text-[var(--visual-page-color)]">{promoError}</p>
                  )}

                  {promoSuccess && (
                    <p className="mt-2 text-[10px] text-[var(--visual-page-color)]">{promoSuccess}</p>
                  )}
                </div>

                <div className="flex items-end justify-between gap-4 pt-5">
                  <div>
                    <p className="text-[10px] text-[var(--visual-page-color)]/45">{shipping === null ? 'Total sin envío' : 'Total'}</p>
                    <p className="mt-1 text-[9px] text-[var(--visual-page-color)]/30">Impuestos incluidos</p>
                  </div>

                  <p data-page-price className="text-[24px] font-black tracking-[-0.03em]">
                    {formatPrice(total)}
                  </p>
                </div>

                <button data-page-action="primary"
                  type="button"
                  onClick={() => navigate(route('compra'))}
                  className="mt-6 w-full h-12 rounded-[9px] bg-[var(--primary)] text-[var(--visual-page-color)] text-[12px] font-bold hover:bg-[var(--primary)] transition-colors"
                >
                  Continuar compra →
                </button>

                <div className="mt-5 border-t border-[var(--visual-global-border)]/10 pt-5">
                  <div className="flex items-start gap-3 text-[10px] leading-5 text-[var(--visual-page-color)]/45">
                    <Icon
                      name="box"
                      className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#1683ff]"
                    />
                    <p>Despacho a todo Chile y embalaje seguro para tu pedido.</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================
  // CARRITO CON PRODUCTOS — PLANTILLA 3 / VELTA
  // ==========================================================
  if (isVisual) {
    return (
      <div className="bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]">
        <div className="max-w-[1180px] mx-auto px-5 md:px-8 py-10 md:py-14">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-9">
            <div>
              <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--visual-page-color)]">
                Tu selección
              </p>

              <h1 className="font-serif text-[42px] md:text-[52px] leading-none tracking-[-0.025em]">
                Tu carrito
              </h1>

              <p className="mt-3 text-[13px] text-[var(--visual-page-color)]">
                {count} {count === 1 ? 'producto en tu carrito' : 'productos en tu carrito'}
              </p>
            </div>

            <Link data-page-action="outline"
              to={route('catalogo')}
              className="self-start sm:self-auto text-[10px] font-semibold uppercase tracking-[0.12em] border-b border-[var(--visual-global-border)] pb-1"
            >
              ← Seguir comprando
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 lg:gap-12 items-start">
            <div className="flex flex-col gap-4">
              {items.map((item) => {
                const hasDiscount = Boolean(item.comparePrice);

                return (
                  <article data-page-panel
                    key={`${item.productId}-${item.variantId}`}
                    className="flex gap-4 md:gap-5 rounded-[10px] bg-[var(--visual-page-panel-background)] p-4 md:p-5"
                  >
                    <Link data-page-action="outline"
                      to={route(`producto/${item.productId}`)}
                      className="w-24 h-28 sm:w-28 sm:h-32 flex-shrink-0 overflow-hidden rounded-[8px] bg-[var(--visual-page-panel-background)]"
                    >
                      <img data-page-item-image
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </Link>

                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="mb-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[var(--visual-page-color)]">
                            Producto
                          </p>

                          <Link data-page-action="ghost"
                            to={route(`producto/${item.productId}`)}
                            className="font-serif text-[20px] md:text-[22px] leading-tight hover:opacity-60 transition-opacity"
                          >
                            {item.name}
                          </Link>

                          <p className="mt-2 text-[11px] leading-5 text-[var(--visual-page-color)]">
                            {Object.entries(item.attributes)
                              .map(([key, value]) => `${key}: ${value}`)
                              .join(' · ')}
                            {Object.keys(item.attributes).length > 0 ? ' · ' : ''}
                            SKU: {item.sku}
                          </p>

                          <StockFeedback sku={item.sku} maxStock={item.maxStock} quantity={item.quantity} className="mt-2 text-[10px] text-[#756b51]" />
                        </div>

                        <button data-page-action="danger"
                          type="button"
                          onClick={() => removeItem(item.productId, item.variantId)}
                          className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-[var(--visual-page-color)] hover:bg-[var(--visual-page-panel-background)] hover:text-[var(--visual-page-color)] transition-colors"
                          aria-label={`Eliminar ${item.name}`}
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      </div>

                      <div className="mt-auto pt-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                        <div data-page-quantity className="flex h-9 w-[112px] items-center overflow-hidden rounded-[7px] border border-[var(--visual-global-border)]/15 bg-[var(--visual-page-panel-background)]">
                          <button data-page-action="ghost"
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.productId,
                                item.variantId,
                                item.quantity - 1,
                              )
                            }
                            className="h-full w-9 text-sm hover:bg-[var(--visual-page-panel-background)] transition-colors"
                            aria-label={`Disminuir cantidad de ${item.name}`}
                          >
                            −
                          </button>

                          <span className="h-full flex-1 flex items-center justify-center border-x border-[var(--visual-global-border)]/10 text-[12px] font-semibold">
                            {item.quantity}
                          </span>

                          <button data-page-action="ghost"
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.productId,
                                item.variantId,
                                item.quantity + 1,
                              )
                            }
                            disabled={item.quantity >= item.maxStock}
                            className="h-full w-9 text-sm hover:bg-[var(--visual-page-panel-background)] transition-colors disabled:opacity-30"
                            aria-label={`Aumentar cantidad de ${item.name}`}
                          >
                            +
                          </button>
                        </div>

                        <div className="text-left sm:text-right">
                          <p data-page-price className="text-[14px] font-semibold">
                            {formatPrice(item.price * item.quantity)}<span className="block text-xs font-normal">{formatPrice(item.price)} por unidad</span>
                          </p>

                          {hasDiscount && item.comparePrice && (
                            <p className="mt-1 text-[10px] text-[var(--visual-page-color)] line-through">
                              {formatPrice(item.comparePrice * item.quantity)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <aside data-visual-section="pagePanel" className="lg:sticky lg:top-24">
              <div data-page-panel className="rounded-[10px] bg-[var(--visual-page-panel-background)] p-5 md:p-6">
                <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--visual-page-color)]">
                  Resumen
                </p>

                <h2 className="font-serif text-[28px] leading-none mb-7">
                  Tu pedido
                </h2>

                <div className="flex flex-col gap-3 text-[13px]">
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--visual-page-color)]">Subtotal</span>
                    <span data-page-price>{formatPrice(subtotal)}</span>
                  </div>

                  {discount > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-[var(--visual-page-color)]">Descuento{promoCode ? ` (${promoCode})` : ''}</span>
                      <span>−{formatPrice(discount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--visual-page-color)]">Envío</span>
                    <span>{shippingLabel}</span>
                  </div>
                </div>

                <div className="border-t border-[var(--visual-global-border)]/10 my-6" />

                <div>
                  <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em]">
                    Código promocional
                  </p>

                  <div className="flex gap-2">
                    <input
                      value={promoInput}
                      onChange={(event) => setPromoInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          handleApplyPromo();
                        }
                      }}
                      aria-label="Código promocional"
                      placeholder="Ej: VERANO20"
                      className="h-10 min-w-0 flex-1 rounded-[7px] border border-[var(--visual-global-border)]/15 bg-[var(--visual-page-panel-background)] px-3 text-[12px] outline-none focus:border-[var(--visual-global-border)]"
                    />

                    <button data-page-action="primary"
                      type="button"
                      onClick={handleApplyPromo}
                      className="h-10 rounded-[7px] border border-[var(--visual-global-border)] px-4 text-[10px] font-semibold transition-colors hover:bg-[var(--visual-page-panel-background)] hover:text-[var(--visual-page-color)]"
                    >
                      Aplicar
                    </button>
                  </div>

                  {promoError && (
                    <p className="mt-2 text-[10px] text-[var(--visual-page-color)]">{promoError}</p>
                  )}

                  {promoSuccess && (
                    <p className="mt-2 text-[10px] text-[var(--visual-page-color)]">{promoSuccess}</p>
                  )}
                </div>

                <div className="border-t border-[var(--visual-global-border)]/10 my-6" />

                <div className="flex items-baseline justify-between gap-4 mb-6">
                  <span className="font-serif text-[24px]">{shipping === null ? 'Total sin envío' : 'Total'}</span>
                  <span data-page-price className="text-[20px] font-semibold">{formatPrice(total)}</span>
                </div>

                <button data-page-action="primary"
                  type="button"
                  onClick={() => navigate(route('compra'))}
                  className="w-full h-12 rounded-[8px] bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] text-[12px] font-semibold transition-opacity hover:opacity-80"
                >
                  Continuar al pago →
                </button>

                <div className="mt-5 border-t border-[var(--visual-global-border)]/10 pt-5">
                  <div className="flex items-start gap-3 text-[11px] leading-5 text-[var(--visual-page-color)]">
                    <Icon name="box" className="w-4 h-4 mt-0.5 flex-shrink-0 text-black" />
                    <p>Despacho a todo Chile y embalaje seguro para tu pedido.</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================
  // CARRITO CON PRODUCTOS — PLANTILLAS 1 Y 2
  // ==========================================================
  return (
    <div
      className={
        isMinimal
          ? 'max-w-6xl mx-auto px-4 md:px-8 py-12'
          : 'max-w-7xl mx-auto px-4 py-10'
      }
    >
      <h1
        className={
          isMinimal
            ? 'text-3xl font-semibold tracking-tight mb-8'
            : 'text-2xl font-semibold mb-6'
        }
      >
        Mi carrito
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        <div className="flex flex-col gap-4">
          {items.map((item) => (
            <article data-page-panel
              key={`${item.productId}-${item.variantId}`}
              className="flex gap-4 rounded-xl border border-[var(--border)] bg-[var(--visual-page-panel-background)] p-4"
            >
              <Link data-page-action="outline"
                to={route(`producto/${item.productId}`)}
                className="w-20 h-20 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--muted)]"
              >
                <img data-page-item-image
                  src={item.image}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              </Link>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-4">
                  <div>
                    <Link data-page-action="ghost"
                      to={route(`producto/${item.productId}`)}
                      className="font-semibold hover:underline"
                    >
                      {item.name}
                    </Link>

                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      {Object.entries(item.attributes)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(' · ')}
                      {Object.keys(item.attributes).length > 0 ? ' · ' : ''}
                      SKU: {item.sku}
                    </p>
                    <StockFeedback sku={item.sku} maxStock={item.maxStock} quantity={item.quantity} />
                  </div>

                  <button data-page-action="danger"
                    type="button"
                    onClick={() => removeItem(item.productId, item.variantId)}
                    className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    aria-label={`Eliminar ${item.name}`}
                  >
                    ×
                  </button>
                </div>

                <div className="flex items-end justify-between gap-4 mt-4">
                  <div data-page-quantity className="flex items-center border border-[var(--border)] rounded-lg overflow-hidden">
                    <button data-page-action="ghost"
                      type="button"
                      onClick={() =>
                        updateQuantity(item.productId, item.variantId, item.quantity - 1)
                      }
                      className="w-9 h-9"
                    >
                      −
                    </button>
                    <span className="w-9 h-9 flex items-center justify-center border-x border-[var(--border)]">
                      {item.quantity}
                    </span>
                    <button data-page-action="ghost"
                      type="button"
                      onClick={() =>
                        updateQuantity(item.productId, item.variantId, item.quantity + 1)
                      }
                      disabled={item.quantity >= item.maxStock}
                      className="w-9 h-9 disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>

                  <div className="text-right">
                    <p data-page-price className="font-semibold">
                      {formatPrice(item.price * item.quantity)}<span className="block text-xs font-normal">{formatPrice(item.price)} por unidad</span>
                    </p>
                    {item.comparePrice && (
                      <p className="text-xs line-through text-[var(--muted-foreground)]">
                        {formatPrice(item.comparePrice * item.quantity)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <aside data-visual-section="pagePanel">
          <div data-page-panel className="rounded-xl border border-[var(--border)] bg-[var(--visual-page-panel-background)] p-5">
            <h2 className="font-semibold text-lg mb-5">Resumen del pedido</h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Subtotal</span>
                <span data-page-price>{formatPrice(subtotal)}</span>
              </div>

              {discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--muted-foreground)]">Descuento{promoCode ? ` (${promoCode})` : ''}</span>
                  <span>−{formatPrice(discount)}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Envío</span>
                <span>{shippingLabel}</span>
              </div>
            </div>

            <div className="border-t border-[var(--border)] my-5" />

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
                Código promocional
              </p>

              <div className="flex gap-2">
                <input
                  value={promoInput}
                  onChange={(event) => setPromoInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleApplyPromo();
                    }
                  }}
                  placeholder="Ej: VERANO20"
                  className="h-10 flex-1 min-w-0 rounded-lg border border-[var(--border)] px-3 text-sm outline-none"
                />
                <Button variant="secondary" onClick={handleApplyPromo}>
                  Aplicar
                </Button>
              </div>

              {promoError && (
                <p className="text-xs text-[var(--error)] mt-2">{promoError}</p>
              )}
              {promoSuccess && (
                <p className="text-xs text-[var(--success)] mt-2">{promoSuccess}</p>
              )}
            </div>

            <div className="border-t border-[var(--border)] my-5" />

            <div className="flex justify-between items-baseline font-semibold text-xl mb-6">
              <span>{shipping === null ? 'Total sin envío' : 'Total'}</span>
              <span data-page-price>{formatPrice(total)}</span>
            </div>

            <button data-page-action="primary"
              type="button"
              onClick={() => navigate(route('compra'))}
              className={
                isMinimal
                  ? 'w-full h-12 rounded-full bg-[var(--primary)] text-[var(--visual-page-color)] text-sm font-semibold hover:bg-[var(--primary)] transition-colors'
                  : 'w-full h-12 rounded-lg bg-[var(--primary)] text-[var(--visual-page-color)] text-sm font-semibold'
              }
            >
              Proceder al pago →
            </button>

            {!isMinimal && (
              <Link data-page-action="ghost"
                to={route('catalogo')}
                className="block text-center text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mt-3"
              >
                ← Seguir comprando
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
