import { HomeSections } from '../../landing/components/HomeSections';
import { VISUAL_SECTION } from '../visual/sectionIds';
import { useLandingContent } from '../../landing/hooks/useLandingContent';
import { LandingDetails } from '../../landing/components/LandingDetails';
import { Icon } from '../components/ui';
import { useLandingSectionVisibility } from '../../landing/hooks/useLandingSectionVisibility';
import { useStore } from '../context/StoreContext';
import { LandingStatus } from '../../landing/components/LandingStatus';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { formatPrice } from '../data/mockData';

export default function MinimalHome() {
  const { featured, categories, content } = useLandingContent();
  const isSectionVisible = useLandingSectionVisibility();
  const { landing } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const activeProducts = featured;
  const floatingProducts = isSectionVisible('Productos destacados') ? featured.slice(0, 4) : [];
  const discoveryProducts = featured.slice(0, 4);
  const moreProducts = featured.slice(4, 6);

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
    <div data-landing-page="minimal" className="pb-4 min-w-0 overflow-x-hidden">

      {/* =====================================================
          HERO / SHOP SEARCH
      ====================================================== */}
      <section data-visual-section={VISUAL_SECTION.hero} className="px-4 md:px-8 pt-6 sm:pt-10 md:pt-14">
        <div data-visual-part="heroOverlay" className="absolute inset-0" /><div data-visual-layout="stack" data-visual-part="heroLayout" className="max-w-6xl mx-auto min-w-0 items-center text-center">

          {/* Tarjetas flotantes */}
          <div data-visual-part="heroDecorations" data-landing-content className="flex justify-center items-end -space-x-6 sm:-space-x-4 md:-space-x-3 mb-4 min-h-[130px] sm:min-h-[170px] md:min-h-[180px] px-2 sm:px-6 max-w-full overflow-x-hidden mx-auto">

            {!floatingProducts.length && landing?.imagen_principal && <img data-visual-part="heroImageFallback" data-landing-image src={landing.imagen_principal} alt={landing.titulo || 'Imagen principal de la tienda'} className="max-h-[180px] max-w-full rounded-2xl object-contain mx-auto" />}
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
                    w-[92px] sm:w-[130px] md:w-[150px]
                    shrink-0
                    bg-white
                    rounded-2xl
                    p-1.5 sm:p-2
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
                      data-landing-image={index === 0 && landing?.imagen_principal ? true : undefined}
                      src={index === 0 && landing?.imagen_principal ? landing.imagen_principal : product.images[0]}
                      alt={index === 0 && landing?.imagen_principal ? landing.titulo : product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="px-1 pt-2 pb-1 text-left">
                    <p className="text-[10px] text-gray-600 truncate">
                      {product.category}
                    </p>

                    <p className="text-xs font-semibold text-[#171717] truncate mt-0.5">
                      {product.name}
                    </p>

                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-[var(--primary)]">
                        ★★★★★
                      </span>

                      <span className="text-[10px] text-gray-600">
                        5.0
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}

          </div>

          {/* Título centrado */}
          <div data-visual-part="heroTitleBlock" className="w-full text-center min-w-0 mx-auto flex flex-col items-center">
            <LandingStatus />
            <h1 className="w-full text-center mx-auto text-[clamp(2.5rem,11vw,4.5rem)] sm:text-[92px] md:text-[118px] leading-none tracking-[-0.06em] sm:tracking-[-0.08em] font-semibold text-[#151515] break-words">
              {landing?.titulo}
            </h1>
          </div>

          <p data-visual-part="heroSubtitle" className="w-full text-center text-gray-700 mt-4 px-2 mx-auto break-words">
            {landing?.descripcion}
          </p>

          {/* Buscador en una sola línea (input + botón al lado tanto en móvil como en escritorio) */}
          <form data-visual-part="heroCtaLayout"
            onSubmit={handleSearch}
            className="w-full max-w-2xl mx-auto mt-6 sm:mt-8 flex justify-center"
          >
            <div data-landing-search className="w-full bg-white rounded-full border border-black/10 shadow-sm p-1.5 pl-3.5 sm:p-2 sm:pl-6 flex flex-nowrap items-center gap-2 sm:gap-3">

              <svg
                className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 flex-shrink-0"
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
                placeholder="¿Qué estás buscando hoy?"
                aria-label="Buscar productos"
                className="flex-1 min-w-0 w-full h-10 sm:h-11 bg-transparent outline-none text-xs sm:text-sm md:text-base text-[#171717] placeholder:text-gray-500"
              />

              <button data-visual-section={VISUAL_SECTION.heroCta}
                type="submit"
                aria-label={landing?.texto_boton || 'Buscar'}
                className="px-4 sm:px-6 min-w-11 min-h-11 w-auto shrink-0 gap-1.5 sm:gap-2 rounded-full bg-[var(--primary)] text-[var(--on-primary)] inline-flex items-center justify-center text-xs sm:text-sm font-semibold hover:scale-105 transition-transform whitespace-nowrap"
              >
                {landing?.texto_boton}
                <svg
                  className="w-4 h-4 shrink-0"
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

        </div>
      </section>

      {/* Beneficios compactos debajo de la portada. */}
      {isSectionVisible('Beneficios') && content.beneficios.length > 0 && (
        <section
          aria-label="Beneficios de la tienda"
          data-visual-section={VISUAL_SECTION.sections}
          data-visual-kind="benefits"
          data-landing-content
          className="w-full px-4 md:px-8 py-6"
        >
          <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-start gap-6">
            {content.beneficios.map((benefit, index) => (
              <div key={index} className="min-w-0 max-w-full flex items-start gap-3">
                <Icon name={benefit.icono} className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5 break-words">{benefit.titulo}</p>
                  {benefit.descripcion && (
                    <p className="mt-1 text-xs leading-5 opacity-85 break-words">{benefit.descripcion}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <HomeSections commerce={{
        "sistema:categorias": isSectionVisible('Categorías') && categories.length > 0 && (
          <div
            data-visual-section={VISUAL_SECTION.categories}
            data-visual-part="categoryList"
            className="mt-6 px-4 md:px-8 flex flex-wrap justify-center gap-3"
          >

        {categories.map((category) => (
          <button data-visual-part="categoryItem"
            key={category}
            type="button"
            onClick={() => goToCategory(category)}
            className="min-h-11 px-5 py-2.5 rounded-full bg-white border border-black/10 text-sm font-medium text-[#171717] hover:bg-[var(--primary)] hover:text-[var(--on-primary)] transition-colors shadow-2xs"
          >
            {category}
          </button>
        ))}

      </div>),
        "sistema:destacados": isSectionVisible('Productos destacados') && discoveryProducts.length > 0 && (<section data-visual-section={VISUAL_SECTION.sections} data-visual-kind="featured" data-landing-content className="px-4 md:px-8 mt-12 sm:mt-16 md:mt-20">
        <div className="max-w-6xl mx-auto">

          <div className="flex items-end justify-between gap-6 mb-7">

            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">
                Para descubrir sin prisa
              </p>

              <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-[#171717]">
                Lo que está pasando ahora
              </h2>
            </div>

            <Link
              to="catalogo"
              className="hidden sm:inline-flex text-sm font-semibold text-[var(--primary)] hover:opacity-75 transition-opacity"
            >
              Ver todo →
            </Link>

          </div>

          <div data-visual-section={VISUAL_SECTION.productGrid} data-visual-grid="products" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {discoveryProducts.map((product) => (
              <Link data-visual-section={VISUAL_SECTION.productCard} data-visual-card="custom"
                key={product.id}
                to={`producto/${product.id}`}
                className="group relative rounded-[24px] overflow-hidden bg-gray-200 aspect-[4/5]"
              >
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />

                <div data-visual-part="body" className="absolute inset-x-3 bottom-3 bg-white/95 backdrop-blur-sm rounded-2xl p-4">

                  <p className="text-[11px] uppercase tracking-wide text-gray-600 font-medium">
                    {product.category}
                  </p>

                  <div className="flex items-end justify-between gap-3 mt-1">

                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-[#171717] truncate">
                        {product.name}
                      </h3>

                      <p data-visual-part="description">{product.description}</p>
                      <p data-visual-part="price" className="text-xs font-semibold text-gray-700 mt-1">
                        {formatPrice(product.basePrice)}
                      </p>
                    </div>

                    <span data-visual-part="buyButton" className="w-8 h-8 flex-shrink-0 rounded-full border border-gray-200 flex items-center justify-center text-[var(--primary)] group-hover:bg-[var(--primary)] group-hover:text-[var(--on-primary)] transition-colors">
                      →
                    </span>

                  </div>
                </div>
              </Link>
            ))}

          </div>

          <Link
            to="catalogo"
            className="sm:hidden inline-flex items-center min-h-11 mt-5 text-sm font-medium text-[var(--primary)]"
          >
            Ver todo →
          </Link>

        </div>
      </section>),
        "sistema:banner": activeProducts[0] && (
        <section data-visual-section={VISUAL_SECTION.sections} data-visual-kind="featured" data-landing-content className="px-4 md:px-8 mt-14 sm:mt-20">
          <div className="max-w-6xl mx-auto">

            <div className="relative min-h-[340px] sm:min-h-[420px] md:min-h-[520px] rounded-[24px] sm:rounded-[32px] overflow-hidden bg-gray-200">

              <img
                src={activeProducts[0].images[0]}
                alt={activeProducts[0].name}
                className="absolute inset-0 w-full h-full object-cover"
              />

              <div className="absolute inset-0 bg-black/35" />

              <div className="relative z-10 min-h-[340px] sm:min-h-[420px] md:min-h-[520px] flex items-end p-5 sm:p-7 md:p-12">

                <div className="max-w-2xl text-white min-w-0">

                  <p className="text-xs uppercase tracking-[0.18em] text-white/85 mb-3 sm:mb-4">
                    Nueva selección
                  </p>

                  <h2 className="text-2xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.08] break-words">
                    Productos que hacen que todos pregunten
                    {' '}
                    “¿dónde lo compraste?”
                  </h2>

                  <Link
                    to="catalogo"
                    className="inline-flex min-h-11 items-center mt-6 sm:mt-7 bg-white text-[#171717] rounded-full px-6 py-3 text-sm font-semibold hover:bg-white/90 transition-colors"
                  >
                    Explorar colección
                    <span className="ml-2">→</span>
                  </Link>

                </div>

              </div>
            </div>

          </div>
        </section>
      ),
        "sistema:mas-productos": moreProducts.length > 0 && (<section data-visual-section={VISUAL_SECTION.sections} data-visual-kind="featured" data-landing-content className="px-4 md:px-8 mt-14 sm:mt-20">
        <div className="max-w-6xl mx-auto">

          <div className="flex items-center justify-between gap-4 mb-7">

            <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-[#171717]">
              Más para ti
            </h2>

            <Link
              to="catalogo"
              className="text-sm font-semibold text-[var(--primary)] hover:opacity-75 transition-opacity"
            >
              Ver catálogo →
            </Link>

          </div>

          {moreProducts.length > 0 ? (
            <div data-visual-section={VISUAL_SECTION.productGrid} data-visual-grid="products" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

              {moreProducts.map((product) => (
                <Link data-visual-section={VISUAL_SECTION.productCard} data-visual-card="custom"
                  key={product.id}
                  to={`producto/${product.id}`}
                  className="group"
                >
                  <div data-visual-part="cardImage" className="aspect-square rounded-[22px] overflow-hidden bg-gray-200">

                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />

                  </div>

                  <div data-visual-part="body" className="pt-3">

                    <p className="text-[11px] uppercase tracking-wide text-gray-600 font-medium">
                      {product.category}
                    </p>

                    <h3 className="text-sm font-semibold text-[#171717] mt-1 truncate">
                      {product.name}
                    </h3>

                    <p data-visual-part="price" className="text-sm font-semibold text-gray-700 mt-1">
                      {formatPrice(product.basePrice)}
                    </p>
                    <p data-visual-part="description">{product.description}</p>
                    <span data-visual-part="buyButton">Ver opciones →</span>
                  </div>
                </Link>
              ))}

            </div>
          ) : null}

        </div>
      </section>)
      }} />
      <LandingDetails />
    </div>
  );
}