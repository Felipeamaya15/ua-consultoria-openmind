import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { formatPrice, type Product } from '../data/mockData';
import { Badge, Breadcrumb, Alert, Icon } from '../components/ui';
import { useCart } from '../context/CartContext';
import { StockFeedback } from '../components/store/StockFeedback';
import { ProductCard } from '../components/store/ProductCard';
import { ProductAttributes } from '../components/store/ProductAttributes';
import { QuantityControl } from '../components/store/QuantityControl';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';
import {
  fetchPublicProductDetail,
  fetchPublicProducts,
} from '../services/catalogService';

const previewAttributes = [{ clave: 'material', etiqueta: 'Material', valor: '100% algodón' }, { clave: 'medidas', etiqueta: 'Medidas', valor: '38 × 42 cm' }, { clave: 'cuidados', etiqueta: 'Cuidados', valor: 'Lavado a mano' }];

export default function ProductDetail({ previewProduct }: { previewProduct?: Product } = {}) {
  const { id } = useParams();
  const { addItem, items } = useCart();
  const { route, isMinimal, isVisual, isCatalog } = useStorefrontTemplate();

  const [product, setProduct] = useState<Product | null>(previewProduct ?? null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loading, setLoading] = useState(!previewProduct);
  const [notFound, setNotFound] = useState(false);

  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setSelectedAttrs({});
    setQty(1);
    setActiveImg(0);
    setAdded(false);
    setLoading(true);
    setNotFound(false);
    setProduct(null);

    // Editor sample uses the public presentation without fetching or writing real products/cart.
    if (previewProduct) {
      setProduct(previewProduct);
      setSelectedAttrs(previewProduct.variants[0]?.attributes ?? {});
      setLoading(false);
      return;
    }

    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let cancelled = false;

    fetchPublicProductDetail(id)
      .then((data) => {
        if (cancelled) return;

        if (!data) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        setProduct(data);
        setLoading(false);

        fetchPublicProducts()
          .then((all) => {
            if (cancelled) return;

            setRelated(
              all
                .filter(
                  (candidate) =>
                    candidate.category === data.category &&
                    candidate.id !== data.id,
                )
                .slice(0, 4),
            );
          })
          .catch(() => {
            // Los relacionados son un extra: si fallan, no bloquean la vista.
          });
      })
      .catch(() => {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, previewProduct]);

  /*
   * ==========================================================
   * CARGANDO
   * ==========================================================
   */
  if (loading) {
    return (
      <div
        className={
          isCatalog
            ? 'max-w-[1160px] mx-auto px-5 py-24 text-center text-[var(--visual-page-color)]'
            : isMinimal
              ? 'max-w-6xl mx-auto px-4 md:px-8 py-20 text-center'
              : 'max-w-7xl mx-auto px-4 py-16 text-center'
        }
      >
        <p className="text-sm text-[var(--muted-foreground)]">
          Cargando producto...
        </p>
      </div>
    );
  }

  /*
   * ==========================================================
   * PRODUCTO NO ENCONTRADO
   * ==========================================================
   */
  if (!product || notFound) {
    return (
      <div
        className={
          isCatalog
            ? 'max-w-[1160px] mx-auto px-5 py-24 text-center text-[var(--visual-page-color)]'
            : isMinimal
              ? 'max-w-6xl mx-auto px-4 md:px-8 py-20 text-center'
              : 'max-w-7xl mx-auto px-4 py-16 text-center'
        }
      >
        <Icon
          name="search"
          className="w-12 h-12 mx-auto mb-4 text-[var(--muted-foreground)] opacity-40"
        />

        <h1 className="text-xl font-semibold mb-2">
          Producto no encontrado
        </h1>

        <Link data-page-action="ghost"
          to={route('catalogo')}
          className="text-[var(--primary)] hover:underline"
        >
          Volver al catálogo
        </Link>
      </div>
    );
  }
  /*
   * ==========================================================
   * VARIANTE SELECCIONADA
   * ==========================================================
   */
  const attributeKeys = Object.keys(product.attributes);
  const completeSelection = attributeKeys.every((key) => selectedAttrs[key]);

  const selectedVariant = completeSelection
    ? product.variants.find((variant) =>
        Object.entries(selectedAttrs).every(
          ([key, value]) => variant.attributes[key] === value,
        ),
      )
    : undefined;

  const price = selectedVariant?.price ?? product.basePrice;

  const comparePrice =
    selectedVariant ? selectedVariant.comparePrice : product.comparePrice;

  const stock =
    selectedVariant?.stock ??
    product.variants.reduce(
      (total, variant) => total + variant.stock,
      0,
    );

  const inStock = selectedVariant
    ? selectedVariant.available && selectedVariant.stock > 0
    : product.variants.some(
        (variant) => variant.available && variant.stock > 0,
      );

  const discountPct = comparePrice
    ? Math.round((1 - price / comparePrice) * 100)
    : 0;

  /*
   * Comprueba si una opción de variante puede seleccionarse
   * considerando los otros atributos ya escogidos.
   */
  const isVariantAvailable = (
    attr: string,
    value: string,
  ) => {
    return product.variants.some(
      (variant) =>
        variant.available &&
        variant.stock > 0 &&
        variant.attributes[attr] === value &&
        Object.entries(selectedAttrs)
          .filter(([key]) => key !== attr)
          .every(
            ([key, selectedValue]) =>
              variant.attributes[key] === selectedValue,
          ),
    );
  };

  const variantOptionLabel = (value: string, available: boolean) =>
    available ? value : `${value} - Agotado`;

  const inCart = previewProduct ? 0 :
    items.find(
      (item) =>
        item.productId === (product.catalogId || product.id) &&
        item.variantId === selectedVariant?.id,
    )?.quantity ?? 0;

  const remaining = Math.max(0, stock - inCart);
  const hasCartItems = previewProduct ? true : items.length > 0;
  /*
   * ==========================================================
   * AGREGAR AL CARRITO
   * ==========================================================
   */
  const handleAddToCart = () => {
    if (
      !selectedVariant ||
      !completeSelection ||
      !inStock ||
      remaining === 0
    ) {
      return;
    }

    if (previewProduct) { setAdded(true); return; }

    addItem({
      productId: product.catalogId || product.id,
      variantId: selectedVariant.id,
      name: product.name,
      image: product.images[0],
      price: selectedVariant.price,
      comparePrice: selectedVariant.comparePrice,
      quantity: Math.min(qty, remaining),
      attributes: selectedVariant.attributes,
      sku: selectedVariant.sku,
      maxStock: selectedVariant.stock,
    });

    setAdded(true);
    };




  /*
   * ==========================================================
   * PLANTILLA 4 — CATALOG / DARK EDITORIAL
   * ==========================================================
   */

  if (isCatalog) {
    return (
      <div className="bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]">
        <div className="max-w-[1160px] mx-auto px-5 py-8 md:py-12">
          <Link data-page-action="ghost"
            to={route('catalogo')}
            className="inline-flex items-center gap-2 mb-8 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--visual-page-color)]/45 transition-colors hover:text-[var(--visual-page-color)]"
          >
            <span aria-hidden="true">←</span>
            Volver al catálogo
          </Link>

          <div data-page-columns className="grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] gap-9 lg:gap-14 items-start">
            {/* GALERÍA */}
            <div>
              <div data-page-panel className="relative overflow-hidden rounded-[22px] bg-[var(--visual-page-panel-background)] aspect-[4/4.25]">
                <img data-page-main-image
                  src={product.images[activeImg]}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />

                {comparePrice && (
                  <span className="absolute left-4 top-4 rounded-full bg-[var(--primary)] px-3.5 py-2 text-[10px] font-black text-[var(--visual-page-color)]">
                    -{discountPct}%
                  </span>
                )}
              </div>

              {product.images.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pt-3 pb-1">
                  {product.images.map((img, index) => (
                    <button data-page-gallery-item data-page-action="choice"
                      type="button"
                      key={index}
                      aria-label={`Ver imagen ${index + 1}`}
                      aria-pressed={activeImg === index}
                      onClick={() => setActiveImg(index)}
                      className={`w-[76px] h-[76px] flex-shrink-0 overflow-hidden rounded-[10px] border-2 transition-colors ${
                        activeImg === index
                          ? 'border-[var(--primary)]'
                          : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={img}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* INFORMACIÓN */}
            <div className="lg:pt-2">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                  {product.category}
                </span>

                {comparePrice && (
                  <span className="rounded-full border border-[var(--visual-global-border)]/15 px-3 py-1 text-[9px] font-bold text-[var(--visual-page-color)]/65">
                    Oferta -{discountPct}%
                  </span>
                )}

                {!inStock && (
                  <span className="rounded-full bg-[var(--visual-page-panel-background)] px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--visual-page-color)]">
                    Sin stock
                  </span>
                )}
              </div>

              <h1 className="text-[42px] sm:text-[50px] lg:text-[58px] leading-[0.96] tracking-[-0.045em] font-black">
                {product.name}
              </h1>

              <p className="mt-4 text-[10px] uppercase tracking-[0.12em] text-[var(--visual-page-color)]/30">
                SKU: {selectedVariant?.sku ?? product.variants[0]?.sku ?? 'N/A'}
              </p>

              <div className="flex items-baseline gap-3 mt-7">
                <span data-page-price className="text-[26px] font-black">
                  {formatPrice(price)}
                </span>

                {comparePrice && (
                  <span className="text-[13px] text-[var(--visual-page-color)]/35 line-through">
                    {formatPrice(comparePrice)}
                  </span>
                )}
              </div>

              <p data-page-description className="mt-6 max-w-xl text-[13px] leading-6 text-[var(--visual-page-color)]/55">
                {product.description}
              </p>

              <ProductAttributes slug={product.id} previewAttributes={previewProduct ? previewAttributes : undefined} />

              {/* VARIANTES */}
              {Object.entries(product.attributes).map(([attrName, values]) => (
                <div key={attrName} className="border-t border-[var(--visual-global-border)]/10 mt-7 pt-6">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--visual-page-color)]/75">
                      {product.attributeLabels?.[attrName] || attrName}
                    </p>

                    <span className="text-[11px] text-[var(--visual-page-color)]/35">
                      {selectedAttrs[attrName] ?? 'Seleccionar'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {values.map((value) => {
                      const available = isVariantAvailable(attrName, value);
                      const selected = selectedAttrs[attrName] === value;

                      return (
                        <button data-page-action="choice"
                          type="button"
                          key={value}
                          disabled={!available}
                          aria-pressed={selected}
                          onClick={() => {
                            setSelectedAttrs((previous) => ({
                              ...previous,
                              [attrName]: value,
                            }));
                            setQty(1);
                            setAdded(false);
                          }}
                          className={`min-w-[54px] rounded-[9px] border px-4 py-2.5 text-[11px] font-semibold transition-colors ${
                            selected
                              ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--visual-page-color)]'
                              : 'border-[var(--visual-global-border)]/15 bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]/75 hover:border-[var(--visual-global-border)]/40'
                          } ${
                            !available
                              ? 'cursor-not-allowed opacity-25 line-through'
                              : ''
                          }`}
                        >
                          {variantOptionLabel(value, available)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* STOCK */}
              {selectedVariant && completeSelection && <StockFeedback sku={selectedVariant.sku} maxStock={selectedVariant.stock} quantity={inCart} className="mt-5 rounded-[10px] border border-[#ff5a1f]/25 bg-[#ff5a1f]/10 px-4 py-3 text-[11px] text-[#ffb291]" />}

              {!inStock && (
                <div data-page-panel className="mt-5 rounded-[10px] border border-[var(--visual-global-border)]/10 bg-[var(--visual-page-panel-background)]/[0.06] px-4 py-3 text-[11px] text-[var(--visual-page-color)]/55">
                  Este producto no está disponible actualmente.
                </div>
              )}

              {/* CANTIDAD + CARRITO */}
              <div className="border-t border-[var(--visual-global-border)]/10 mt-7 pt-6">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.15em] text-[var(--visual-page-color)]/75">
                  Cantidad
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <QuantityControl value={qty} onDecrease={() => setQty(current => Math.max(1, current - 1))} onIncrease={() => setQty(current => Math.max(1, Math.min(remaining, current + 1)))} increaseDisabled={!inStock || !completeSelection || qty >= remaining} />

                  <button data-page-action="primary"
                    type="button"
                    onClick={handleAddToCart}
                    disabled={
                      !inStock ||
                      !selectedVariant ||
                      !completeSelection ||
                      remaining === 0
                    }
                    className={`h-12 flex-1 rounded-[9px] px-6 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                      added
                        ? 'bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]'
                        : 'bg-[var(--primary)] text-[var(--visual-page-color)] hover:bg-[var(--primary)]'
                    }`}
                  >
                    {remaining === 0
                      ? 'Stock agregado al carrito'
                      : added
                        ? '✓ Agregado al carrito'
                        : !inStock
                          ? 'Sin stock'
                          : !completeSelection
                            ? 'Selecciona variante'
                            : 'Agregar al carrito'}
                  </button>
                </div>

                {hasCartItems && (
                  <Link data-page-action="outline"
                    to={route('carrito')}
                    className="mt-3 flex h-11 w-full items-center justify-center rounded-[9px] border border-[var(--visual-global-border)]/15 text-[11px] font-bold text-[var(--visual-page-color)] transition-colors hover:bg-[var(--visual-page-panel-background)] hover:text-[var(--visual-page-color)]"
                  >
                    Ir al carrito →
                  </Link>
                )}
              </div>

              {/* ENTREGA */}
              <div data-page-panel className="mt-8 rounded-[14px] bg-[var(--visual-page-panel-background)] p-5 text-[var(--visual-page-color)]">
                <p className="mb-4 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--visual-page-color)]/45">
                  Compra y entrega
                </p>

                <div className="flex flex-col gap-3 text-[12px] text-[var(--visual-page-color)]/60">
                  <div className="flex items-center gap-3">
                    <Icon name="truck" className="w-4 h-4 text-[#1683ff]" />
                    <span>Chilexpress · Starken</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Icon name="store" className="w-4 h-4 text-[#1683ff]" />
                    <span>Retiro en tienda disponible</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Icon name="box" className="w-4 h-4 text-[#1683ff]" />
                    <span>Envío gratis sobre $50.000</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RELACIONADOS */}
          {related.length > 0 && (
            <section className="mt-20 md:mt-24 border-t border-[var(--visual-global-border)]/10 pt-12">
              <div className="flex items-end justify-between gap-4 mb-8">
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                    Sigue explorando
                  </p>

                  <h2 className="text-[32px] md:text-[42px] leading-none tracking-[-0.035em] font-black">
                    También podría gustarte.
                  </h2>
                </div>

                <Link data-page-action="ghost"
                  to={route('catalogo')}
                  className="hidden sm:inline text-[11px] font-semibold text-[var(--primary)] hover:opacity-70"
                >
                  Ver catálogo →
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {related.map((relatedProduct) => (
                  <ProductCard
                    key={relatedProduct.id}
                    product={relatedProduct}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  if (isVisual) {
    return (
      <div className="bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]">
        <div className="max-w-[1180px] mx-auto px-5 md:px-8 py-8 md:py-12">
          <Link data-page-action="ghost"
            to={route('catalogo')}
            className="inline-flex items-center gap-2 mb-8 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--visual-page-color)] hover:opacity-60"
          >
            <span aria-hidden="true">←</span>
            Volver al catálogo
          </Link>

          <div data-page-columns className="grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] gap-10 lg:gap-16 items-start">
            {/* Galería */}
            <div>
              <div data-page-panel className="overflow-hidden rounded-[12px] bg-[var(--visual-page-panel-background)] aspect-[4/4.15]">
                <img data-page-main-image
                  src={product.images[activeImg]}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {product.images.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pt-3 pb-1">
                  {product.images.map((img, index) => (
                    <button data-page-gallery-item data-page-action="choice"
                      type="button"
                      key={index}
                      aria-label={`Ver imagen ${index + 1}`}
                      aria-pressed={activeImg === index}
                      onClick={() => setActiveImg(index)}
                      className={`w-[74px] h-[74px] flex-shrink-0 overflow-hidden rounded-[8px] border transition-colors ${
                        activeImg === index
                          ? 'border-[var(--visual-global-border)]'
                          : 'border-transparent'
                      }`}
                    >
                      <img
                        src={img}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Información */}
            <div className="lg:pt-3">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--visual-page-color)]">
                  {product.category}
                </span>

                {comparePrice && (
                  <span className="rounded-full bg-[var(--visual-page-panel-background)] px-3 py-1 text-[9px] font-semibold">
                    -{discountPct}%
                  </span>
                )}

                {!inStock && (
                  <span className="rounded-full bg-[var(--visual-page-panel-background)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--visual-page-color)]">
                    Sin stock
                  </span>
                )}
              </div>

              <h1 className="font-serif text-[42px] sm:text-[50px] lg:text-[58px] leading-[0.98] tracking-[-0.03em]">
                {product.name}
              </h1>

              <p className="mt-4 text-[11px] uppercase tracking-[0.12em] text-[var(--visual-page-color)]">
                SKU: {selectedVariant?.sku ?? product.variants[0]?.sku ?? 'N/A'}
              </p>

              <div className="flex items-baseline gap-3 mt-7">
                <span data-page-price className="text-[24px] font-semibold">
                  {formatPrice(price)}
                </span>

                {comparePrice && (
                  <span className="text-[13px] text-[var(--visual-page-color)] line-through">
                    {formatPrice(comparePrice)}
                  </span>
                )}
              </div>

              <p data-page-description className="mt-6 max-w-xl text-[14px] leading-7 text-[var(--visual-page-color)]">
                {product.description}
              </p>

              <ProductAttributes slug={product.id} previewAttributes={previewProduct ? previewAttributes : undefined} />

              {/* Variantes */}
              {Object.entries(product.attributes).map(([attrName, values]) => (
                <div key={attrName} className="border-t border-[var(--visual-global-border)]/10 mt-7 pt-6">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                      {product.attributeLabels?.[attrName] || attrName}
                    </p>

                    <span className="text-[11px] text-[var(--visual-page-color)]">
                      {selectedAttrs[attrName] ?? 'Seleccionar'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {values.map((value) => {
                      const available = isVariantAvailable(attrName, value);
                      const selected = selectedAttrs[attrName] === value;

                      return (
                        <button data-page-action="choice"
                          type="button"
                          key={value}
                          disabled={!available}
                          aria-pressed={selected}
                          onClick={() => {
                            setSelectedAttrs((previous) => ({
                              ...previous,
                              [attrName]: value,
                            }));
                            setQty(1);
                            setAdded(false);
                          }}
                          className={`min-w-[52px] rounded-[7px] border px-4 py-2.5 text-[12px] transition-colors ${
                            selected
                              ? 'border-[var(--visual-global-border)] bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]'
                              : 'border-[var(--visual-global-border)]/15 bg-[var(--visual-page-panel-background)] hover:border-[var(--visual-global-border)]'
                          } ${
                            !available
                              ? 'cursor-not-allowed opacity-30 line-through'
                              : ''
                          }`}
                        >
                          {variantOptionLabel(value, available)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {selectedVariant && completeSelection && <StockFeedback sku={selectedVariant.sku} maxStock={selectedVariant.stock} quantity={inCart} className="mt-5 rounded-[8px] bg-[#f4f1e8] px-4 py-3 text-[12px] text-[#5f5849]" />}

              {!inStock && (
                <div data-page-panel className="mt-5 rounded-[8px] bg-[var(--visual-page-panel-background)] px-4 py-3 text-[12px] text-[var(--visual-page-color)]">
                  Este producto no está disponible actualmente.
                </div>
              )}

              {/* Cantidad + carrito */}
              <div className="border-t border-[var(--visual-global-border)]/10 mt-7 pt-6">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em]">
                  Cantidad
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <QuantityControl value={qty} onDecrease={() => setQty(current => Math.max(1, current - 1))} onIncrease={() => setQty(current => Math.max(1, Math.min(remaining, current + 1)))} increaseDisabled={!inStock || !completeSelection || qty >= remaining} />

                  <button data-page-action="primary"
                    type="button"
                    onClick={handleAddToCart}
                    disabled={
                      !inStock ||
                      !selectedVariant ||
                      !completeSelection ||
                      remaining === 0
                    }
                    className={`h-12 flex-1 rounded-[8px] px-6 text-[12px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-35 ${
                      added
                        ? 'bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]'
                        : 'bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] hover:opacity-80'
                    }`}
                  >
                    {remaining === 0
                      ? 'Stock agregado al carrito'
                      : added
                        ? '✓ Agregado al carrito'
                        : !inStock
                          ? 'Sin stock'
                          : !completeSelection
                            ? 'Selecciona variante'
                            : 'Agregar al carrito'}
                  </button>
                </div>

                {hasCartItems && (
                  <Link data-page-action="primary"
                    to={route('carrito')}
                    className="mt-3 flex h-11 w-full items-center justify-center rounded-[8px] border border-[var(--visual-global-border)] text-[11px] font-semibold transition-colors hover:bg-[var(--visual-page-panel-background)] hover:text-[var(--visual-page-color)]"
                  >
                    Ir al carrito →
                  </Link>
                )}
              </div>

              {/* Entrega */}
              <div data-page-panel className="mt-8 rounded-[10px] bg-[var(--visual-page-panel-background)] p-5">
                <p className="mb-4 text-[9px] font-semibold uppercase tracking-[0.18em]">
                  Compra y entrega
                </p>

                <div className="flex flex-col gap-3 text-[12px] text-[var(--visual-page-color)]">
                  <div className="flex items-center gap-3">
                    <Icon name="truck" className="w-4 h-4 text-black" />
                    <span>Despacho a todo Chile</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Icon name="store" className="w-4 h-4 text-black" />
                    <span>Retiro en tienda disponible</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Icon name="box" className="w-4 h-4 text-black" />
                    <span>Embalaje seguro para tu pedido</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Relacionados */}
          {related.length > 0 && (
            <section className="mt-20 md:mt-24 border-t border-[var(--visual-global-border)]/10 pt-12">
              <div className="flex items-end justify-between gap-4 mb-8">
                <div>
                  <p className="mb-2 text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--visual-page-color)]">
                    También podría gustarte
                  </p>
                  <h2 className="font-serif text-[34px] md:text-[42px] leading-none">
                    Productos relacionados
                  </h2>
                </div>

                <Link data-page-action="outline"
                  to={route('catalogo')}
                  className="hidden sm:inline text-[10px] font-semibold uppercase tracking-[0.12em] border-b border-[var(--visual-global-border)] pb-1"
                >
                  Ver catálogo
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {related.map((relatedProduct) => (
                  <ProductCard
                    key={relatedProduct.id}
                    product={relatedProduct}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        isMinimal
          ? 'max-w-6xl mx-auto px-4 md:px-8 pt-10 pb-8'
          : 'max-w-7xl mx-auto px-4 py-8'
      }
    >
      {/* =====================================================
          BREADCRUMB
      ====================================================== */}
      <Breadcrumb
        items={[
          {
            label: 'Catálogo',
            href: route('catalogo'),
          },
          {
            label: product.category,
            href: route(
              `catalogo?cat=${encodeURIComponent(
                product.category,
              )}`,
            ),
          },
          {
            label: product.name,
          },
        ]}
      />

      {/* =====================================================
          PRODUCTO
      ====================================================== */}
      <div data-page-columns
        className={`
          grid grid-cols-1 lg:grid-cols-2
          ${isMinimal ? 'mt-7 gap-8 lg:gap-12' : 'mt-6 gap-10'}
        `}
      >
        {/* =================================================
            GALERÍA
        ================================================== */}
        <div className="flex flex-col gap-3">
          <div data-page-panel
            className={`
              overflow-hidden bg-[var(--muted)]
              ${
                isMinimal
                  ? 'aspect-[4/4.3] rounded-[28px]'
                  : 'aspect-square rounded-2xl'
              }
            `}
          >
            <img data-page-main-image
              src={product.images[activeImg]}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>

          {product.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {product.images.map((img, index) => (
                <button data-page-gallery-item data-page-action="choice"
                  type="button"
                  key={index}
                  aria-label={`Ver imagen ${index + 1}`}
                  aria-pressed={activeImg === index}
                  onClick={() => setActiveImg(index)}
                  className={`
                    w-16 h-16 overflow-hidden border-2
                    transition-colors flex-shrink-0
                    ${
                      isMinimal
                        ? 'rounded-xl'
                        : 'rounded-lg'
                    }
                    ${
                      activeImg === index
                        ? 'border-[var(--primary)]'
                        : 'border-transparent'
                    }
                  `}
                >
                  <img
                    src={img}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* =================================================
            INFORMACIÓN
        ================================================== */}
        <div
          className={
            isMinimal
              ? 'flex flex-col gap-6 lg:py-3'
              : 'flex flex-col gap-5'
          }
        >
          {/* Categoría + nombre */}
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {isMinimal ? (
                <span className="text-xs uppercase tracking-[0.12em] text-[var(--visual-page-color)]">
                  {product.category}
                </span>
              ) : (
                <Badge variant="default">
                  {product.category}
                </Badge>
              )}

              {comparePrice && (
                <Badge variant="accent">
                  -{discountPct}%
                </Badge>
              )}

              {!inStock && (
                <Badge variant="error">
                  Sin stock
                </Badge>
              )}
            </div>

            <h1
              className={
                isMinimal
                  ? 'text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight leading-[1.05] text-[var(--visual-page-color)]'
                  : 'text-3xl font-bold text-[var(--foreground)]'
              }
            >
              {product.name}
            </h1>

            <p
              className={
                isMinimal
                  ? 'text-xs text-[var(--visual-page-color)] mt-3'
                  : 'text-sm text-[var(--muted-foreground)] mt-1'
              }
            >
              SKU:{' '}
              {selectedVariant?.sku ??
                product.variants[0]?.sku ??
                'N/A'}
            </p>
          </div>

          {/* =================================================
              PRECIO
          ================================================== */}
          <div className="flex items-baseline gap-3">
            <span data-page-price
              className={
                isMinimal
                  ? 'text-3xl font-semibold tracking-tight text-[var(--visual-page-color)]'
                  : 'text-4xl font-bold text-[var(--foreground)]'
              }
            >
              {formatPrice(price)}
            </span>

            {comparePrice && (
              <span
                className={
                  isMinimal
                    ? 'text-sm text-[var(--visual-page-color)] line-through'
                    : 'text-xl text-[var(--muted-foreground)] line-through'
                }
              >
                {formatPrice(comparePrice)}
              </span>
            )}
          </div>

          {/* =================================================
              VARIANTES
          ================================================== */}
          {Object.entries(product.attributes).map(
            ([attrName, values]) => (
              <div
                key={attrName}
                className={
                  isMinimal
                    ? 'border-t border-[var(--visual-global-border)]/5 pt-5'
                    : ''
                }
              >
                <p className="text-sm font-semibold text-[var(--foreground)] mb-3">
                  {product.attributeLabels?.[attrName] || attrName}

                  <span className="font-normal text-[var(--muted-foreground)] ml-1">
                    {selectedAttrs[attrName]
                      ? `· ${selectedAttrs[attrName]}`
                      : '· Seleccionar'}
                  </span>
                </p>

                <div className="flex flex-wrap gap-2">
                  {values.map((value) => {
                    const available =
                      isVariantAvailable(
                        attrName,
                        value,
                      );

                    const selected =
                      selectedAttrs[attrName] === value;

                    return (
                      <button data-page-action="choice"
                        type="button"
                        key={value}
                        disabled={!available}
                        aria-pressed={selected}
                        onClick={() => {
                          setSelectedAttrs(
                            (previous) => ({
                              ...previous,
                              [attrName]: value,
                            }),
                          );

                          setQty(1);
                          setAdded(false);
                        }}
                        className={`
                          px-4 py-2 text-sm font-medium
                          border transition-all
                          ${
                            isMinimal
                              ? 'rounded-full min-w-[52px]'
                              : 'rounded-lg'
                          }
                          ${
                            selected
                              ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--visual-page-color)]'
                              : 'border-[var(--border)] bg-[var(--visual-page-panel-background)] text-[var(--foreground)] hover:border-[var(--primary)]'
                          }
                          ${
                            !available
                              ? 'opacity-30 cursor-not-allowed line-through'
                              : ''
                          }
                        `}
                      >
                        {variantOptionLabel(value, available)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ),
          )}

          {/* =================================================
              STOCK
          ================================================== */}
          {selectedVariant && completeSelection && <StockFeedback sku={selectedVariant.sku} maxStock={selectedVariant.stock} quantity={inCart} />}

          {!inStock && (
            <Alert variant="error">
              Este producto no está disponible actualmente.
            </Alert>
          )}

          {/* =================================================
              CANTIDAD + CARRITO
          ================================================== */}
          <div
            className={
              isMinimal
                ? 'flex flex-col sm:flex-row gap-3 border-t border-[var(--visual-global-border)]/5 pt-5'
                : 'flex gap-3'
            }
          >
            <QuantityControl value={qty} onDecrease={() => setQty(current => Math.max(1, current - 1))} onIncrease={() => setQty(current => Math.max(1, Math.min(remaining, current + 1)))} increaseDisabled={!inStock || !completeSelection || qty >= remaining} />

            <div className="flex-1 flex flex-col gap-2">
              <button data-page-action="primary"
                type="button"
                onClick={handleAddToCart}
                disabled={
                  !inStock ||
                  !selectedVariant ||
                  !completeSelection ||
                  remaining === 0
                }
                className={`
                  w-full font-semibold text-sm transition-all
                  ${
                    isMinimal
                      ? 'h-12 rounded-full'
                      : 'h-11 rounded-lg'
                  }
                  ${
                    added
                      ? 'bg-[var(--success)] text-[var(--visual-page-color)]'
                      : 'bg-[var(--primary)] text-[var(--visual-page-color)] hover:bg-[var(--primary)]'
                  }
                  disabled:opacity-50
                  disabled:cursor-not-allowed
                `}
              >
                {remaining === 0
                  ? 'Stock agregado al carrito'
                  : added
                    ? '✓ Agregado al carrito'
                    : !inStock
                      ? 'Sin stock'
                      : !completeSelection
                        ? 'Selecciona variante'
                        : 'Agregar al carrito'}
              </button>

              {hasCartItems && (
                <Link data-page-action="outline"
                  to={route('carrito')}
                  className={`
                    w-full font-semibold text-sm
                    flex items-center justify-center
                    transition-all
                    ${
                      isMinimal
                        ? 'h-11 rounded-full'
                        : 'h-10 rounded-lg'
                    }
                    border border-[var(--primary)]
                    text-[var(--primary)]
                    bg-[var(--visual-page-panel-background)]
                    hover:bg-[var(--visual-page-panel-background)]
                  `}
                >
                  Ir al carrito →
                </Link>
              )}
            </div>
          </div>

          {/* =================================================
              DESCRIPCIÓN
          ================================================== */}
          <div className="border-t border-[var(--border)] pt-5">
            <h2
              className={
                isMinimal
                  ? 'text-base font-semibold mb-2'
                  : 'text-sm font-semibold mb-2'
              }
            >
              Descripción
            </h2>

            <p data-page-description className="text-sm text-[var(--muted-foreground)] leading-relaxed">
              {product.description}
            </p>
          </div>

          <ProductAttributes slug={product.id} previewAttributes={previewProduct ? previewAttributes : undefined} />

          {/* =================================================
              ENTREGA
          ================================================== */}
          <div data-page-panel
            className={
              isMinimal
                ? 'bg-[var(--visual-page-panel-background)] border border-[var(--visual-global-border)]/5 rounded-[20px] p-5'
                : 'bg-[var(--muted)] rounded-xl p-4'
            }
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-3">
              Entrega
            </p>

            <div className="flex flex-col gap-3 text-sm text-[var(--foreground)]">
              <div className="flex items-center gap-3">
                <Icon
                  name="truck"
                  className="w-4 h-4 text-[var(--muted-foreground)]"
                />

                <span>
                  Chilexpress · Starken
                </span>
              </div>

              <div className="flex items-center gap-3">
                <Icon
                  name="store"
                  className="w-4 h-4 text-[var(--muted-foreground)]"
                />

                <span>
                  Retiro en tienda disponible
                </span>
              </div>

              <div className="flex items-center gap-3">
                <Icon
                  name="box"
                  className="w-4 h-4 text-[var(--muted-foreground)]"
                />

                <span>
                  Envío gratis sobre $50.000
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================
          PRODUCTOS RELACIONADOS
      ====================================================== */}
      {related.length > 0 && (
        <section
          className={
            isMinimal
              ? 'mt-20'
              : 'mt-16'
          }
        >
          {isMinimal && (
            <p className="text-xs text-[var(--visual-page-color)] mb-2">
              También podría gustarte
            </p>
          )}

          <div className="flex items-end justify-between gap-4 mb-6">
            <h2
              className={
                isMinimal
                  ? 'text-2xl md:text-3xl font-semibold tracking-tight'
                  : 'text-xl font-semibold'
              }
            >
              Productos relacionados
            </h2>

            {isMinimal && (
              <Link data-page-action="ghost"
                to={route('catalogo')}
                className="text-sm text-[var(--primary)] hover:opacity-60 transition-opacity"
              >
                Ver catálogo →
              </Link>
            )}
          </div>

          <div
            className={
              isMinimal
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'
                : 'grid grid-cols-2 sm:grid-cols-4 gap-4'
            }
          >
            {related.map((relatedProduct) => (
              <ProductCard
                key={relatedProduct.id}
                product={relatedProduct}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
