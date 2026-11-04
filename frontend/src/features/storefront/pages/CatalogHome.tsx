import { HomeSections } from '../../landing/components/HomeSections';
import { HomeCategories } from '../../landing/components/HomeCategories';
import { VISUAL_SECTION } from '../visual/sectionIds';
import { useLandingContent } from '../../landing/hooks/useLandingContent';
import { LandingDetails } from '../../landing/components/LandingDetails';
import { useLandingSectionVisibility } from '../../landing/hooks/useLandingSectionVisibility';
import { useStore } from '../context/StoreContext';
import { LandingStatus } from '../../landing/components/LandingStatus';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';

import { formatPrice } from '../data/mockData';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

export default function CatalogHome() {
  const { featured, content } = useLandingContent();
  const isSectionVisible = useLandingSectionVisibility();
  const { landing } = useStore();
  const { route } = useStorefrontTemplate();

  const mochila = featured[0];
  const discover = featured.slice(1);

  return (
    <div data-landing-page="catalog" className="bg-[var(--visual-background)] text-[var(--visual-text)] overflow-hidden min-w-0">
      {/* HERO EDITORIAL */}
      <section
        data-visual-section={VISUAL_SECTION.hero}
        className="max-w-[1320px] mx-auto px-4 sm:px-5 pt-2 md:pt-4"
      >
        <div
          data-visual-part="heroFrame"
          className={`relative min-h-[460px] sm:min-h-[620px] md:min-h-[720px] overflow-hidden rounded-[22px] sm:rounded-[28px] ${landing?.imagen_principal ? 'text-white' : 'bg-[var(--primary)] text-[var(--on-primary)]'}`}
        >
          <img
            data-visual-part="heroImage"
            data-landing-image={landing?.imagen_principal ? true : undefined}
            src={landing?.imagen_principal || undefined}
            hidden={!landing?.imagen_principal}
            alt={landing?.titulo || 'Imagen principal de la tienda'}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />

          <div
            data-visual-part="heroOverlay"
            className={`absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/15 ${landing?.imagen_principal ? '' : 'hidden'}`}
          />

          <div
            data-visual-part="heroOverlaySecondary"
            className={`absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10 ${landing?.imagen_principal ? '' : 'hidden'}`}
          />

          <div
            data-visual-part="heroLayout"
            className="relative z-10 min-h-[460px] sm:min-h-[620px] md:min-h-[720px] flex items-center"
          >
            <div
              data-visual-part="heroContent"
              className="w-full min-w-0 max-w-[650px] px-5 sm:px-12 md:px-20 py-8"
            >
              <p className="text-[var(--primary)] text-[11px] md:text-xs font-extrabold uppercase tracking-[0.08em]">
                Producto destacado
              </p>

              <LandingStatus />

              <h1 className="mt-4 sm:mt-6 text-[clamp(2.15rem,6vw,5.125rem)] leading-[0.98] tracking-[-0.045em] font-black break-words text-inherit">
                {landing?.titulo}
              </h1>

              <p
                data-visual-part="heroSubtitle"
                className="mt-5 sm:mt-7 max-w-md text-sm md:text-base leading-7 text-inherit opacity-85 break-words"
              >
                {landing?.descripcion}
              </p>

              <div
                data-visual-part="heroCtaLayout"
                className="mt-6 sm:mt-8 flex flex-wrap items-center gap-4 sm:gap-5"
              >
                <Link
                  data-visual-section={VISUAL_SECTION.heroCta}
                  to={route('catalogo')}
                  className="inline-flex min-h-11 w-full sm:w-auto items-center justify-center rounded-full bg-[var(--accent)] px-7 py-3 text-sm font-semibold text-[var(--on-accent)] hover:opacity-90 transition-opacity"
                >
                  {landing?.texto_boton}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFICIOS: una sola vez, justo debajo de la portada */}
      {isSectionVisible('Beneficios') && content.beneficios.length > 0 && (
        <section
          aria-label="Beneficios de la tienda"
          data-landing-content
          data-visual-section={VISUAL_SECTION.sections}
          data-visual-kind="benefits"
          className="w-full px-4 sm:px-5 md:px-8 py-5"
        >
          <div className="max-w-[1160px] mx-auto grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-start gap-x-12 gap-y-4">
            {content.beneficios.map((benefit, index) => (
              <div
                key={index}
                className="flex min-w-0 max-w-full sm:max-w-[260px] items-start gap-3"
              >
                <Icon
                  name={benefit.icono}
                  className="w-5 h-5 shrink-0 mt-0.5 text-[var(--visual-text)]"
                />

                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5 text-[var(--visual-text)] break-words">
                    {benefit.titulo}
                  </p>

                  {benefit.descripcion && (
                    <p className="mt-1 text-xs leading-5 text-[var(--visual-muted)] break-words">
                      {benefit.descripcion}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <HomeSections commerce={{
        "sistema:destacados": isSectionVisible('Productos destacados') && mochila && (
        <section
          data-visual-section={VISUAL_SECTION.sections}
          data-visual-kind="featured"
          data-landing-content
          className="max-w-[1160px] mx-auto px-4 sm:px-5 py-14 sm:py-24 md:py-32"
        >
          <h2 className="max-w-[800px] text-[34px] sm:text-[62px] md:text-[76px] leading-[0.98] tracking-[-0.055em] font-black text-[var(--visual-text)] break-words">
            Todo lo que necesitas.
            <br />
            Nada que no.
          </h2>

          <Link
            to={route(`producto/${mochila.id}`)}
            className="group relative block mt-8 sm:mt-14 min-h-[360px] sm:min-h-[500px] md:min-h-[620px] overflow-hidden rounded-[22px] sm:rounded-[28px]"
          >
            <img
              src={mochila.images[0]}
              alt={mochila.name}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.025]"
            />

            <div
              data-visual-part="heroOverlay"
              className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/25 to-transparent"
            />

            <div className="relative z-10 p-6 sm:p-8 md:p-12">
              <p className="text-[var(--primary)] text-xs font-bold">
                {mochila.category}
              </p>

              <h3 className="mt-4 sm:mt-6 text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-white break-words">
                {mochila.name}
              </h3>

              <p className="mt-3 max-w-sm text-sm text-white/80">
                Diseñado para acompañarte todos los días.
              </p>
            </div>
          </Link>
        </section>
      ),
        "sistema:contenido": (<section
        data-visual-section={VISUAL_SECTION.sections}
        data-visual-kind="content"
        className="bg-[var(--visual-alternate,var(--secondary))] text-[var(--on-alternate,var(--on-secondary))]"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[420px] lg:min-h-[560px]">
          <div className="flex items-center">
            <div className="w-full max-w-[580px] min-w-0 px-5 sm:px-14 lg:pl-[max(4rem,calc((100vw-1160px)/2))] lg:pr-16 py-12 sm:py-20">
              <p className="text-[var(--primary)] text-xs font-bold">
                Selección cuidada
              </p>

              <h2 className="mt-5 sm:mt-7 text-[clamp(2.15rem,5vw,4.125rem)] leading-[1.02] tracking-[-0.05em] font-black break-words text-inherit">
                Una mejor
                <br />
                forma de
                <br />
                elegir.
              </h2>

              <p className="mt-5 sm:mt-7 max-w-md text-sm sm:text-base leading-7 text-[color-mix(in_srgb,var(--on-alternate,var(--on-secondary))_70%,transparent)]">
                Encuentra productos de calidad, con información clara,
                precios transparentes y entrega a todo Chile.
              </p>

              <Link
                to={route('catalogo')}
                className="inline-flex items-center min-h-11 mt-6 sm:mt-8 text-[var(--accent)] text-base font-medium hover:translate-x-1 transition-transform"
              >
                Explorar el catálogo →
              </Link>
            </div>
          </div>

          <div className="min-h-[260px] sm:min-h-[420px] lg:min-h-full">
            <img
              src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&h=900&fit=crop&auto=format"
              alt="Compra en tienda"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>),
        "sistema:descubrir": discover.length > 0 && (
        <section
          data-visual-section={VISUAL_SECTION.sections}
          data-visual-kind="featured"
          data-landing-content
          className="max-w-[1160px] mx-auto px-4 sm:px-5 py-14 sm:py-24 md:py-28"
        >
          <div className="flex items-end justify-between gap-6 mb-8 sm:mb-10">
            <div>
              <p className="text-[var(--primary)] text-xs font-bold">
                Más para descubrir
              </p>

              <h2 className="mt-2 sm:mt-3 text-2xl sm:text-3xl md:text-4xl font-black tracking-[-0.035em] text-[var(--visual-text)]">
                Seleccionados para ti.
              </h2>
            </div>

            <Link
              to={route('catalogo')}
              className="hidden sm:block text-[var(--accent)] text-sm hover:opacity-70"
            >
              Ver todos →
            </Link>
          </div>

          <div
            data-visual-section={VISUAL_SECTION.productGrid}
            data-visual-grid="products"
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5"
          >
            {discover.map((product) => (
              <article
                data-visual-section={VISUAL_SECTION.productCard}
                data-visual-card="grid"
                key={product.id}
                className="group min-w-0"
              >
                <Link
                  to={route(`producto/${product.id}`)}
                  className="block aspect-[1.15/1] rounded-[20px] sm:rounded-[24px] overflow-hidden bg-[var(--visual-surface)]"
                >
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-[1.035] transition-transform duration-500"
                  />
                </Link>

                <p className="mt-4 sm:mt-5 text-[var(--primary)] text-xs font-bold">
                  {product.category}
                </p>

                <h3 className="mt-2 sm:mt-3 text-xl md:text-2xl font-semibold tracking-tight text-[var(--visual-text)] break-words">
                  {product.name}
                </h3>

                <p
                  data-visual-part="price"
                  className="mt-2 sm:mt-3 text-sm font-semibold text-[var(--visual-text)]"
                >
                  {formatPrice(product.basePrice)}
                </p>

                <Link
                  data-visual-part="buyButton"
                  to={route(`producto/${product.id}`)}
                  className="mt-4 sm:mt-5 h-11 rounded-full bg-[var(--accent)] text-[var(--on-accent)] text-sm font-semibold flex items-center justify-center hover:opacity-90 transition-opacity"
                >
                  Comprar
                </Link>
              </article>
            ))}
          </div>

          <Link
            to={route('catalogo')}
            className="sm:hidden inline-flex items-center min-h-11 mt-7 text-[var(--accent)] text-sm font-medium"
          >
            Ver todos los productos →
          </Link>
        </section>
      ),
        'sistema:categorias': <HomeCategories />
      }} />
      <LandingDetails />
    </div>
  );
}