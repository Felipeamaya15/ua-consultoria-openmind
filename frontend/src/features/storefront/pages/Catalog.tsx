import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ProductCard } from '../components/store/ProductCard';
import { Pagination, EmptyState, Icon } from '../components/ui';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';
import type { Product } from '../data/mockData';
import { fetchPublicProducts } from '../services/catalogService';
import { useAttributeFilters } from '../hooks/useAttributeFilters';
import { AttributeFilters, AppliedAttributeFilters } from '../components/store/AttributeFilters';

const SORT_OPTIONS = [
  {
    value: 'featured',
    label: 'Destacados',
  },
  {
    value: 'price-asc',
    label: 'Precio: menor a mayor',
  },
  {
    value: 'price-desc',
    label: 'Precio: mayor a menor',
  },
  {
    value: 'name',
    label: 'Nombre A-Z',
  },
];

export default function Catalog() {
  const { isMinimal, isVisual, isCatalog } = useStorefrontTemplate();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchPublicProducts({ includeVariants: true })
      .then((data) => {
        if (!cancelled) {
          setProducts(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const unique = Array.from(
      new Set(products.map((product) => product.category)),
    );

    return ['Todos', ...unique];
  }, [products]);

  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState(
    params.get('q') ?? '',
  );

  const category = params.get('cat') ?? 'Todos';

  const setCategory = (cat: string) => {
    const nextParams = new URLSearchParams(params);

    if (cat === 'Todos') {
      nextParams.delete('cat');
    } else {
      nextParams.set('cat', cat);
    }

    setParams(nextParams);
  };

  const [availability, setAvailability] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('featured');
  const [page, setPage] = useState(1);

  const attrFilters = useAttributeFilters(products, category);

  const activeFiltersCount =
    attrFilters.count +
    availability.length +
    (minPrice !== '' ? 1 : 0) +
    (maxPrice !== '' ? 1 : 0) +
    (category !== 'Todos' ? 1 : 0);

  const appliedFilters = (
    <AppliedAttributeFilters
      selected={attrFilters.selected}
      onRemove={(name, value) => {
        attrFilters.toggle(name, value);
        setPage(1);
      }}
      onClearAll={() => {
        attrFilters.clear();
        setPage(1);
      }}
    />
  );

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const PAGE_SIZE = 12;

  const filtered = useMemo(() => {
    let list = products.filter(
      (product) => product.status === 'active',
    );

    if (availability.length === 1) {
      list = list.filter(
        (product) =>
          product.variants.some(
            (variant) =>
              variant.available &&
              variant.stock > 0,
          ) ===
          (availability[0] === 'En stock'),
      );
    }

    if (minPrice !== '') {
      list = list.filter(
        (product) =>
          product.basePrice >= Number(minPrice),
      );
    }

    if (maxPrice !== '') {
      list = list.filter(
        (product) =>
          product.basePrice <= Number(maxPrice),
      );
    }

    if (search) {
      const normalizedSearch = search.toLowerCase();

      list = list.filter(
        (product) =>
          product.name
            .toLowerCase()
            .includes(normalizedSearch) ||
          product.category
            .toLowerCase()
            .includes(normalizedSearch),
      );
    }

    if (category !== 'Todos') {
      list = list.filter(
        (product) => product.category === category,
      );
    }

    list = list.filter(attrFilters.matches);

    switch (sort) {
      case 'price-asc':
        list.sort(
          (a, b) => a.basePrice - b.basePrice,
        );
        break;

      case 'price-desc':
        list.sort(
          (a, b) => b.basePrice - a.basePrice,
        );
        break;

      case 'name':
        list.sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        break;

      default:
        list.sort(
          (a, b) =>
            (b.featured ? 1 : 0) -
            (a.featured ? 1 : 0),
        );
    }

    return list;
  }, [
    products,
    search,
    category,
    sort,
    availability,
    minPrice,
    maxPrice,
    attrFilters.matches,
  ]);

  const paginated = filtered.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const clearFilters = () => {
    setSearch('');

    const nextParams = new URLSearchParams(params);
    nextParams.delete('cat');
    nextParams.delete('q');
    setParams(nextParams);

    setAvailability([]);
    setMinPrice('');
    setMaxPrice('');
    attrFilters.clear();
    setPage(1);
  };


  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-sm text-[var(--muted-foreground)]">
        Cargando catálogo...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">
          No pudimos cargar el catálogo. Intenta recargar la página.
        </p>
      </div>
    );
  }

  /*
   * ==========================================================
   * PLANTILLA 4 — CATALOG / DARK EDITORIAL
   * ==========================================================
   */

  if (isCatalog) {
    return (
      <div className="bg-[#050505] text-white">
        <section className="max-w-[1160px] mx-auto px-5 pt-10 md:pt-14 pb-20 md:pb-28">
          {/* CABECERA */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-7 mb-9">
            <div>
              <p className="text-[#ff5a1f] text-[10px] font-extrabold uppercase tracking-[0.16em] mb-3">
                Explora la colección
              </p>

              <h1 className="text-[44px] sm:text-[56px] md:text-[64px] leading-[0.94] tracking-[-0.05em] font-black">
                Catálogo.
              </h1>

              <p className="mt-4 text-[13px] text-white/45">
                {filtered.length}{' '}
                {filtered.length === 1 ? 'producto disponible' : 'productos disponibles'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:flex-none">
                <Icon
                  name="search"
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35 pointer-events-none"
                />

                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  aria-label="Buscar productos"
                  placeholder="Buscar productos..."
                  className="h-11 w-full sm:w-[230px] rounded-[10px] bg-white pl-11 pr-4 text-[12px] text-[#151515] placeholder:text-black/35 outline-none ring-1 ring-transparent focus:ring-[#1683ff]"
                />
              </div>

              <select
                aria-label="Ordenar productos"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="h-11 rounded-[10px] bg-white px-4 text-[12px] font-medium text-[#151515] outline-none"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <div className="flex h-11 overflow-hidden rounded-[10px] bg-[#202022] ring-1 ring-white/10">
                {(['grid', 'list'] as const).map((view) => (
                  <button
                    type="button"
                    key={view}
                    onClick={() => setViewMode(view)}
                    aria-label={view === 'grid' ? 'Vista en grilla' : 'Vista en lista'}
                    className={`w-11 flex items-center justify-center transition-colors ${
                      viewMode === view
                        ? 'bg-[#1683ff] text-white'
                        : 'text-white/45 hover:text-white'
                    }`}
                  >
                    <Icon
                      name={view === 'grid' ? 'grid' : 'list'}
                      className="w-3.5 h-3.5"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="md:hidden mb-5 h-10 rounded-full border border-white/15 px-5 text-[11px] font-semibold text-white"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            Filtros{activeFiltersCount > 0 && ` (${activeFiltersCount})`} {filtersOpen ? '−' : '+'}
          </button>

          <div className="grid grid-cols-12 gap-5 md:gap-7 items-start">
            {/* FILTROS */}
            <aside
              className={`col-span-12 md:col-span-3 ${
                filtersOpen ? 'block' : 'hidden'
              } md:block`}
            >
              <div className="sticky top-28 max-h-[calc(100vh-8rem)] flex flex-col rounded-[16px] bg-[#f5f5f3] text-[#151515]">
                <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-black/10">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/45">
                    Filtros
                  </p>

                  {activeFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-[11px] font-semibold text-[#1683ff] hover:opacity-70"
                    >
                      Limpiar ({activeFiltersCount})
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  <p className="mb-4 text-[10px] font-black uppercase tracking-[0.16em] text-black/45">
                    Categorías
                  </p>

                  <div className="flex flex-col gap-1">
                    {categories.map((cat) => (
                      <button
                        type="button"
                        key={cat}
                        onClick={() => {
                          setCategory(cat);
                          setPage(1);
                        }}
                        className={`rounded-[9px] px-3 py-2.5 text-left text-[12px] font-medium transition-colors ${
                          category === cat
                            ? 'bg-[#1683ff] text-white'
                            : 'text-[#202020] hover:bg-black/[0.05]'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-black/10 mt-5 pt-5">
                    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-black/45">
                      Disponibilidad
                    </p>

                    {['En stock', 'Sin stock'].map((option) => (
                      <label
                        key={option}
                        className="flex items-center gap-2.5 py-1.5 text-[12px] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={availability.includes(option)}
                          onChange={(event) => {
                            setAvailability((previous) =>
                              event.target.checked
                                ? [...previous, option]
                                : previous.filter((value) => value !== option),
                            );
                            setPage(1);
                          }}
                          className="accent-[#1683ff]"
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>

                  <div className="border-t border-black/10 mt-5 pt-5">
                    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-black/45">
                      Precio
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min="0"
                        aria-label="Precio mínimo"
                        value={minPrice}
                        onChange={(event) => {
                          setMinPrice(event.target.value);
                          setPage(1);
                        }}
                        placeholder="Mín."
                        className="h-10 min-w-0 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] outline-none focus:border-[#1683ff]"
                      />

                      <input
                        type="number"
                        min="0"
                        aria-label="Precio máximo"
                        value={maxPrice}
                        onChange={(event) => {
                          setMaxPrice(event.target.value);
                          setPage(1);
                        }}
                        placeholder="Máx."
                        className="h-10 min-w-0 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] outline-none focus:border-[#1683ff]"
                      />
                    </div>
                  </div>

                  <AttributeFilters
                    groups={attrFilters.groups}
                    selected={attrFilters.selected}
                    onToggle={(name, value) => {
                      attrFilters.toggle(name, value);
                      setPage(1);
                    }}
                  />
                </div>
              </div>
            </aside>

            {/* PRODUCTOS */}
            <main className="col-span-12 md:col-span-9">
              {appliedFilters}

              {paginated.length === 0 ? (
                <div className="rounded-[18px] border border-white/10 bg-[#111113] px-6 py-20 text-center">
                  <Icon name="search" className="w-10 h-10 mx-auto text-white/25" />
                  <h2 className="mt-5 text-xl font-bold">Sin resultados</h2>
                  <p className="mt-2 text-sm text-white/45">
                    No encontramos productos para tu búsqueda.
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className={
                      viewMode === 'grid'
                        ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
                        : 'flex flex-col gap-3'
                    }
                  >
                    {paginated.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        layout={viewMode === 'list' ? 'list' : 'grid'}
                      />
                    ))}
                  </div>

                  {filtered.length > PAGE_SIZE && (
                    <div className="flex justify-center mt-10">
                      <Pagination
                        page={page}
                        total={filtered.length}
                        pageSize={PAGE_SIZE}
                        onChange={setPage}
                      />
                    </div>
                  )}
                </>
              )}
            </main>
          </div>
        </section>
      </div>
    );
  }

  /*
   * ==========================================================
   * PLANTILLA 3 — VISUAL / VELTA
   * ==========================================================
   */

  if (isVisual) {
    return (
      <div className="bg-white text-[#111111]">
        <section className="max-w-[1180px] mx-auto px-5 md:px-8 pt-8 md:pt-10 pb-20">
          <div className="mb-8 md:mb-10">
            <h1 className="font-serif text-[42px] sm:text-[48px] md:text-[52px] leading-none tracking-[-0.025em] text-[#111111]">
              Nuestra colección
            </h1>
          </div>

          {/* FILTROS */}
          <div className="mb-6 border-b border-black/10 pb-6">
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(!filtersOpen)}
                className="inline-flex items-center gap-2 rounded-full border border-black/15 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors hover:border-black"
              >
                Filtros{activeFiltersCount > 0 && ` (${activeFiltersCount})`}{' '}
                <span aria-hidden="true">{filtersOpen ? '−' : '+'}</span>
              </button>

              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[11px] font-semibold underline underline-offset-4 hover:opacity-60"
                >
                  Limpiar filtros ({activeFiltersCount})
                </button>
              )}
            </div>

            {filtersOpen && (
              <div className="mt-6">
                {attrFilters.groups.length === 0 ? (
                  <p className="text-[13px] text-[#8c8683]">
                    No hay filtros disponibles.
                  </p>
                ) : (
                  <div className="max-h-[280px] overflow-y-auto pr-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-6 content-start">
                    <AttributeFilters
                      groups={attrFilters.groups}
                      selected={attrFilters.selected}
                      onToggle={(name, value) => {
                        attrFilters.toggle(name, value);
                        setPage(1);
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {appliedFilters}

          {paginated.length === 0 ? (
            <EmptyState
              icon={<Icon name="search" className="w-12 h-12" />}
              title="Sin resultados"
              description="No se encontraron productos para tu búsqueda."
            />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
                {paginated.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    layout="grid"
                  />
                ))}
              </div>

              {filtered.length > PAGE_SIZE && (
                <div className="flex justify-center mt-12">
                  <Pagination
                    page={page}
                    total={filtered.length}
                    pageSize={PAGE_SIZE}
                    onChange={setPage}
                  />
                </div>
              )}
            </>
          )}
        </section>
      </div>
    );
  }

  /*
   * ==========================================================
   * PLANTILLAS 1 Y 2
   * ==========================================================
   */

  return (
    <div
      className={
        isMinimal
          ? 'max-w-6xl mx-auto px-4 md:px-8 pt-12 pb-8'
          : 'max-w-7xl mx-auto px-4 py-8'
      }
    >
      {/* CABECERA */}

      <div
        className={`
          flex flex-col
          sm:flex-row
          sm:items-end
          justify-between
          gap-5
          ${isMinimal ? 'mb-8' : 'mb-6'}
        `}
      >
        <div>
          {isMinimal && (
            <p className="text-xs text-gray-400 mb-2">
              Explora nuestra selección
            </p>
          )}

          <h1
            className={
              isMinimal
                ? 'text-3xl md:text-4xl font-semibold tracking-tight text-[#171717]'
                : 'text-2xl font-semibold font-display text-[var(--foreground)]'
            }
          >
            {category !== 'Todos'
              ? category
              : 'Catálogo'}
          </h1>

          <p
            className={`
              text-sm
              text-[var(--muted-foreground)]
              ${isMinimal ? 'mt-2' : 'mt-0.5'}
            `}
          >
            {filtered.length}{' '}
            {filtered.length === 1
              ? 'producto'
              : 'productos'}
          </p>
        </div>

        {/* Herramientas */}

        <div className="flex flex-wrap items-center gap-2">

          {/* Buscar */}

          <div className="relative">
            <Icon
              name="search"
              className="
                absolute
                left-3
                top-1/2
                -translate-y-1/2
                w-4
                h-4
                text-gray-400
                pointer-events-none
              "
            />

            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              aria-label="Buscar productos"
              placeholder="Buscar..."
              className={`
                border
                border-[var(--border)]
                bg-white
                focus:outline-none
                focus:ring-1
                focus:ring-[var(--primary)]
                transition-all
                ${
                  isMinimal
                    ? 'h-10 text-sm rounded-xl pl-9 pr-3 w-44 md:w-52'
                    : 'h-8 text-sm rounded-lg pl-9 pr-3 w-40 focus:w-52'
                }
              `}
            />
          </div>

          {/* Orden */}

          <select
            aria-label="Ordenar productos"
            value={sort}
            onChange={(event) =>
              setSort(event.target.value)
            }
            className={`
              border
              border-[var(--border)]
              bg-white
              focus:outline-none
              ${
                isMinimal
                  ? 'h-10 text-xs rounded-xl px-3'
                  : 'h-8 text-xs rounded-lg px-2'
              }
            `}
          >
            {SORT_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>

          {/* Grid / lista */}

          <div
            className={`
              flex
              border
              border-[var(--border)]
              overflow-hidden
              bg-white
              ${
                isMinimal
                  ? 'rounded-xl h-10'
                  : 'rounded-lg'
              }
            `}
          >
            {(['grid', 'list'] as const).map(
              (view) => (
                <button
                  type="button"
                  key={view}
                  onClick={() =>
                    setViewMode(view)
                  }
                  aria-label={
                    view === 'grid'
                      ? 'Vista en grilla'
                      : 'Vista en lista'
                  }
                  className={`
                    flex
                    items-center
                    justify-center
                    transition-colors
                    ${
                      isMinimal
                        ? 'w-10'
                        : 'px-2 py-1.5'
                    }
                    ${
                      viewMode === view
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-white text-[var(--muted-foreground)] hover:bg-[var(--muted)]'
                    }
                  `}
                >
                  <Icon
                    name={
                      view === 'grid'
                        ? 'grid'
                        : 'list'
                    }
                    className="w-3.5 h-3.5"
                  />
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Filtros móvil */}

      <button
        type="button"
        className={`
          md:hidden
          mb-4
          text-sm
          ${
            isMinimal
              ? 'bg-white border border-[var(--border)] rounded-full px-4 py-2'
              : ''
          }
        `}
        aria-expanded={filtersOpen}
        onClick={() =>
          setFiltersOpen(!filtersOpen)
        }
      >
        Filtros{activeFiltersCount > 0 && ` (${activeFiltersCount})`} {filtersOpen ? '−' : '+'}
      </button>

      {/* CONTENIDO */}

      <div
        className={`
          grid
          grid-cols-12
          ${isMinimal ? 'gap-5 md:gap-7' : 'gap-6'}
        `}
      >
        {/* FILTROS */}

        <aside
          className={`
            col-span-12
            md:col-span-3
            ${filtersOpen ? 'block' : 'hidden'}
            md:block
          `}
        >
          <div
            className={`
              bg-white
              border
              border-[var(--border)]
              sticky
              flex
              flex-col
              ${
                isMinimal
                  ? 'rounded-[20px] top-24 max-h-[calc(100vh-7rem)]'
                  : 'rounded-xl top-20 max-h-[calc(100vh-6rem)]'
              }
            `}
          >
            {/* Encabezado fijo con Limpiar filtros */}

            <div
              className={`
                flex items-center justify-between gap-3
                border-b border-[var(--border)]
                ${isMinimal ? 'px-4 py-3' : 'px-4 py-3'}
              `}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                Filtros
              </p>

              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-semibold text-[var(--primary)] hover:underline"
                >
                  Limpiar ({activeFiltersCount})
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {/* Categorías */}

              <p
                className={`
                  text-xs
                  font-semibold
                  uppercase
                  tracking-wider
                  text-[var(--muted-foreground)]
                  mb-3
                  ${isMinimal ? 'px-1' : ''}
                `}
              >
                Categorías
              </p>

              <div className="flex flex-col gap-1">
                {categories.map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => {
                      setCategory(cat);
                      setPage(1);
                    }}
                    className={`
                      text-left
                      text-sm
                      px-3
                      py-2
                      transition-colors
                      ${
                        isMinimal
                          ? 'rounded-xl'
                          : 'rounded-lg'
                      }
                      ${
                        category === cat
                          ? 'bg-[var(--primary)] text-white'
                          : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                      }
                    `}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Disponibilidad */}

              <div className="border-t border-[var(--border)] mt-4 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-3">
                  Disponibilidad
                </p>

                {['En stock', 'Sin stock'].map(
                  (option) => (
                    <label
                      key={option}
                      className="flex items-center gap-2 text-sm py-1 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={availability.includes(
                          option,
                        )}
                        onChange={(event) => {
                          setAvailability(
                            (previous) =>
                              event.target.checked
                                ? [
                                    ...previous,
                                    option,
                                  ]
                                : previous.filter(
                                    (value) =>
                                      value !== option,
                                  ),
                          );

                          setPage(1);
                        }}
                        className="rounded border-[var(--border)]"
                      />

                      <span>{option}</span>
                    </label>
                  ),
                )}
              </div>

              {/* Precio */}

              <div className="border-t border-[var(--border)] mt-4 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-3">
                  Precio
                </p>

                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    aria-label="Precio mínimo"
                    value={minPrice}
                    onChange={(event) => {
                      setMinPrice(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Min"
                    className={`
                      w-full
                      text-xs
                      border
                      border-[var(--border)]
                      px-2
                      focus:outline-none
                      ${
                        isMinimal
                          ? 'h-9 rounded-lg'
                          : 'h-7 rounded'
                      }
                    `}
                  />

                  <input
                    type="number"
                    min="0"
                    aria-label="Precio máximo"
                    value={maxPrice}
                    onChange={(event) => {
                      setMaxPrice(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Max"
                    className={`
                      w-full
                      text-xs
                      border
                      border-[var(--border)]
                      px-2
                      focus:outline-none
                      ${
                        isMinimal
                          ? 'h-9 rounded-lg'
                          : 'h-7 rounded'
                      }
                    `}
                  />
                </div>
              </div>

              <AttributeFilters
                groups={attrFilters.groups}
                selected={attrFilters.selected}
                onToggle={(name, value) => {
                  attrFilters.toggle(name, value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </aside>

        {/* PRODUCTOS */}

        <main className="col-span-12 md:col-span-3 lg:col-span-9">
          {appliedFilters}

          {paginated.length === 0 ? (
            <EmptyState
              icon={<Icon name="search" className="w-12 h-12 text-gray-400" />}
              title="Sin resultados"
              description="No encontramos productos para tu búsqueda."
            />
          ) : (
            <>
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'
                    : 'flex flex-col gap-4'
                }
              >
                {paginated.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    layout={viewMode === 'list' ? 'list' : 'grid'}
                  />
                ))}
              </div>

              {filtered.length > PAGE_SIZE && (
                <div className="flex justify-center mt-8">
                  <Pagination
                    page={page}
                    total={filtered.length}
                    pageSize={PAGE_SIZE}
                    onChange={setPage}
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
