import { VISUAL_SECTION } from '../../visual/sectionIds';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Product, formatPrice } from '../../data/mockData';
import { StockFeedback } from './StockFeedback';
import { Badge } from '../ui';
import { useCart } from '../../context/CartContext';
import { useStorefrontTemplate } from '../../hooks/useStorefrontTemplate';

interface ProductCardProps {
  product: Product;
  layout?: 'grid' | 'list' | 'compact' | 'featured';
}

export function ProductCard({
  product,
  layout = 'grid',
}: ProductCardProps) {
  const { addItem, items } = useCart();

  const {
    route,
    isMinimal,
    isVisual,
    isCatalog,
  } = useStorefrontTemplate();

  const [added, setAdded] = useState(false);

  const hasRealVariants = product.variantsLoaded !== false;
  const inStock = product.variants.some(variant => variant.available && variant.stock > 0);
  const defaultVariant = product.variants.find(variant => variant.available && variant.stock > 0)
    ?? product.variants[0];
  const attributeNames = Object.keys(product.attributes).filter(name =>
    product.attributes[name].some(value => value.trim()));
  const [selectedVariantId, setSelectedVariantId] = useState(defaultVariant?.id ?? '');
  const selectedVariant = hasRealVariants
    ? product.variants.find(variant => variant.id === selectedVariantId) : undefined;
  const price = selectedVariant?.price ?? product.basePrice;
  const comparePrice = selectedVariant ? selectedVariant.comparePrice : product.comparePrice;
  const hasDiscount = comparePrice !== undefined && comparePrice > price;
  const discountPct = hasDiscount ? Math.round((1 - price / comparePrice!) * 100) : 0;

  const selectedStock = selectedVariant?.stock ?? 0;

  const canBuySelectedVariant =
    !!selectedVariant &&
    selectedVariant.available &&
    selectedVariant.stock > 0;

  const quantity =
    items.find(
      (item) =>
        item.productId === (product.catalogId || product.id) &&
        item.variantId === selectedVariant?.id,
    )?.quantity ?? 0;

  const atLimit =
    !!selectedVariant && quantity >= selectedVariant.stock;

  const productPath = route(`producto/${product.id}`);

  const handleAddToCart = () => {
    if (!selectedVariant || !canBuySelectedVariant || atLimit) {
      return;
    }

    addItem({
      productId: product.catalogId || product.id,
      variantId: selectedVariant.id,
      name: product.name,
      image: product.images[0],
      price: selectedVariant.price,
      comparePrice: selectedVariant.comparePrice,
      quantity: 1,
      attributes: selectedVariant.attributes,
      sku: selectedVariant.sku,
      maxStock: selectedVariant.stock,
    });

    setAdded(true);
  };

  const renderVariantSelector = (
    mode: 'dark' | 'light' | 'visual' = 'light',
  ) => {
    if (!hasRealVariants) return <Link to={productPath} className="mt-3 text-xs underline">Ver opciones</Link>;
    if (attributeNames.length === 0 && product.variants.length < 2) return null;

    const selectClass =
      mode === 'dark'
        ? 'border-white/10 bg-[#202022] text-white'
        : mode === 'visual'
          ? 'border-[#d8d4d1] bg-white text-[#111111]'
          : 'border-[var(--border)] bg-white text-[var(--foreground)]';

    const mutedClass =
      mode === 'dark'
        ? 'text-white/50'
        : mode === 'visual'
          ? 'text-[#77716f]'
          : 'text-[var(--muted-foreground)]';

    return (
      <div className="mt-3 grid gap-2 min-w-0">
        <div className="grid gap-2 min-w-0">
          <label className={`grid gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] min-w-0 ${mutedClass}`}>
            <span>{attributeNames.length === 1 ? product.attributeLabels?.[attributeNames[0]] || attributeNames[0] : 'Variante'}</span>
            <select
              aria-label={attributeNames.length === 1 ? product.attributeLabels?.[attributeNames[0]] || attributeNames[0] : 'Variante'}
              value={selectedVariantId}
              onChange={event => { setSelectedVariantId(event.target.value); setAdded(false); }}
              className={`h-10 sm:h-9 w-full min-w-0 rounded-lg border px-2 text-xs normal-case tracking-normal outline-none ${selectClass}`}
            >
              {product.variants.map(variant => {
                const label = attributeNames.map(name => {
                  const value = variant.attributes[name];
                  if (!value?.trim()) return '';
                  return attributeNames.length === 1 ? value : `${product.attributeLabels?.[name] || name}: ${value}`;
                }).filter(Boolean).join(' · ') || variant.sku;
                const available = variant.available && variant.stock > 0;
                return <option key={variant.id} value={variant.id} disabled={!available}>
                  {label}{available ? '' : ' — Sin stock'}
                </option>;
              })}
            </select>
          </label>
        </div>
        <p className={`text-[10px] break-words ${mutedClass}`}>
          SKU: {selectedVariant?.sku ?? 'No disponible'} · Stock:{' '}
          {selectedStock} uds
        </p>
      </div>
    );
  };

  /*
   * ==========================================================
   * PLANTILLA 4 — CATALOG / DARK EDITORIAL
   * ==========================================================
   */

  if (isCatalog && layout === 'grid') {
    return (
      <article data-visual-section={VISUAL_SECTION.productCard} data-visual-card="grid" className="group flex h-full min-w-0 flex-col overflow-hidden rounded-[14px] bg-white text-[#151515]">
        <Link
          to={productPath}
          aria-label={`Ver ${product.name}`}
          className="relative block aspect-[1.08/1] overflow-hidden bg-[#ececea]"
        >
          <img
            src={product.images[0]}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
          />

          {hasDiscount && (
            <span className="absolute left-3 top-3 rounded-full bg-[var(--accent)] px-3 py-1.5 text-[9px] font-black text-[var(--on-accent)]">
              -{discountPct}%
            </span>
          )}

          {product.featured && inStock && (
            <span className="absolute right-3 top-3 rounded-full bg-black/80 px-3 py-1.5 text-[9px] font-bold text-white backdrop-blur-sm">
              Destacado
            </span>
          )}

          {!inStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55">
              <span className="rounded-full bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-black">
                Sin stock
              </span>
            </div>
          )}
        </Link>

        <div data-visual-part="body" className="flex flex-1 min-w-0 flex-col p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--accent)]">
            {product.category}
          </p>

          <h3 className="mt-2 text-[17px] font-extrabold leading-tight tracking-[-0.02em] break-words">
            <Link to={productPath} className="transition-opacity hover:opacity-60">
              {product.name}
            </Link>
          </h3>

          <p data-visual-part="description" className="mt-2 line-clamp-2 min-h-[36px] text-[11px] leading-[1.55] text-black/60 break-words">
            {product.description}
          </p>

          <div className="mt-auto flex items-end justify-between gap-3 pt-5">
            <div>
              <p data-visual-part="price" className="text-[14px] font-black">
                {formatPrice(price)}
              </p>

              {hasDiscount && (
                <p className="mt-0.5 text-[10px] text-black/60 line-through">
                  {formatPrice(comparePrice!)}
                </p>
              )}
            </div>

            {!inStock && (
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-black/60">
                Agotado
              </span>
            )}
          </div>

          {renderVariantSelector()}
          {selectedVariant && <StockFeedback sku={selectedVariant.sku} maxStock={selectedVariant.stock} quantity={quantity} />}

          {inStock && (
            <button data-visual-part="buyButton"
              type="button"
              onClick={handleAddToCart}
              disabled={!canBuySelectedVariant || atLimit}
              aria-label={`Agregar ${product.name} al carrito`}
              className="mt-4 min-h-11 sm:min-h-10 h-11 sm:h-10 w-full rounded-[9px] bg-[var(--primary)] text-[11px] font-bold text-[var(--on-primary)] transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {atLimit ? 'Maximo disponible' : added ? 'Agregado' : 'Comprar'}
            </button>
          )}

          <span className="sr-only" role="status">
            {added ? `${product.name} agregado al carrito` : ''}
          </span>
        </div>
      </article>
    );
  }

  if (isCatalog && layout === 'list') {
    return (
      <article data-visual-section={VISUAL_SECTION.productCard} data-visual-card="list" className="group flex flex-col sm:flex-row overflow-hidden rounded-[14px] bg-white text-[#151515] min-w-0">
        <Link
          to={productPath}
          className="relative w-full sm:w-40 h-44 sm:h-auto flex-shrink-0 overflow-hidden bg-[#ececea]"
        >
          <img
            src={product.images[0]}
            alt={product.name}
            className="h-full min-h-[150px] w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
          />

          {hasDiscount && (
            <span className="absolute left-2 top-2 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[8px] font-black text-[var(--on-accent)]">
              -{discountPct}%
            </span>
          )}
        </Link>

        <div data-visual-part="body" className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--accent)]">
            {product.category}
          </p>

          <Link
            to={productPath}
            className="mt-2 text-[18px] font-extrabold leading-tight tracking-[-0.02em] hover:opacity-60 break-words"
          >
            {product.name}
          </Link>

          <p data-visual-part="description" className="mt-2 hidden sm:block text-[11px] leading-5 text-black/60">
            {product.description}
          </p>

          <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-4">
            <div>
              <p data-visual-part="price" className="text-[14px] font-black">
                {formatPrice(price)}
              </p>

              {hasDiscount && (
                <p className="mt-0.5 text-[10px] text-black/60 line-through">
                  {formatPrice(comparePrice!)}
                </p>
              )}
            </div>

            {inStock ? (
              <button data-visual-part="buyButton"
                type="button"
                onClick={handleAddToCart}
                disabled={!canBuySelectedVariant || atLimit}
                aria-label={`Agregar ${product.name} al carrito`}
                className="min-h-10 rounded-[8px] bg-[var(--primary)] px-4 py-2.5 text-[10px] font-bold text-[var(--on-primary)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {atLimit ? 'Maximo' : added ? 'Agregado' : 'Agregar'}
              </button>
            ) : (
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-black/60">
                Agotado
              </span>
            )}
          </div>

          {renderVariantSelector()}
          {selectedVariant && <StockFeedback sku={selectedVariant.sku} maxStock={selectedVariant.stock} quantity={quantity} />}
        </div>
      </article>
    );
  }

  /*
   * ==========================================================
   * PLANTILLA 3 — VISUAL / VELTA
   * ==========================================================
   */

  if (isVisual && layout === 'grid') {
    return (
      <article data-visual-section={VISUAL_SECTION.productCard} data-visual-card="grid" className="group flex h-full min-w-0 flex-col overflow-hidden rounded-[10px] bg-[#f1f1f0]">
        <Link
          to={productPath}
          aria-label={`Ver ${product.name}`}
          className="relative block aspect-[1.08/1] overflow-hidden bg-[#e8e8e6]"
        >
          <img
            src={product.images[0]}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025]"
          />

          {!inStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <span className="rounded-md bg-black px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                Sin stock
              </span>
            </div>
          )}
        </Link>

        <div data-visual-part="body" className="flex flex-1 min-w-0 flex-col px-4 pb-4 pt-4">
          <p className="mb-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#303030]">
            {product.category}
          </p>

          <h3 className="font-serif text-[20px] leading-[1.15] tracking-[-0.01em] text-[#111111] break-words">
            <Link to={productPath} className="transition-opacity hover:opacity-60">
              {product.name}
            </Link>
          </h3>

          <p data-visual-part="description" className="mt-2 line-clamp-2 min-h-[38px] text-[12px] leading-[1.45] text-[#77716f] break-words">
            {product.description}
          </p>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="min-w-0">
              <p data-visual-part="price" className="whitespace-nowrap text-[13px] font-semibold text-[#111111]">
                {formatPrice(price)}
              </p>

              {hasDiscount && (
                <p className="mt-0.5 whitespace-nowrap text-[9px] text-[#9b9693] line-through">
                  {formatPrice(comparePrice!)}
                </p>
              )}
            </div>

            {inStock ? (
              <button data-visual-part="buyButton"
                type="button"
                onClick={handleAddToCart}
                disabled={!canBuySelectedVariant || atLimit}
                aria-label={`Agregar ${product.name} al carrito`}
                className="inline-flex min-h-10 sm:min-h-9 h-10 sm:h-9 flex-shrink-0 items-center justify-center rounded-[7px] bg-[#111111] px-4 text-[11px] font-semibold text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {atLimit ? 'Maximo' : added ? 'Agregado' : 'Comprar'}
              </button>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8b8582]">
                Agotado
              </span>
            )}
          </div>

          {renderVariantSelector('visual')}
          {selectedVariant && <StockFeedback sku={selectedVariant.sku} maxStock={selectedVariant.stock} quantity={quantity} />}

          <span className="sr-only" role="status">
            {added ? `${product.name} agregado al carrito` : ''}
          </span>
        </div>
      </article>
    );
  }

  /*
   * ==========================================================
   * VISTA LISTA
   * ==========================================================
   */

  if (layout === 'list') {
    return (
      <article
        data-visual-section={VISUAL_SECTION.productCard} data-visual-card="list"
        className={`
          flex flex-col sm:flex-row gap-4
          bg-white
          border border-[var(--border)]
          p-3
          transition-all
          group
          min-w-0
          ${
            isMinimal
              ? 'rounded-[20px]'
              : 'rounded-xl'
          }
        `}
      >
        <Link
          to={productPath}
          className={`
            w-full sm:w-20 h-40 sm:h-20
            overflow-hidden
            bg-[var(--muted)]
            flex-shrink-0
            ${
              isMinimal
                ? 'rounded-2xl'
                : 'rounded-lg'
            }
          `}
        >
          <img
            src={product.images[0]}
            alt={product.name}
            className="
              w-full h-full
              object-cover
              group-hover:scale-105
              transition-transform
            "
          />
        </Link>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-[var(--muted-foreground)]">
            {product.category}
          </p>

          <h3 className="font-semibold text-sm text-[var(--foreground)] break-words sm:truncate">
            <Link to={productPath}>
              {product.name}
            </Link>
          </h3>

          <p data-visual-part="description" className="text-xs text-[var(--muted-foreground)] line-clamp-1 mt-0.5">
            {product.description}
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span data-visual-part="price" className="font-bold text-sm text-[var(--foreground)]">
              {formatPrice(price)}
            </span>

            {hasDiscount && (
              <span className="text-xs text-[var(--muted-foreground)] line-through">
                {formatPrice(comparePrice!)}
              </span>
            )}
          </div>

          {renderVariantSelector()}
          {selectedVariant && <StockFeedback sku={selectedVariant.sku} maxStock={selectedVariant.stock} quantity={quantity} />}

          {inStock && (
            <button data-visual-part="buyButton"
              type="button"
              onClick={handleAddToCart}
              disabled={!canBuySelectedVariant || atLimit}
              aria-label={`Agregar ${product.name} al carrito`}
              className="mt-3 min-h-10 sm:min-h-8 h-10 sm:h-8 w-full sm:w-auto rounded-lg bg-[var(--primary)] px-4 text-xs font-semibold text-[var(--on-primary)] transition-colors hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {atLimit ? 'Maximo disponible' : added ? 'Agregado' : 'Agregar al carrito'}
            </button>
          )}
        </div>

        {!inStock && (
          <Badge
            variant="default"
            className="self-start"
          >
            Sin stock
          </Badge>
        )}
      </article>
    );
  }

  /*
   * ==========================================================
   * VISTA COMPACTA
   * ==========================================================
   */

  if (layout === 'compact') {
    return (
      <Link
        to={productPath}
        className="
          flex flex-col
          bg-white
          border border-[var(--border)]
          rounded-lg
          overflow-hidden
          hover:shadow-md
          transition-shadow
          group
        "
      >
        <div className="aspect-square overflow-hidden bg-[var(--muted)]">
          <img
            src={product.images[0]}
            alt={product.name}
            className="
              w-full h-full
              object-cover
              group-hover:scale-105
              transition-transform
            "
          />
        </div>

        <div className="p-2">
          <p className="text-xs font-semibold text-[var(--foreground)] truncate">
            {product.name}
          </p>

          <p data-visual-part="price" className="text-xs font-bold text-[var(--primary)] mt-0.5">
            {formatPrice(price)}
          </p>
        </div>
      </Link>
    );
  }

  /*
   * ==========================================================
   * GRID — PLANTILLAS 1 Y 2
   * ==========================================================
   */

  return (
    <article
      data-visual-section={VISUAL_SECTION.productCard} data-visual-card="grid"
      className={`
        flex flex-col min-w-0
        bg-white
        border border-[var(--border)]
        overflow-hidden
        transition-all
        duration-200
        group
        ${
          isMinimal
            ? 'rounded-[20px] hover:-translate-y-1 hover:shadow-lg'
            : 'rounded-xl hover:shadow-md'
        }
      `}
    >
      <Link
        to={productPath}
        aria-label={`Ver ${product.name}`}
        className="
          block
          relative
          overflow-hidden
          bg-[var(--muted)]
          aspect-[4/3]
        "
      >
        <img
          src={product.images[0]}
          alt={product.name}
          className="
            w-full h-full
            object-cover
            group-hover:scale-105
            transition-transform
            duration-300
          "
        />

        {hasDiscount && (
          <div
            className={
              isMinimal
                ? 'absolute top-3 left-3'
                : 'absolute top-2 left-2'
            }
          >
            <Badge variant="accent">
              -{discountPct}%
            </Badge>
          </div>
        )}

        {!inStock && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <Badge
              variant="default"
              className="text-sm"
            >
              Sin stock
            </Badge>
          </div>
        )}

        {product.featured && inStock && (
          <div
            className={
              isMinimal
                ? 'absolute top-3 right-3'
                : 'absolute top-2 right-2'
            }
          >
            <Badge variant="info">
              Destacado
            </Badge>
          </div>
        )}
      </Link>

      <div
        data-visual-part="body"
        className={`
          flex flex-col flex-1 min-w-0
          ${
            isMinimal
              ? 'p-4 gap-2.5'
              : 'p-3 gap-2'
          }
        `}
      >
        <div>
          <p className="text-xs text-[var(--muted-foreground)]">
            {product.category}
          </p>

          <h3
            className={`
              font-semibold
              text-[var(--foreground)]
              line-clamp-2
              break-words
              mt-0.5
              ${
                isMinimal
                  ? 'text-[15px]'
                  : 'text-sm'
              }
            `}
          >
            <Link to={productPath}>
              {product.name}
            </Link>
          </h3>
        </div>

        <p data-visual-part="description" className="text-xs text-[var(--muted-foreground)] line-clamp-2 break-words">{product.description}</p>

        <div className="flex flex-wrap items-center gap-2 mt-auto">
          <span data-visual-part="price"
            className={`
              font-bold
              text-[var(--foreground)]
              ${
                isMinimal
                  ? 'text-base'
                  : ''
              }
            `}
          >
            {formatPrice(price)}
          </span>

          {hasDiscount && (
            <span className="text-xs text-[var(--muted-foreground)] line-through">
              {formatPrice(comparePrice!)}
            </span>
          )}
        </div>

        {renderVariantSelector()}
        {selectedVariant && <StockFeedback sku={selectedVariant.sku} maxStock={selectedVariant.stock} quantity={quantity} />}

        {inStock && (
          <button data-visual-part="buyButton"
            type="button"
            onClick={handleAddToCart}
            disabled={!canBuySelectedVariant || atLimit}
            aria-label={`Agregar ${product.name} al carrito`}
            className={`
              w-full
              font-semibold
              bg-[var(--primary)]
              text-[var(--on-primary)]
              hover:brightness-90
              transition-colors
              mt-1
              disabled:opacity-50
              disabled:cursor-not-allowed
              ${
                isMinimal
                  ? 'min-h-11 sm:min-h-10 h-11 sm:h-10 text-xs rounded-xl'
                  : 'min-h-10 sm:min-h-8 h-10 sm:h-8 text-xs rounded-lg'
              }
            `}
          >
            {atLimit
              ? 'Maximo disponible'
              : added
                ? 'Agregado'
                : 'Agregar al carrito'}
          </button>
        )}

        <span className="sr-only" role="status">
          {added
            ? `${product.name} agregado al carrito`
            : ''}
        </span>
      </div>
    </article>
  );
}