import { ProductImageGallery } from '../components/store/ProductImageGallery';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';
import { useHeroContent } from '../hooks/useHeroContent';
import { HomeSections } from '../../landing/components/HomeSections';
import { VISUAL_SECTION } from '../visual/sectionIds';
import { useLandingContent } from '../../landing/hooks/useLandingContent';
import { LandingDetails } from '../../landing/components/LandingDetails';
import { Icon } from '../components/ui';
import { useLandingSectionVisibility } from '../../landing/hooks/useLandingSectionVisibility';
import { useStore } from '../context/StoreContext';
import { LandingStatus } from '../../landing/components/LandingStatus';
import { HeroCarousel, hasHeroSlides } from '../components/HeroCarousel';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { formatPrice } from '../data/mockData';

export default function MinimalHome() {
  const { featured, categories, content } = useLandingContent();
  const isSectionVisible = useLandingSectionVisibility();
  const { landing } = useStore();
  const { route } = useStorefrontTemplate();
  const heroHasPhoto = hasHeroSlides(landing);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const activeProducts = featured;
  const discoveryProducts = featured.slice(0, 4);
  const moreProducts = featured.slice(4, 6);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const query = search.trim();

    if (!query) {
      navigate(route('catalogo'));
      return;
    }

    navigate(route(`catalogo?q=${encodeURIComponent(query)}`));
  };

  const goToCategory = (category: string) => {
    navigate(route(`catalogo?cat=${encodeURIComponent(category)}`));
  };

  const hero = useHeroContent(landing, route);
  return (
    <div data-landing-page="minimal" className="pb-4 min-w-0 overflow-x-hidden">
      {/* OPENMIND_SOFT_DISCOVERY_COMPACT_HERO_V1 */}
      <section data-visual-section={VISUAL_SECTION.hero} className="px-4 md:px-8 py-8">
        <div data-visual-part="heroOverlay" className="absolute inset-0" />
        <div data-visual-layout="stack" data-visual-part="heroLayout" className="max-w-6xl mx-auto min-w-0">
          <div className={`om-minimal-hero-grid ${heroHasPhoto ? '' : 'om-minimal-hero-grid--no-media'}`}>
            <div data-visual-part="heroContent" className="om-minimal-hero-copy">
              <div data-visual-part="heroTitleBlock" className="w-full min-w-0">
                <LandingStatus />
                <h1 hidden={!hero.showTitle} className="font-semibold text-[#151515] break-words">
                  {hero.title}
                </h1>
              </div>

              <p hidden={!hero.showDescription} data-visual-part="heroSubtitle" className="text-gray-700">
                {hero.description}
              </p>

              {hero.showButton && hero.buttonText && (
                <div data-visual-part="heroCtaLayout" className="om-minimal-hero-cta">
                  <Link data-visual-section={VISUAL_SECTION.heroCta} to={hero.href}
                    target={hero.external ? '_blank' : undefined}
                    rel={hero.external ? 'noopener noreferrer' : undefined}
                    className="inline-flex min-h-11 items-center rounded-full bg-[var(--primary)] px-6 py-3 font-semibold text-[var(--on-primary)] shadow-sm hover:opacity-95 transition-opacity">
                    {hero.buttonText}
                  </Link>
                </div>
              )}

              <form data-visual-part="heroCtaLayout"
                onSubmit={handleSearch}
                className="om-minimal-hero-search w-full max-w-xl mt-2 flex justify-center"
              >
                <div
                  data-landing-search
                  className="om-minimal-search-field group w-full min-w-0 h-13 sm:h-14 bg-white rounded-full border border-gray-200 shadow-xs hover:border-gray-300 hover:shadow-md focus-within:border-[var(--primary)] focus-within:ring-4 focus-within:ring-[var(--primary)]/15 pl-5 pr-2 flex flex-nowrap items-center gap-3 transition-all duration-200"
                >
                  <svg
                    className="om-minimal-search-icon w-5 h-5 text-gray-400 group-focus-within:text-[var(--primary)] flex-shrink-0 transition-colors pointer-events-none"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" strokeWidth="1.8" />
                    <path
                      d="m20 20-3.5-3.5"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>

                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="¿Qué estás buscando hoy?"
                    aria-label="Buscar productos"
                    className="om-minimal-search-input flex-1 min-w-0 w-full h-full bg-transparent border-none outline-none ring-0 focus:ring-0 focus:outline-none focus:border-none text-sm sm:text-[15px] text-[#171717] placeholder:text-gray-400"
                  />

                  {search.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="Limpiar búsqueda"
                      title="Limpiar búsqueda"
                      className="om-minimal-search-clear w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}

                  <button
                    type="submit"
                    aria-label="Buscar productos"
                    className="om-minimal-search-submit h-9 sm:h-10 px-4 shrink-0 gap-1.5 rounded-full inline-flex items-center justify-center text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200"
                  >
                    <span>Buscar</span>
                    <svg
                      className="w-3.5 h-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 12h14M13 6l6 6-6 6"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </form>
            </div>

            {heroHasPhoto && (
              <div data-visual-part="heroFrame" className="om-minimal-hero-media">
                <HeroCarousel landing={landing} onContentChange={hero.onChange} />
              </div>
            )}
          </div>
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
              to={route('catalogo')}
              className="hidden sm:inline-flex text-sm font-semibold text-[var(--primary)] hover:opacity-75 transition-opacity"
            >
              Ver todo →
            </Link>

          </div>

          <div data-visual-section={VISUAL_SECTION.productGrid} data-visual-grid="products" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {discoveryProducts.map((product) => (
              <div data-visual-section={VISUAL_SECTION.productCard} data-visual-card="custom"
                key={product.id}

                className="relative relative group relative rounded-[24px] overflow-hidden bg-gray-200 aspect-[4/5]"
              >
                <ProductImageGallery images={product.images} alt={product.name} href={route(`producto/${product.id}`)} imageClassName="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />

                <div data-visual-part="body" className="absolute inset-x-3 bottom-3 bg-white/95 backdrop-blur-sm rounded-2xl p-4">

                  <p className="text-[11px] uppercase tracking-wide text-gray-600 font-medium">
                    {product.category}
                  </p>

                  <div className="flex items-end justify-between gap-3 mt-1">

                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-[#171717] truncate">
                        <Link to={route(`producto/${product.id}`)}>{product.name}</Link>
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
              </div>
            ))}

          </div>

          <Link
            to={route('catalogo')}
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
                    to={route('catalogo')}
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
              to={route('catalogo')}
              className="text-sm font-semibold text-[var(--primary)] hover:opacity-75 transition-opacity"
            >
              Ver catálogo →
            </Link>

          </div>

          {moreProducts.length > 0 ? (
            <div data-visual-section={VISUAL_SECTION.productGrid} data-visual-grid="products" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

              {moreProducts.map((product) => (
                <div data-visual-section={VISUAL_SECTION.productCard} data-visual-card="custom"
                  key={product.id}

                  className="relative group"
                >
                  <div data-visual-part="cardImage" className="relative aspect-square rounded-[22px] overflow-hidden bg-gray-200">

                    <ProductImageGallery images={product.images} alt={product.name} href={route(`producto/${product.id}`)} imageClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />

                  </div>

                  <div data-visual-part="body" className="pt-3">

                    <p className="text-[11px] uppercase tracking-wide text-gray-600 font-medium">
                      {product.category}
                    </p>

                    <h3 className="text-sm font-semibold text-[#171717] mt-1 truncate">
                      <Link to={route(`producto/${product.id}`)}>{product.name}</Link>
                    </h3>

                    <p data-visual-part="price" className="text-sm font-semibold text-gray-700 mt-1">
                      {formatPrice(product.basePrice)}
                    </p>
                    <p data-visual-part="description">{product.description}</p>
                    <span data-visual-part="buyButton">Ver opciones →</span>
                  </div>
                </div>
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