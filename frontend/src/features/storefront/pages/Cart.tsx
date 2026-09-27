import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

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
    shipping,
    total,
    applyPromo,
    count,
  } = useCart();

  const { route, isMinimal, isVisual, isCatalog } = useStorefrontTemplate();
  const navigate = useNavigate();

  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');
  const [promoSuccess, setPromoSuccess] = useState('');

  const handleApplyPromo = () => {
    const ok = applyPromo(promoInput);

    if (ok) {
      setPromoSuccess('¡Código aplicado correctamente!');
      setPromoError('');
    } else {
      setPromoError('Código inválido o expirado.');
      setPromoSuccess('');
    }
  };

  // ==========================================================
  // CARRITO VACÍO — PLANTILLA 4 / CATALOG
  // ==========================================================
  if (isCatalog && items.length === 0) {
    return (
      <div className="bg-[#050505] text-white">
        <div className="max-w-[1160px] mx-auto px-5 py-20 md:py-28 text-center">
          <p className="text-[#ff5a1f] text-[10px] font-black uppercase tracking-[0.16em]">
            Tu selección
          </p>

          <div className="w-20 h-20 mx-auto mt-7 rounded-full bg-[#171719] border border-white/10 flex items-center justify-center">
            <Icon name="cart" className="w-7 h-7 text-white/70" />
          </div>

          <h1 className="mt-7 text-[42px] sm:text-[54px] leading-[0.96] tracking-[-0.045em] font-black">
            Tu carrito está vacío.
          </h1>

          <p className="max-w-md mx-auto mt-5 text-[13px] leading-6 text-white/45">
            Explora el catálogo y agrega los productos que quieras llevar.
          </p>

          <Link
            to={route('catalogo')}
            className="inline-flex h-12 items-center justify-center rounded-full bg-[#1683ff] px-7 mt-8 text-[12px] font-bold text-white hover:bg-[#3194f5] transition-colors"
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
      <div className="bg-white text-[#111111]">
        <div className="max-w-[1180px] mx-auto px-5 md:px-8 py-16 md:py-24">
          <div className="max-w-xl mx-auto text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#f1f1f0] flex items-center justify-center">
              <Icon name="cart" className="w-6 h-6" />
            </div>

            <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.18em] text-[#77716e]">
              Tu selección
            </p>

            <h1 className="font-serif text-[42px] md:text-[52px] leading-none tracking-[-0.025em]">
              Tu carrito está vacío
            </h1>

            <p className="mt-5 text-[14px] leading-6 text-[#77716e]">
              Agrega productos de nuestra colección para comenzar tu compra.
            </p>

            <Link
              to={route('catalogo')}
              className="inline-flex h-12 items-center justify-center rounded-[8px] bg-black px-7 mt-8 text-[12px] font-semibold text-white transition-opacity hover:opacity-80"
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
      <div className="bg-[#050505] text-white">
        <div className="max-w-[1160px] mx-auto px-5 py-10 md:py-14 pb-20 md:pb-28">
          <div className="mb-9 md:mb-12">
            <p className="text-[#ff5a1f] text-[10px] font-black uppercase tracking-[0.16em]">
              Tu selección
            </p>

            <h1 className="mt-3 text-[44px] sm:text-[56px] md:text-[64px] leading-[0.94] tracking-[-0.05em] font-black">
              Carrito.
            </h1>

            <p className="mt-4 text-[13px] text-white/45">
              {count} {count === 1 ? 'producto en tu carrito' : 'productos en tu carrito'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8 items-start">
            <div className="space-y-3">
              {items.map((item) => {
                const hasDiscount = Boolean(item.comparePrice);
                const stockLow = item.maxStock <= 3;
                const canIncrease = item.quantity < item.maxStock;

                return (
                  <article
                    key={`${item.productId}-${item.variantId}`}
                    className="rounded-[16px] bg-[#f5f5f3] p-4 sm:p-5 text-[#151515]"
                  >
                    <div className="flex gap-4 sm:gap-5">
                      <Link
                        to={route(`producto/${item.productId}`)}
                        className="h-28 w-24 sm:h-32 sm:w-28 flex-shrink-0 overflow-hidden rounded-[11px] bg-[#e8e8e6]"
                      >
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </Link>

                      <div className="min-w-0 flex-1 flex flex-col">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#e04b1a]">
                              Producto
                            </p>

                            <Link
                              to={route(`producto/${item.productId}`)}
                              className="mt-2 block text-[17px] sm:text-[19px] font-extrabold leading-tight tracking-[-0.02em] hover:opacity-60 transition-opacity"
                            >
                              {item.name}
                            </Link>

                            <p className="mt-2 text-[10px] leading-5 text-black/45">
                              {Object.entries(item.attributes)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(' · ')}
                              {Object.keys(item.attributes).length > 0 ? ' · ' : ''}
                              SKU: {item.sku}
                            </p>

                            {stockLow && (
                              <p className="mt-2 text-[10px] font-semibold text-[#e04b1a]">
                                Solo {item.maxStock} disponibles
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => removeItem(item.productId, item.variantId)}
                            className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-black/35 hover:bg-black/[0.06] hover:text-black transition-colors"
                            aria-label={`Eliminar ${item.name}`}
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        </div>

                        <div className="mt-auto pt-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                          <div className="flex h-9 w-[112px] items-center overflow-hidden rounded-[8px] border border-black/10 bg-white">
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.variantId,
                                  item.quantity - 1,
                                )
                              }
                              className="h-full w-9 text-sm hover:bg-black/[0.04] transition-colors"
                              aria-label={`Disminuir cantidad de ${item.name}`}
                            >
                              −
                            </button>

                            <span className="h-full flex-1 flex items-center justify-center border-x border-black/10 text-[11px] font-black">
                              {item.quantity}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.variantId,
                                  item.quantity + 1,
                                )
                              }
                              disabled={!canIncrease}
                              className="h-full w-9 text-sm hover:bg-black/[0.04] transition-colors disabled:opacity-25"
                              aria-label={`Aumentar cantidad de ${item.name}`}
                            >
                              +
                            </button>
                          </div>

                          <div className="text-left sm:text-right">
                            <p className="text-[15px] font-black">
                              {formatPrice(item.price * item.quantity)}
                            </p>

                            {hasDiscount && item.comparePrice && (
                              <p className="mt-1 text-[10px] text-black/35 line-through">
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

              <Link
                to={route('catalogo')}
                className="inline-flex items-center gap-2 pt-4 text-[11px] font-semibold text-[#1683ff] hover:opacity-70 transition-opacity"
              >
                ← Seguir comprando
              </Link>
            </div>

            <aside className="lg:sticky lg:top-28">
              <div className="rounded-[16px] bg-[#f5f5f3] p-5 sm:p-6 text-[#151515]">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/45">
                  Resumen
                </p>

                <h2 className="mt-2 text-[26px] font-black tracking-[-0.03em]">
                  Tu pedido
                </h2>

                <div className="mt-6 space-y-3 border-b border-black/10 pb-5 text-[12px]">
                  <div className="flex justify-between gap-4">
                    <span className="text-black/50">Subtotal</span>
                    <span className="font-semibold">{formatPrice(subtotal)}</span>
                  </div>

                  {discount > 0 && (
                    <div className="flex justify-between gap-4 text-[#e04b1a]">
                      <span>Descuento</span>
                      <span className="font-semibold">−{formatPrice(discount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between gap-4">
                    <span className="text-black/50">Envío</span>
                    <span className="font-semibold">
                      {shipping === 0 ? 'Gratis' : formatPrice(shipping)}
                    </span>
                  </div>

                  {shipping > 0 && (
                    <p className="text-[10px] text-black/35">
                      Envío gratis sobre $50.000
                    </p>
                  )}
                </div>

                <div className="border-b border-black/10 py-5">
                  <label
                    htmlFor="catalog-promo"
                    className="mb-2 block text-[9px] font-black uppercase tracking-[0.14em] text-black/45"
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
                      className="h-10 min-w-0 flex-1 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] text-black outline-none focus:border-[#1683ff]"
                    />

                    <button
                      type="button"
                      onClick={handleApplyPromo}
                      className="h-10 rounded-[8px] bg-[#202022] px-4 text-[10px] font-bold text-white hover:bg-black transition-colors"
                    >
                      Aplicar
                    </button>
                  </div>

                  {promoError && (
                    <p className="mt-2 text-[10px] text-[#a33b3b]">{promoError}</p>
                  )}

                  {promoSuccess && (
                    <p className="mt-2 text-[10px] text-[#39734a]">{promoSuccess}</p>
                  )}
                </div>

                <div className="flex items-end justify-between gap-4 pt-5">
                  <div>
                    <p className="text-[10px] text-black/45">Total</p>
                    <p className="mt-1 text-[9px] text-black/30">Impuestos incluidos</p>
                  </div>

                  <p className="text-[24px] font-black tracking-[-0.03em]">
                    {formatPrice(total)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(route('compra'))}
                  className="mt-6 w-full h-12 rounded-[9px] bg-[#1683ff] text-white text-[12px] font-bold hover:bg-[#3194f5] transition-colors"
                >
                  Continuar compra →
                </button>

                <div className="mt-5 border-t border-black/10 pt-5">
                  <div className="flex items-start gap-3 text-[10px] leading-5 text-black/45">
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
      <div className="bg-white text-[#111111]">
        <div className="max-w-[1180px] mx-auto px-5 md:px-8 py-10 md:py-14">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-9">
            <div>
              <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.18em] text-[#77716e]">
                Tu selección
              </p>

              <h1 className="font-serif text-[42px] md:text-[52px] leading-none tracking-[-0.025em]">
                Tu carrito
              </h1>

              <p className="mt-3 text-[13px] text-[#77716e]">
                {count} {count === 1 ? 'producto en tu carrito' : 'productos en tu carrito'}
              </p>
            </div>

            <Link
              to={route('catalogo')}
              className="self-start sm:self-auto text-[10px] font-semibold uppercase tracking-[0.12em] border-b border-black pb-1"
            >
              ← Seguir comprando
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 lg:gap-12 items-start">
            <div className="flex flex-col gap-4">
              {items.map((item) => {
                const hasDiscount = Boolean(item.comparePrice);
                const stockLow = item.maxStock <= 3;

                return (
                  <article
                    key={`${item.productId}-${item.variantId}`}
                    className="flex gap-4 md:gap-5 rounded-[10px] bg-[#f1f1f0] p-4 md:p-5"
                  >
                    <Link
                      to={route(`producto/${item.productId}`)}
                      className="w-24 h-28 sm:w-28 sm:h-32 flex-shrink-0 overflow-hidden rounded-[8px] bg-[#e7e7e4]"
                    >
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </Link>

                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="mb-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#77716e]">
                            Producto
                          </p>

                          <Link
                            to={route(`producto/${item.productId}`)}
                            className="font-serif text-[20px] md:text-[22px] leading-tight hover:opacity-60 transition-opacity"
                          >
                            {item.name}
                          </Link>

                          <p className="mt-2 text-[11px] leading-5 text-[#77716e]">
                            {Object.entries(item.attributes)
                              .map(([key, value]) => `${key}: ${value}`)
                              .join(' · ')}
                            {Object.keys(item.attributes).length > 0 ? ' · ' : ''}
                            SKU: {item.sku}
                          </p>

                          {stockLow && (
                            <p className="mt-2 text-[10px] text-[#756b51]">
                              Solo {item.maxStock} disponibles
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(item.productId, item.variantId)}
                          className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-[#77716e] hover:bg-white hover:text-black transition-colors"
                          aria-label={`Eliminar ${item.name}`}
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      </div>

                      <div className="mt-auto pt-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                        <div className="flex h-9 w-[112px] items-center overflow-hidden rounded-[7px] border border-black/15 bg-white">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.productId,
                                item.variantId,
                                item.quantity - 1,
                              )
                            }
                            className="h-full w-9 text-sm hover:bg-[#e8e8e5] transition-colors"
                            aria-label={`Disminuir cantidad de ${item.name}`}
                          >
                            −
                          </button>

                          <span className="h-full flex-1 flex items-center justify-center border-x border-black/10 text-[12px] font-semibold">
                            {item.quantity}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.productId,
                                item.variantId,
                                item.quantity + 1,
                              )
                            }
                            disabled={item.quantity >= item.maxStock}
                            className="h-full w-9 text-sm hover:bg-[#e8e8e5] transition-colors disabled:opacity-30"
                            aria-label={`Aumentar cantidad de ${item.name}`}
                          >
                            +
                          </button>
                        </div>

                        <div className="text-left sm:text-right">
                          <p className="text-[14px] font-semibold">
                            {formatPrice(item.price * item.quantity)}
                          </p>

                          {hasDiscount && item.comparePrice && (
                            <p className="mt-1 text-[10px] text-[#999390] line-through">
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

            <aside className="lg:sticky lg:top-24">
              <div className="rounded-[10px] bg-[#f1f1f0] p-5 md:p-6">
                <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.18em] text-[#77716e]">
                  Resumen
                </p>

                <h2 className="font-serif text-[28px] leading-none mb-7">
                  Tu pedido
                </h2>

                <div className="flex flex-col gap-3 text-[13px]">
                  <div className="flex justify-between gap-4">
                    <span className="text-[#77716e]">Subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>

                  {discount > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-[#77716e]">Descuento</span>
                      <span>−{formatPrice(discount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between gap-4">
                    <span className="text-[#77716e]">Envío</span>
                    <span>{shipping === 0 ? 'Gratis' : formatPrice(shipping)}</span>
                  </div>

                  {shipping > 0 && (
                    <p className="text-[10px] leading-4 text-[#918b88]">
                      Envío gratis sobre $50.000
                    </p>
                  )}
                </div>

                <div className="border-t border-black/10 my-6" />

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
                      className="h-10 min-w-0 flex-1 rounded-[7px] border border-black/15 bg-white px-3 text-[12px] outline-none focus:border-black"
                    />

                    <button
                      type="button"
                      onClick={handleApplyPromo}
                      className="h-10 rounded-[7px] border border-black px-4 text-[10px] font-semibold transition-colors hover:bg-black hover:text-white"
                    >
                      Aplicar
                    </button>
                  </div>

                  {promoError && (
                    <p className="mt-2 text-[10px] text-[#8c4f4f]">{promoError}</p>
                  )}

                  {promoSuccess && (
                    <p className="mt-2 text-[10px] text-[#52705b]">{promoSuccess}</p>
                  )}
                </div>

                <div className="border-t border-black/10 my-6" />

                <div className="flex items-baseline justify-between gap-4 mb-6">
                  <span className="font-serif text-[24px]">Total</span>
                  <span className="text-[20px] font-semibold">{formatPrice(total)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(route('compra'))}
                  className="w-full h-12 rounded-[8px] bg-black text-white text-[12px] font-semibold transition-opacity hover:opacity-80"
                >
                  Continuar al pago →
                </button>

                <div className="mt-5 border-t border-black/10 pt-5">
                  <div className="flex items-start gap-3 text-[11px] leading-5 text-[#77716e]">
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
            <article
              key={`${item.productId}-${item.variantId}`}
              className="flex gap-4 rounded-xl border border-[var(--border)] bg-white p-4"
            >
              <Link
                to={route(`producto/${item.productId}`)}
                className="w-20 h-20 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--muted)]"
              >
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              </Link>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-4">
                  <div>
                    <Link
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
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(item.productId, item.variantId)}
                    className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    aria-label={`Eliminar ${item.name}`}
                  >
                    ×
                  </button>
                </div>

                <div className="flex items-end justify-between gap-4 mt-4">
                  <div className="flex items-center border border-[var(--border)] rounded-lg overflow-hidden">
                    <button
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
                    <button
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
                    <p className="font-semibold">
                      {formatPrice(item.price * item.quantity)}
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

        <aside>
          <div className="rounded-xl border border-[var(--border)] bg-white p-5">
            <h2 className="font-semibold text-lg mb-5">Resumen del pedido</h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>

              {discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--muted-foreground)]">Descuento</span>
                  <span>−{formatPrice(discount)}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-[var(--muted-foreground)]">Envío</span>
                <span>{shipping === 0 ? 'Gratis' : formatPrice(shipping)}</span>
              </div>

              {shipping > 0 && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Envío gratis sobre $50.000
                </p>
              )}
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
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>

            <button
              type="button"
              onClick={() => navigate(route('compra'))}
              className={
                isMinimal
                  ? 'w-full h-12 rounded-full bg-[#17213b] text-white text-sm font-semibold hover:bg-[#0f2a56] transition-colors'
                  : 'w-full h-12 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold'
              }
            >
              Proceder al pago →
            </button>

            {!isMinimal && (
              <Link
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
