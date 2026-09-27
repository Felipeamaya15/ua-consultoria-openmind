import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Product, formatPrice } from '../../data/mockData';
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

  const hasDiscount = !!product.comparePrice;

  const discountPct = hasDiscount
    ? Math.round(
        (1 - product.basePrice / product.comparePrice!) * 100,
      )
    : 0;

  const inStock = product.variants.some(
    (variant) => variant.available && variant.stock > 0,
  );

  const defaultVariant = product.variants.find(
    (variant) => variant.available && variant.stock > 0,
  );

  const requiresVariantSelection =
    Object.keys(product.attributes).length > 0;

  const quantity =
    items.find(
      (item) =>
        item.productId === product.id &&
        item.variantId === defaultVariant?.id,
    )?.quantity ?? 0;

  const atLimit =
    !!defaultVariant && quantity >= defaultVariant.stock;

  const productPath = route(`producto/${product.id}`);

  const handleAddToCart = () => {
    if (requiresVariantSelection) {
      return;
    }

    if (!defaultVariant || !inStock || atLimit) {
      return;
    }

    addItem({
      productId: product.id,
      variantId: defaultVariant.id,
      name: product.name,
      image: product.images[0],
      price: defaultVariant.price,
      comparePrice: defaultVariant.comparePrice,
      quantity: 1,
      attributes: defaultVariant.attributes,
      sku: defaultVariant.sku,
      maxStock: defaultVariant.stock,
    });

    setAdded(true);
  };


  /*
   * ==========================================================
   * PLANTILLA 4 — CATALOG / DARK EDITORIAL
   * ==========================================================
   */

  if (isCatalog && layout === 'grid') {
    return (
      <article className="group flex h-full flex-col overflow-hidden rounded-[14px] bg-white text-[#151515]">
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
            <span className="absolute left-3 top-3 rounded-full bg-[#ff5a1f] px-3 py-1.5 text-[9px] font-black text-white">
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

        <div className="flex flex-1 flex-col p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#e04b1a]">
            {product.category}
          </p>

          <h3 className="mt-2 text-[17px] font-extrabold leading-tight tracking-[-0.02em]">
            <Link to={productPath} className="transition-opacity hover:opacity-60">
              {product.name}
            </Link>
          </h3>

          <p className="mt-2 line-clamp-2 min-h-[36px] text-[11px] leading-[1.55] text-black/50">
            {product.description}
          </p>

          <div className="mt-auto flex items-end justify-between gap-3 pt-5">
            <div>
              <p className="text-[14px] font-black">
                {formatPrice(product.basePrice)}
              </p>

              {hasDiscount && (
                <p className="mt-0.5 text-[10px] text-black/35 line-through">
                  {formatPrice(product.comparePrice!)}
                </p>
              )}
            </div>

            {!inStock && (
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-black/35">
                Agotado
              </span>
            )}
          </div>

          {inStock &&
            (requiresVariantSelection ? (
              <Link
                to={productPath}
                className="mt-4 flex h-10 w-full items-center justify-center rounded-[9px] bg-[#1683ff] text-[11px] font-bold text-white transition-colors hover:bg-[#3194f5]"
              >
                Elegir opciones
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={atLimit}
                aria-label={`Agregar ${product.name} al carrito`}
                className="mt-4 h-10 w-full rounded-[9px] bg-[#1683ff] text-[11px] font-bold text-white transition-colors hover:bg-[#3194f5] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {atLimit ? 'Máximo disponible' : added ? 'Agregado ✓' : 'Comprar'}
              </button>
            ))}

          <span className="sr-only" role="status">
            {added ? `${product.name} agregado al carrito` : ''}
          </span>
        </div>
      </article>
    );
  }

  if (isCatalog && layout === 'list') {
    return (
      <article className="group flex overflow-hidden rounded-[14px] bg-white text-[#151515]">
        <Link
          to={productPath}
          className="relative w-28 sm:w-40 flex-shrink-0 overflow-hidden bg-[#ececea]"
        >
          <img
            src={product.images[0]}
            alt={product.name}
            className="h-full min-h-[150px] w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
          />

          {hasDiscount && (
            <span className="absolute left-2 top-2 rounded-full bg-[#ff5a1f] px-2.5 py-1 text-[8px] font-black text-white">
              -{discountPct}%
            </span>
          )}
        </Link>

        <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#e04b1a]">
            {product.category}
          </p>

          <Link
            to={productPath}
            className="mt-2 text-[18px] font-extrabold leading-tight tracking-[-0.02em] hover:opacity-60"
          >
            {product.name}
          </Link>

          <p className="mt-2 hidden sm:block text-[11px] leading-5 text-black/50">
            {product.description}
          </p>

          <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-4">
            <div>
              <p className="text-[14px] font-black">
                {formatPrice(product.basePrice)}
              </p>

              {hasDiscount && (
                <p className="mt-0.5 text-[10px] text-black/35 line-through">
                  {formatPrice(product.comparePrice!)}
                </p>
              )}
            </div>

            {inStock ? (
              <Link
                to={productPath}
                className="rounded-[8px] bg-[#1683ff] px-4 py-2.5 text-[10px] font-bold text-white hover:bg-[#3194f5]"
              >
                Ver producto
              </Link>
            ) : (
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-black/35">
                Agotado
              </span>
            )}
          </div>
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
      <article className="group flex h-full flex-col overflow-hidden rounded-[10px] bg-[#f1f1f0]">
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

        <div className="flex flex-1 flex-col px-4 pb-4 pt-4">
          <p className="mb-2 text-[9px] font-medium uppercase tracking-[0.16em] text-[#303030]">
            {product.category}
          </p>

          <h3 className="font-serif text-[20px] leading-[1.15] tracking-[-0.01em] text-[#111111]">
            <Link to={productPath} className="transition-opacity hover:opacity-60">
              {product.name}
            </Link>
          </h3>

          <p className="mt-2 line-clamp-2 min-h-[38px] text-[12px] leading-[1.45] text-[#77716f]">
            {product.description}
          </p>

          <div className="mt-auto flex items-center justify-between gap-3 pt-4">
            <div className="min-w-0">
              <p className="whitespace-nowrap text-[13px] font-semibold text-[#111111]">
                {formatPrice(product.basePrice)}
              </p>

              {hasDiscount && (
                <p className="mt-0.5 whitespace-nowrap text-[9px] text-[#9b9693] line-through">
                  {formatPrice(product.comparePrice!)}
                </p>
              )}
            </div>

            {inStock ? (
              requiresVariantSelection ? (
                <Link
                  to={productPath}
                  className="inline-flex h-9 flex-shrink-0 items-center justify-center rounded-[7px] bg-[#111111] px-4 text-[11px] font-semibold text-white transition-opacity hover:opacity-80"
                >
                  Comprar
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={atLimit}
                  aria-label={`Agregar ${product.name} al carrito`}
                  className="inline-flex h-9 flex-shrink-0 items-center justify-center rounded-[7px] bg-[#111111] px-4 text-[11px] font-semibold text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {atLimit ? 'Máximo' : added ? 'Agregado ✓' : 'Comprar'}
                </button>
              )
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8b8582]">
                Agotado
              </span>
            )}
          </div>

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
      <Link
        to={productPath}
        className={`
          flex gap-4
          bg-white
          border border-[var(--border)]
          p-3
          transition-all
          group
          ${
            isMinimal
              ? 'rounded-[20px] hover:shadow-sm'
              : 'rounded-xl hover:shadow-md'
          }
        `}
      >
        <div
          className={`
            w-20 h-20
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
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-[var(--muted-foreground)]">
            {product.category}
          </p>

          <h3 className="font-semibold text-sm text-[var(--foreground)] truncate">
            {product.name}
          </h3>

          <p className="text-xs text-[var(--muted-foreground)] line-clamp-1 mt-0.5">
            {product.description}
          </p>

          <div className="flex items-center gap-2 mt-1.5">
            <span className="font-bold text-sm text-[var(--foreground)]">
              {formatPrice(product.basePrice)}
            </span>

            {hasDiscount && (
              <span className="text-xs text-[var(--muted-foreground)] line-through">
                {formatPrice(product.comparePrice!)}
              </span>
            )}
          </div>
        </div>

        {!inStock && (
          <Badge
            variant="default"
            className="self-start"
          >
            Sin stock
          </Badge>
        )}
      </Link>
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

          <p className="text-xs font-bold text-[var(--primary)] mt-0.5">
            {formatPrice(product.basePrice)}
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
      className={`
        flex flex-col
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
        className={`
          flex flex-col flex-1
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

        <div className="flex items-center gap-2 mt-auto">
          <span
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
            {formatPrice(product.basePrice)}
          </span>

          {hasDiscount && (
            <span className="text-xs text-[var(--muted-foreground)] line-through">
              {formatPrice(product.comparePrice!)}
            </span>
          )}
        </div>

        {inStock &&
          (requiresVariantSelection ? (
            <Link
              to={productPath}
              className={`
                w-full
                font-semibold
                bg-[var(--primary)]
                text-white
                hover:bg-[#0f2a56]
                transition-colors
                mt-1
                flex
                items-center
                justify-center
                ${
                  isMinimal
                    ? 'h-10 text-xs rounded-xl'
                    : 'h-8 text-xs rounded-lg'
                }
              `}
            >
              Elegir opciones
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={atLimit}
              aria-label={`Agregar ${product.name} al carrito`}
              className={`
                w-full
                font-semibold
                bg-[var(--primary)]
                text-white
                hover:bg-[#0f2a56]
                transition-colors
                mt-1
                disabled:opacity-50
                disabled:cursor-not-allowed
                ${
                  isMinimal
                    ? 'h-10 text-xs rounded-xl'
                    : 'h-8 text-xs rounded-lg'
                }
              `}
            >
              {atLimit
                ? 'Máximo disponible'
                : added
                  ? 'Agregado ✓'
                  : 'Agregar al carrito'}
            </button>
          ))}

        <span className="sr-only" role="status">
          {added
            ? `${product.name} agregado al carrito`
            : ''}
        </span>
      </div>
    </article>
  );
}