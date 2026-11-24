import { CartProductRow } from '../components/store/CartLineItem';
import { useFeedback } from '../../../shared/components/FeedbackProvider';
import { useEffect, useState } from 'react';
import { ErrorState, LoadingState } from '../../../shared/components/states';
import { Link, useNavigate } from 'react-router-dom';

import { ActivityCartRows } from '../components/store/ActivityCartPreview';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../data/mockData';
import { Button, EmptyState, Icon } from '../components/ui';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

export default function Cart() {
  const uiFeedback = useFeedback();

  const {
    items,
    activities,
    removeItem: deleteItem,
    updateQuantity: setQuantity,
    subtotal,
    discount,
    promoCode,
    shipping,
    total,
    applyPromo,
    promoNotice,
    count,
    loading,syncError,syncNotice,refreshCart,
  } = useCart();
  const hasItems = items.length > 0 || activities.length > 0;
  const shippingLabel = !items.length && activities.length ? 'No aplica' : shipping === null ? 'Se calcula en checkout' : shipping === 0 ? 'Gratis' : formatPrice(shipping);

  const { route, isMinimal, isVisual, isCatalog } = useStorefrontTemplate();
  const navigate = useNavigate();

  const removeItem = async (productId: string, variantId: string) => {
    const item = items.find(row => row.productId === productId && row.variantId === variantId);
    if (item && (await uiFeedback.confirm({title:"Eliminar producto",confirmLabel:"Eliminar producto",message:`¿Eliminar ${item.name} del carrito?`}))) {
      return deleteItem(productId, variantId);
    }
  };
  const updateQuantity = (productId: string, variantId: string, quantity: number) => {
    if (quantity <= 0) return removeItem(productId, variantId);
    return setQuantity(productId, variantId, quantity);
  };

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

  if(syncError)return <ErrorState onRetry={()=>void refreshCart()}>{syncError}</ErrorState>;
  if (loading && !hasItems) return <LoadingState spacing="none" className="p-8">Cargando carrito…</LoadingState>;


  if (isCatalog && !hasItems) {
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


  if (isVisual && !hasItems) {
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


  if (!hasItems) {
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


  if (isCatalog) {
    return (
      <div className="bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]">
        <div className="max-w-[1160px] mx-auto px-4 sm:px-5 py-10 md:py-14 pb-20 md:pb-28">
          {syncNotice&&<p role="status" className="mb-4 border rounded-lg p-3">{syncNotice}</p>}
          <div className="mb-9 md:mb-12">
            <p className="text-[var(--primary)] text-[10px] font-black uppercase tracking-[0.16em]">
              Tu selección
            </p>

            <h1 className="mt-3 text-[44px] sm:text-[56px] md:text-[64px] leading-[0.94] tracking-[-0.05em] font-black">
              Carrito.
            </h1>

            <p className="mt-4 text-[13px] text-[var(--visual-page-color)]/45">
              {count} {count === 1 ? 'artículo en tu carrito' : 'artículos en tu carrito'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8 items-start">
            <div className="space-y-3">
              <ActivityCartRows items={activities} />
              {items.map(item=><CartProductRow key={`${item.productId}-${item.variantId}`} item={item} route={route} onRemove={()=>removeItem(item.productId,item.variantId)} onQuantity={quantity=>updateQuantity(item.productId,item.variantId,quantity)}/>)}

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
                    <span data-page-price className="font-semibold whitespace-nowrap">{formatPrice(subtotal)}</span>
                  </div>

                  {discount > 0 && (
                    <div className="flex justify-between gap-4 text-[var(--primary)]">
                      <span>Descuento{promoCode ? ` (${promoCode})` : ''}</span>
                      <span className="font-semibold whitespace-nowrap">−{formatPrice(discount)}</span>
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

                  <p data-page-price className="text-[24px] font-black tracking-[-0.03em] whitespace-nowrap">
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
                      className="w-4 h-4 mt-0.5 flex-shrink-0 text-[var(--primary)]"
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


  if (isVisual) {
    return (
      <div className="bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-5 md:px-8 py-10 md:py-14">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-9">
            <div>
              <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--visual-page-color)]">
                Tu selección
              </p>

              <h1 className="font-serif text-[42px] md:text-[52px] leading-none tracking-[-0.025em]">
                Tu carrito
              </h1>

              <p className="mt-3 text-[13px] text-[var(--visual-page-color)]">
                {count} {count === 1 ? 'artículo en tu carrito' : 'artículos en tu carrito'}
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
              <ActivityCartRows items={activities} />
              {items.map(item=><CartProductRow key={`${item.productId}-${item.variantId}`} item={item} route={route} onRemove={()=>removeItem(item.productId,item.variantId)} onQuantity={quantity=>updateQuantity(item.productId,item.variantId,quantity)}/>)}
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
                    <span data-page-price className="whitespace-nowrap">{formatPrice(subtotal)}</span>
                  </div>

                  {discount > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-[var(--visual-page-color)]">Descuento{promoCode ? ` (${promoCode})` : ''}</span>
                      <span className="whitespace-nowrap">−{formatPrice(discount)}</span>
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
                  <span data-page-price className="text-[20px] font-semibold whitespace-nowrap">{formatPrice(total)}</span>
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


  return (
    <div
      className={
        isMinimal
          ? 'max-w-6xl mx-auto px-3 sm:px-4 md:px-8 py-8 sm:py-12'
          : 'max-w-7xl mx-auto px-3 sm:px-4 py-8 sm:py-10'
      }
    >
      {syncNotice&&<p role="status" className="mb-4 border rounded-lg p-3">{syncNotice}</p>}
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
          <ActivityCartRows items={activities} />
          {items.map(item=><CartProductRow key={`${item.productId}-${item.variantId}`} item={item} route={route} onRemove={()=>removeItem(item.productId,item.variantId)} onQuantity={quantity=>updateQuantity(item.productId,item.variantId,quantity)}/>)}
        </div>

        <aside data-visual-section="pagePanel">
          <div data-page-panel className="rounded-xl border border-[var(--border)] bg-[var(--visual-page-panel-background)] p-5">
            <h2 className="font-semibold text-lg mb-5">Resumen del pedido</h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-[var(--muted-foreground)]">Subtotal</span>
                <span data-page-price className="whitespace-nowrap">{formatPrice(subtotal)}</span>
              </div>

              {discount > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--muted-foreground)]">Descuento{promoCode ? ` (${promoCode})` : ''}</span>
                  <span className="whitespace-nowrap">−{formatPrice(discount)}</span>
                </div>
              )}

              <div className="flex justify-between gap-4">
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
                  aria-label="Código promocional"
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

            <div className="flex justify-between items-baseline gap-4 font-semibold text-xl mb-6">
              <span>{shipping === null ? 'Total sin envío' : 'Total'}</span>
              <span data-page-price className="whitespace-nowrap">{formatPrice(total)}</span>
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
