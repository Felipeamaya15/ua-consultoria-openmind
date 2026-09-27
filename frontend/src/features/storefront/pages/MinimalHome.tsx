import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { mockProducts, formatPrice } from '../data/mockData';

const HOME_CATEGORIES = [
  'Women',
  'Men',
  'Beauty',
  'Home',
  'Fitness & nutrition',
  'Baby & toddler',
  'Food & drinks',
];

export default function MinimalHome() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const activeProducts = useMemo(
    () => mockProducts.filter((product) => product.status === 'active'),
    [],
  );

  /*
   * Productos utilizados en las tarjetas superiores.
   * Usamos el mismo catálogo de la tienda.
   */
  const floatingProducts = activeProducts.slice(0, 4);

  /*
   * Productos principales de descubrimiento.
   */
  const discoveryProducts = activeProducts.slice(0, 4);

  /*
   * Productos adicionales.
   */
  const moreProducts = activeProducts.slice(4, 8);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const query = search.trim();

    if (!query) {
      navigate('catalogo');
      return;
    }

    navigate(`catalogo?q=${encodeURIComponent(query)}`);
  };

  const goToCategory = (category: string) => {
    navigate(`catalogo?cat=${encodeURIComponent(category)}`);
  };

  return (
    <div className="pb-4">

      {/* =====================================================
          HERO / SHOP SEARCH
      ====================================================== */}
      <section className="px-4 md:px-8 pt-10 md:pt-14">
        <div className="max-w-6xl mx-auto">

          {/* Tarjetas flotantes */}
          <div className="flex justify-center items-end -space-x-5 sm:-space-x-4 md:-space-x-3 mb-4 min-h-[150px] sm:min-h-[170px] md:min-h-[180px] px-6">

            {floatingProducts.map((product, index) => {
              const rotations = [
                '-rotate-6 translate-y-4',
                'rotate-3 -translate-y-3',
                '-rotate-2 -translate-y-1',
                'rotate-6 translate-y-5',
              ];

              return (
                <Link
                  key={product.id}
                  to={`producto/${product.id}`}
                  className={`
                    relative
                    w-[115px] sm:w-[130px] md:w-[150px]
                    bg-white
                    rounded-2xl
                    p-2
                    shadow-lg
                    border
                    border-black/5
                    transition-transform
                    duration-300
                    hover:rotate-0
                    hover:-translate-y-3
                    hover:z-20
                    ${rotations[index] ?? ''}
                  `}
                >
                  <div className="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100">
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="px-1 pt-2 pb-1">
                    <p className="text-[10px] text-gray-400">
                      {product.category}
                    </p>

                    <p className="text-xs font-semibold text-[#171717] truncate mt-0.5">
                      {product.name}
                    </p>

                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-[var(--primary)]">
                        ★★★★★
                      </span>

                      <span className="text-[9px] text-gray-400">
                        5.0
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}

          </div>

          {/* Título */}
          <div className="text-center">
            <h1 className="text-[72px] sm:text-[92px] md:text-[118px] leading-none tracking-[-0.08em] font-semibold text-[#151515]">
              shop<span className="text-[var(--accent)]">.</span>
            </h1>
          </div>

          {/* Buscador */}
          <form
            onSubmit={handleSearch}
            className="max-w-3xl mx-auto mt-8"
          >
            <div className="bg-white rounded-full border border-black/5 shadow-sm p-2 pl-6 flex items-center gap-3">

              <svg
                className="w-5 h-5 text-gray-400 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" strokeWidth="1.7" />
                <path
                  d="m20 20-3.5-3.5"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="What are you shopping for today?"
                aria-label="Buscar productos"
                className="flex-1 min-w-0 bg-transparent outline-none text-sm md:text-base text-[#171717] placeholder:text-gray-400"
              />

              <button
                type="submit"
                aria-label="Buscar"
                className="w-11 h-11 flex-shrink-0 rounded-full bg-[var(--primary)] text-white flex items-center justify-center hover:scale-105 transition-transform"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M5 12h14M13 6l6 6-6 6"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

            </div>
          </form>

          {/* Categorías */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">

            {HOME_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => goToCategory(category)}
                className="px-4 py-2 rounded-full bg-white border border-black/5 text-xs text-gray-600 hover:bg-[var(--primary)] hover:text-white transition-colors"
              >
                {category}
              </button>
            ))}

          </div>

        </div>
      </section>

      {/* =====================================================
          DESCUBRIMIENTO
      ====================================================== */}
      <section className="px-4 md:px-8 mt-16 md:mt-20">
        <div className="max-w-6xl mx-auto">

          <div className="flex items-end justify-between gap-6 mb-7">

            <div>
              <p className="text-xs text-gray-400 mb-2">
                Para descubrir sin prisa
              </p>

              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-[#171717]">
                Lo que está pasando ahora
              </h2>
            </div>

            <Link
              to="catalogo"
              className="hidden sm:inline-flex text-sm text-[var(--primary)] hover:opacity-60 transition-opacity"
            >
              Ver todo →
            </Link>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {discoveryProducts.map((product) => (
              <Link
                key={product.id}
                to={`producto/${product.id}`}
                className="group relative rounded-[24px] overflow-hidden bg-gray-200 aspect-[4/5]"
              >
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />

                <div className="absolute inset-x-3 bottom-3 bg-white/95 backdrop-blur-sm rounded-2xl p-4">

                  <p className="text-[10px] uppercase tracking-wide text-gray-400">
                    {product.category}
                  </p>

                  <div className="flex items-end justify-between gap-3 mt-1">

                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-[#171717] truncate">
                        {product.name}
                      </h3>

                      <p className="text-xs text-gray-500 mt-1">
                        {formatPrice(product.basePrice)}
                      </p>
                    </div>

                    <span className="w-8 h-8 flex-shrink-0 rounded-full border border-gray-200 flex items-center justify-center text-[var(--primary)] group-hover:bg-[var(--primary)] group-hover:text-white transition-colors">
                      →
                    </span>

                  </div>
                </div>
              </Link>
            ))}

          </div>

          <Link
            to="catalogo"
            className="sm:hidden inline-flex mt-5 text-sm text-[var(--primary)]"
          >
            Ver todo →
          </Link>

        </div>
      </section>

      {/* =====================================================
          BANNER
      ====================================================== */}
      {activeProducts[0] && (
        <section className="px-4 md:px-8 mt-20">
          <div className="max-w-6xl mx-auto">

            <div className="relative min-h-[420px] md:min-h-[520px] rounded-[32px] overflow-hidden bg-gray-200">

              <img
                src={activeProducts[0].images[0]}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />

              <div className="absolute inset-0 bg-black/30" />

              <div className="relative z-10 min-h-[420px] md:min-h-[520px] flex items-end p-7 md:p-12">

                <div className="max-w-xl text-white">

                  <p className="text-xs uppercase tracking-[0.18em] text-white/70 mb-4">
                    Nueva selección
                  </p>

                  <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
                    Productos que hacen que todos pregunten
                    {' '}
                    “¿dónde lo compraste?”
                  </h2>

                  <Link
                    to="catalogo"
                    className="inline-flex items-center mt-7 bg-white text-[#171717] rounded-full px-5 py-3 text-sm font-medium hover:bg-white/90 transition-colors"
                  >
                    Explorar colección
                    <span className="ml-2">→</span>
                  </Link>

                </div>

              </div>
            </div>

          </div>
        </section>
      )}

      {/* =====================================================
          MÁS PARA TI
      ====================================================== */}
      <section className="px-4 md:px-8 mt-20">
        <div className="max-w-6xl mx-auto">

          <div className="flex items-center justify-between gap-4 mb-7">

            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-[#171717]">
              Más para ti
            </h2>

            <Link
              to="catalogo"
              className="text-sm text-[var(--primary)] hover:opacity-60 transition-opacity"
            >
              Ver catálogo →
            </Link>

          </div>

          {moreProducts.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

              {moreProducts.map((product) => (
                <Link
                  key={product.id}
                  to={`producto/${product.id}`}
                  className="group"
                >
                  <div className="aspect-square rounded-[22px] overflow-hidden bg-gray-200">

                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />

                  </div>

                  <div className="pt-3">

                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      {product.category}
                    </p>

                    <h3 className="text-sm font-semibold text-[#171717] mt-1 truncate">
                      {product.name}
                    </h3>

                    <p className="text-sm text-gray-500 mt-1">
                      {formatPrice(product.basePrice)}
                    </p>

                  </div>
                </Link>
              ))}

            </div>
          ) : (
            /*
             * Si el mock tiene pocos productos, mostramos nuevamente
             * los primeros para mantener la sección visible durante
             * el desarrollo de la plantilla.
             */
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

              {discoveryProducts.map((product) => (
                <Link
                  key={product.id}
                  to={`producto/${product.id}`}
                  className="group"
                >
                  <div className="aspect-square rounded-[22px] overflow-hidden bg-gray-200">

                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />

                  </div>

                  <div className="pt-3">

                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      {product.category}
                    </p>

                    <h3 className="text-sm font-semibold text-[#171717] mt-1 truncate">
                      {product.name}
                    </h3>

                    <p className="text-sm text-gray-500 mt-1">
                      {formatPrice(product.basePrice)}
                    </p>

                  </div>
                </Link>
              ))}

            </div>
          )}

        </div>
      </section>

    </div>
  );
}