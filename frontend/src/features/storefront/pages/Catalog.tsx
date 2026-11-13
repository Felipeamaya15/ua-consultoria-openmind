import { VISUAL_SECTION } from '../visual/sectionIds';
import { ErrorState, LoadingState } from '../../../shared/components/states';
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
  const [attempt, setAttempt] = useState(0);

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
  }, [attempt]);

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
      <LoadingState spacing="none" className="max-w-7xl mx-auto px-4 py-20">Cargando catálogo...</LoadingState>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20">
        <ErrorState onRetry={() => { setLoadError(false); setLoading(true); setAttempt(n => n + 1); }}>
          No pudimos cargar el catálogo. Intenta nuevamente.
        </ErrorState>
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
      <div data-catalog-page="catalog" data-visual-section={VISUAL_SECTION.catalog} data-visual-catalog className="bg-[var(--visual-background)] text-[var(--visual-text)] min-w-0">
        <section className="max-w-[1160px] mx-auto px-4 sm:px-5 pt-8 sm:pt-10 md:pt-14 pb-16 sm:pb-20 md:pb-28">
          {/* CABECERA */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 sm:gap-7 mb-7 sm:mb-9">
            <div className="min-w-0">
              <p className="text-[var(--accent)] text-[10px] font-extrabold uppercase tracking-[0.16em] mb-3">
                Explora la colección
              </p>

              <h1 className="text-[36px] sm:text-[56px] md:text-[64px] leading-[0.94] tracking-[-0.05em] font-black break-words">
                Catálogo.
              </h1>

              <p className="mt-3 sm:mt-4 text-[13px] text-[var(--visual-muted)]">
                {filtered.length}{' '}
                {filtered.length === 1 ? 'producto disponible' : 'productos disponibles'}
              </p>
            </div>

            <div data-catalog-toolbar className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <div data-catalog-search className="relative w-full sm:w-auto sm:flex-none">
                <Icon
                  name="search"
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/60 pointer-events-none"
                />

                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  aria-label="Buscar productos"
                  placeholder="Buscar productos..."
                  className="h-11 w-full sm:w-[230px] rounded-[10px] bg-white pl-11 pr-4 text-[12px] text-[#151515] placeholder:text-black/60 outline-none ring-1 ring-transparent focus:ring-[var(--primary)]"
                />
              </div>

              <select
                aria-label="Ordenar productos"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="h-11 flex-1 sm:flex-initial min-w-0 rounded-[10px] bg-white px-4 text-[12px] font-medium text-[#151515] outline-none"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <div className="flex h-11 shrink-0 overflow-hidden rounded-[10px] bg-[var(--visual-surface)] ring-1 ring-[var(--visual-border)]">
                {(['grid', 'list'] as const).map((view) => (
                  <button
                    type="button"
                    key={view}
                    onClick={() => setViewMode(view)}
                    aria-label={view === 'grid' ? 'Vista en grilla' : 'Vista en lista'}
                    className={`w-11 flex items-center justify-center transition-colors ${
                      viewMode === view
                        ? 'bg-[var(--primary)] text-[var(--on-primary)]'
                        : 'text-[var(--visual-muted)] hover:text-[var(--visual-text)]'
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
            className="md:hidden mb-5 min-h-11 w-full sm:w-auto justify-center items-center rounded-full border border-[var(--visual-border)] px-5 text-[12px] font-semibold text-[var(--visual-text)]"
            data-visual-part="catalogFiltersToggle" aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            Filtros{activeFiltersCount > 0 && ` (${activeFiltersCount})`} {filtersOpen ? '−' : '+'}
          </button>

          <div data-visual-part="catalogLayout" className="grid grid-cols-12 gap-5 md:gap-7 items-start">
            {/* FILTROS */}
            <aside data-visual-part="catalogFilters" data-visual-open={filtersOpen}
              className={`col-span-12 md:col-span-3 min-w-0 ${
                filtersOpen ? 'block' : 'hidden'
              } md:block`}
            >
              <div className="md:sticky md:top-28 md:max-h-[calc(100vh-8rem)] flex flex-col rounded-[16px] bg-[#f5f5f3] text-[#151515]">
                <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-black/10">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/60">
                    Filtros
                  </p>

                  {activeFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-[11px] font-semibold text-[var(--primary)] hover:opacity-70"
                    >
                      Limpiar ({activeFiltersCount})
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  <p className="mb-4 text-[10px] font-black uppercase tracking-[0.16em] text-black/60">
                    Categorías
                  </p>

                  <div data-visual-section={VISUAL_SECTION.categories} data-visual-part="categoryList" className="flex flex-col gap-1">
                    {categories.map((cat) => (
                      <button data-visual-part="categoryItem" aria-pressed={category === cat}
                        type="button"
                        key={cat}
                        onClick={() => {
                          setCategory(cat);
                          setPage(1);
                        }}
                        className={`rounded-[9px] px-3 py-2.5 text-left text-[12px] font-medium transition-colors ${
                          category === cat
                            ? 'bg-[var(--primary)] text-[var(--on-primary)]'
                            : 'text-[#202020] hover:bg-black/[0.05]'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-black/10 mt-5 pt-5">
                    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-black/60">
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
                          className="accent-[var(--primary)]"
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>

                  <div className="border-t border-black/10 mt-5 pt-5">
                    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-black/60">
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
                        className="h-10 min-w-0 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] outline-none focus:border-[var(--primary)]"
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
                        className="h-10 min-w-0 rounded-[8px] border border-black/10 bg-white px-3 text-[11px] outline-none focus:border-[var(--primary)]"
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
            <main data-visual-part="catalogResults" className="col-span-12 md:col-span-9 min-w-0">
              {appliedFilters}

              {paginated.length === 0 ? (
                <div className="rounded-[18px] border border-[var(--visual-border)] bg-[var(--visual-surface)] px-6 py-20 text-center">
                  <Icon name="search" className="w-10 h-10 mx-auto text-[var(--visual-muted)]" />
                  <h2 className="mt-5 text-xl font-bold">Sin resultados</h2>
                  <p className="mt-2 text-sm text-[var(--visual-muted)]">
                    No encontramos productos para tu búsqueda.
                  </p>
                </div>
              ) : (
                <>
                  <div
                    data-visual-section={VISUAL_SECTION.productGrid} data-visual-grid={viewMode === 'grid' ? 'catalog' : undefined}
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
      <div data-catalog-page="visual" data-visual-section={VISUAL_SECTION.catalog} data-visual-catalog className="bg-white text-[#111111] min-w-0">
        <section className="max-w-[1180px] mx-auto px-4 sm:px-5 md:px-8 pt-8 md:pt-10 pb-16 sm:pb-20">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 sm:gap-6 mb-6 md:mb-8">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-black/55 mb-2">
                Catálogo completo
              </p>

              <h1 className="font-serif text-[34px] sm:text-[48px] md:text-[52px] leading-none tracking-[-0.025em] text-[#111111] break-words">
                {category !== 'Todos' ? category : 'Nuestra colección'}
              </h1>

              <p className="mt-2.5 text-xs text-black/60">
                {filtered.length}{' '}
                {filtered.length === 1 ? 'producto disponible' : 'productos disponibles'}
              </p>
            </div>

            <div data-catalog-toolbar className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <div data-catalog-search className="relative w-full sm:w-auto">
                <Icon
                  name="search"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
                />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  aria-label="Buscar productos"
                  placeholder="Buscar..."
                  className="h-11 w-full sm:w-52 border border-black/15 px-3 pl-10 text-xs text-[#111111] bg-white outline-none focus:border-black"
                />
              </div>

              <select
                aria-label="Ordenar productos"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="h-11 flex-1 sm:flex-initial min-w-0 border border-black/15 px-3 text-xs text-[#111111] bg-white outline-none focus:border-black"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <div className="flex h-11 shrink-0 overflow-hidden border border-black/15 bg-white">
                {(['grid', 'list'] as const).map((view) => (
                  <button
                    type="button"
                    key={view}
                    onClick={() => setViewMode(view)}
                    aria-label={view === 'grid' ? 'Vista en grilla' : 'Vista en lista'}
                    className={`w-11 flex items-center justify-center transition-colors ${
                      viewMode === view
                        ? 'bg-[var(--primary)] text-[var(--on-primary)]'
                        : 'bg-white text-black/60 hover:bg-black/5'
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

          <div className="md:hidden mb-3 flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                aria-pressed={category === cat}
                onClick={() => {
                  setCategory(cat);
                  setPage(1);
                }}
                className={`min-h-9 px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                  category === cat
                    ? 'bg-[var(--primary)] text-[var(--on-primary)] border-[var(--primary)]'
                    : 'bg-[#f6f5f2] text-[#171717] border-black/10'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <button
            type="button"
            data-visual-part="catalogFiltersToggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="md:hidden mb-5 min-h-11 w-full sm:w-auto flex justify-center items-center gap-2 border border-black/20 bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#111111]"
          >
            <span>Filtros{activeFiltersCount > 0 && ` (${activeFiltersCount})`}</span>
            <span aria-hidden="true">{filtersOpen ? '−' : '+'}</span>
          </button>

          {/* FILTROS */}
          <div data-visual-part="catalogLayout" className="grid grid-cols-12 gap-5 md:gap-7 items-start">
            <aside
              data-visual-part="catalogFilters"
              data-visual-open={filtersOpen}
              className={`col-span-12 md:col-span-3 min-w-0 ${
                filtersOpen ? 'block' : 'hidden'
              } md:block`}
            >
              <div className="md:sticky md:top-24 md:max-h-[calc(100vh-7rem)] flex flex-col border border-black/10 bg-[#faf9f6] text-[#111111]">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/10">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/65">
                    Filtros
                  </p>

                  {activeFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-[11px] font-semibold text-[var(--primary)] underline underline-offset-4 hover:opacity-70"
                    >
                      Limpiar ({activeFiltersCount})
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-black/60">
                    Categorías
                  </p>

                  <div data-visual-section={VISUAL_SECTION.categories} data-visual-part="categoryList" className="flex flex-col gap-1">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        data-visual-part="categoryItem"
                        aria-pressed={category === cat}
                        onClick={() => {
                          setCategory(cat);
                          setPage(1);
                        }}
                        className={`px-3 py-2 text-left text-xs font-medium transition-colors ${
                          category === cat
                            ? 'bg-[var(--primary)] text-[var(--on-primary)]'
                            : 'text-[#171717] hover:bg-black/5'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-black/10 mt-5 pt-5">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-black/60">
                      Disponibilidad
                    </p>

                    {['En stock', 'Sin stock'].map((option) => (
                      <label
                        key={option}
                        className="flex items-center gap-2.5 py-1.5 text-xs cursor-pointer"
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
                          className="accent-[var(--primary)]"
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>

                  <div className="border-t border-black/10 mt-5 pt-5">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-black/60">
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
                        className="h-9 min-w-0 border border-black/15 bg-white px-2.5 text-xs outline-none focus:border-[var(--primary)]"
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
                        className="h-9 min-w-0 border border-black/15 bg-white px-2.5 text-xs outline-none focus:border-[var(--primary)]"
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

            <main data-visual-part="catalogResults" className="col-span-12 md:col-span-9 min-w-0">
              {appliedFilters}

              {paginated.length === 0 ? (
                <EmptyState
                  icon={<Icon name="search" className="w-12 h-12" />}
                  title="Sin resultados"
                  description="No se encontraron productos para tu búsqueda."
                />
              ) : (
                <>
                  <div
                    data-visual-section={VISUAL_SECTION.productGrid}
                    data-visual-grid={viewMode === 'grid' ? 'catalog' : undefined}
                    className={
                      viewMode === 'grid'
                        ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6'
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
            </main>
          </div>
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
      data-catalog-page={isMinimal ? 'minimal' : 'editorial'}
      data-visual-section={VISUAL_SECTION.catalog} data-visual-catalog
      className={
        isMinimal
          ? 'max-w-6xl mx-auto px-4 md:px-8 pt-8 sm:pt-12 pb-8 min-w-0'
          : 'max-w-7xl mx-auto px-4 py-6 sm:py-8 min-w-0'
      }
    >
      {/* CABECERA */}

      <div
        className={`
          flex flex-col
          sm:flex-row
          sm:items-end
          justify-between
          gap-4 sm:gap-5
          ${isMinimal ? 'mb-6 sm:mb-8' : 'mb-6'}
        `}
      >
        <div className="min-w-0">
          {isMinimal && (
            <p className="text-xs text-gray-500 mb-2">
              Explora nuestra selección
            </p>
          )}

          <h1
            className={
              isMinimal
                ? 'text-3xl md:text-4xl font-semibold tracking-tight text-[#171717] break-words'
                : 'text-2xl font-semibold font-display text-[var(--foreground)] break-words'
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

        <div data-catalog-toolbar className="flex flex-wrap items-center gap-2 w-full sm:w-auto">

          {/* Buscar */}

          <div data-catalog-search className="relative w-full sm:w-auto">
            <Icon
              name="search"
              className="
                absolute
                left-3.5
                top-1/2
                -translate-y-1/2
                w-4
                h-4
                text-gray-500
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
                    ? 'h-11 sm:h-10 text-sm rounded-full pl-10 pr-4 w-full sm:w-48 md:w-56'
                    : 'h-11 sm:h-8 text-sm rounded-lg pl-9 pr-3 w-full sm:w-40 sm:focus:w-52'
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
              flex-1 sm:flex-initial min-w-0
              border
              border-[var(--border)]
              bg-white
              focus:outline-none
              ${
                isMinimal
                  ? 'h-11 sm:h-10 text-xs rounded-full px-4'
                  : 'h-11 sm:h-8 text-xs rounded-lg px-2'
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
              flex shrink-0
              border
              border-[var(--border)]
              overflow-hidden
              bg-white
              ${
                isMinimal
                  ? 'rounded-full h-11 sm:h-10'
                  : 'rounded-lg h-11 sm:h-auto'
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
                        ? 'w-11 sm:w-10'
                        : 'w-11 sm:w-auto sm:px-2 sm:py-1.5'
                    }
                    ${
                      viewMode === view
                        ? 'bg-[var(--primary)] text-[var(--on-primary)]'
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
          min-h-11
          w-full sm:w-auto
          justify-center items-center
          text-sm font-medium
          ${
            isMinimal
              ? 'bg-white border border-[var(--border)] rounded-full px-5 py-2'
              : 'bg-white border border-[var(--border)] rounded-lg px-4 py-2'
          }
        `}
        data-visual-part="catalogFiltersToggle" aria-expanded={filtersOpen}
        onClick={() =>
          setFiltersOpen(!filtersOpen)
        }
      >
        Filtros{activeFiltersCount > 0 && ` (${activeFiltersCount})`} {filtersOpen ? '−' : '+'}
      </button>

      {/* CONTENIDO */}

      <div data-visual-part="catalogLayout"
        className={`
          grid
          grid-cols-12
          ${isMinimal ? 'gap-5 md:gap-7' : 'gap-6'}
        `}
      >
        {/* FILTROS */}

        <aside data-visual-part="catalogFilters" data-visual-open={filtersOpen}
          className={`
            col-span-12
            md:col-span-3
            min-w-0
            ${filtersOpen ? 'block' : 'hidden'}
            md:block
          `}
        >
          <div
            className={`
              bg-white
              border
              border-[var(--border)]
              md:sticky
              flex
              flex-col
              ${
                isMinimal
                  ? 'rounded-[26px] md:top-24 md:max-h-[calc(100vh-7rem)] shadow-xs'
                  : 'rounded-xl md:top-20 md:max-h-[calc(100vh-6rem)]'
              }
            `}
          >
            {/* Encabezado fijo con Limpiar filtros */}

            <div
              className={`
                flex items-center justify-between gap-3
                border-b border-[var(--border)]
                ${isMinimal ? 'px-5 py-3.5' : 'px-4 py-3'}
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

              <div data-visual-section={VISUAL_SECTION.categories} data-visual-part="categoryList" className="flex flex-col gap-1.5">
                {categories.map((cat) => (
                  <button data-visual-part="categoryItem" aria-pressed={category === cat}
                    type="button"
                    key={cat}
                    onClick={() => {
                      setCategory(cat);
                      setPage(1);
                    }}
                    className={`
                      text-left
                      text-sm
                      px-3.5
                      py-2
                      transition-all
                      ${
                        isMinimal
                          ? 'rounded-full'
                          : 'rounded-lg'
                      }
                      ${
                        category === cat
                          ? 'bg-[var(--primary)] text-[var(--on-primary)]'
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
                      className="flex items-center gap-2 text-sm py-1.5 cursor-pointer"
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
                      w-full min-w-0
                      text-xs
                      border
                      border-[var(--border)]
                      px-3
                      focus:outline-none
                      ${
                        isMinimal
                          ? 'h-9 rounded-full'
                          : 'h-9 sm:h-7 rounded'
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
                      w-full min-w-0
                      text-xs
                      border
                      border-[var(--border)]
                      px-3
                      focus:outline-none
                      ${
                        isMinimal
                          ? 'h-9 rounded-full'
                          : 'h-9 sm:h-7 rounded'
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

        <main data-visual-part="catalogResults" className="col-span-12 md:col-span-9 min-w-0">
          {appliedFilters}

          {paginated.length === 0 ? (
            <EmptyState
              icon={<Icon name="search" className="w-12 h-12 text-gray-500" />}
              title="Sin resultados"
              description="No encontramos productos para tu búsqueda."
            />
          ) : (
            <>
              <div
                data-visual-section={VISUAL_SECTION.productGrid} data-visual-grid={viewMode === 'grid' ? 'catalog' : undefined}
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