import { useEffect, useState } from 'react'; // OPENMIND_EDITORIAL_PROMO_V1
import { HomeSections } from '../../landing/components/HomeSections';
import { VISUAL_SECTION } from '../visual/sectionIds';
import { useLandingContent } from '../../landing/hooks/useLandingContent';
import { LandingDetails } from '../../landing/components/LandingDetails';
import { useLandingSectionVisibility } from '../../landing/hooks/useLandingSectionVisibility';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';
import { LandingStatus } from '../../landing/components/LandingStatus';
import { Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/store/ProductCard';
import { Icon } from '../components/ui';
import { HeroCarousel } from '../components/HeroCarousel';

export default function EditorialHome() {
  const { featured, categories, content } = useLandingContent();
  const isSectionVisible = useLandingSectionVisibility();
  const { landing, landingProducts, visualConfig } = useStore();
  const [promoPreview, setPromoPreview] = useState<{text:string;visible:boolean}|null>(null);
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{text:string;visible:boolean}>).detail;
      if (detail && typeof detail.text === 'string' && typeof detail.visible === 'boolean') setPromoPreview(detail);
    };
    window.addEventListener('openmind:editor-promo-preview', listener);
    return () => window.removeEventListener('openmind:editor-promo-preview', listener);
  }, []);
  const promoText = promoPreview?.text ?? visualConfig?.hero?.promoText ?? '';
  const promoVisible = promoPreview?.visible ?? visualConfig?.hero?.promoVisible ?? false;
  const { route } = useStorefrontTemplate();

  return (
    <div data-landing-page="editorial" className="min-w-0 overflow-x-hidden">
      {/* Hero - full-width editorial */}
      <section
        data-visual-section={VISUAL_SECTION.hero}
        className="relative h-[64vh] sm:h-[72vh] min-h-[400px] sm:min-h-[480px] overflow-hidden"
      >
        <HeroCarousel landing={landing} />
        <div
          data-visual-part="heroOverlay"
          className="absolute inset-0 bg-gradient-to-r from-[#0f1623]/80 via-[#0f1623]/40 to-transparent"
        />
        <div
          data-visual-part="heroLayout"
          className="absolute inset-0 flex items-end pb-10 sm:pb-16 px-4 sm:px-8 max-w-7xl mx-auto"
        >
          <div data-visual-part="heroContent" className="w-full min-w-0 max-w-xl animate-fade-in">
            <LandingStatus />
            {/* OPENMIND_EDITORIAL_PROMO_V1: solo etiqueta, no cambia portada ni carrusel. */}
            {promoVisible && promoText.trim() && (
              <div data-promotional-badge className="flex" style={{ justifyContent: 'var(--visual-hero-promo-align)' }}>
                <span className="inline-block max-w-full break-words px-3 py-1 font-semibold leading-snug" style={{
                  backgroundColor: 'var(--visual-hero-promo-background)',
                  color: 'var(--visual-hero-promo-color)',
                  fontSize: 'var(--visual-hero-promo-font-size)',
                  borderRadius: 'var(--visual-hero-promo-radius)',
                  borderWidth: 'var(--visual-hero-promo-border-width)',
                  borderColor: 'var(--visual-hero-promo-border-color)',
                  borderStyle: 'solid',
                }}>{promoText}</span>
              </div>
            )}
            <h1 className="font-display text-3xl sm:text-5xl md:text-7xl text-white leading-tight mb-3 sm:mb-4 break-words">
              {landing?.titulo}
            </h1>
            <p data-visual-part="heroSubtitle" className="text-white/80 text-base sm:text-lg mb-6 sm:mb-8 break-words">
              {landing?.descripcion}
            </p>
            <div data-visual-part="heroCtaLayout">
              <Link
                data-visual-section={VISUAL_SECTION.heroCta}
                to={route('catalogo')}
                className="inline-flex min-h-11 w-full sm:w-auto items-center justify-center gap-2 bg-white text-[var(--foreground)] px-7 py-3.5 rounded-lg font-semibold hover:bg-[var(--muted)] transition-colors"
              >
                {landing?.texto_boton} →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits strip */}
      {isSectionVisible('Beneficios') && content.beneficios.length > 0 && (
        <section
          data-visual-section={VISUAL_SECTION.sections}
          data-visual-kind="benefits"
          data-landing-content
          className="bg-white border-b border-[var(--border)] py-5"
        >
          <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {content.beneficios.map((b, i) => (
              <div key={i} className="flex flex-col items-center justify-center gap-1.5 text-sm text-[var(--muted-foreground)] min-w-0">
                <div className="flex items-center gap-2 font-medium text-[var(--foreground)]">
                  <Icon name={b.icono} className="w-4 h-4 shrink-0" />
                  <span className="break-words">{b.titulo}</span>
                </div>
                {b.descripcion && <p className="text-xs break-words">{b.descripcion}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <HomeSections commerce={{
        "sistema:destacados": isSectionVisible('Productos destacados') && featured.length > 0 && (
          <section
            data-visual-section={VISUAL_SECTION.sections}
            data-visual-kind="featured"
            data-landing-content
            className="max-w-7xl mx-auto px-4 py-12 sm:py-16"
          >
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)] mb-1">Selección</p>
                <h2 className="font-display text-3xl sm:text-4xl text-[var(--foreground)]">Destacados</h2>
              </div>
              <Link to={route('catalogo')} className="inline-flex items-center min-h-11 sm:min-h-0 text-sm font-medium text-[var(--primary)] hover:underline">
                Ver todos →
              </Link>
            </div>
            <div
              data-visual-section={VISUAL_SECTION.productGrid}
              data-visual-grid="products"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
            >
              {featured.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        ),
        "sistema:categorias": isSectionVisible('Categorías') && categories.length > 0 && (
          <section
            data-visual-section={VISUAL_SECTION.categories}
            data-landing-content
            className="bg-[var(--muted)] py-12 sm:py-16"
          >
            <div className="max-w-7xl mx-auto px-4">
              <h2 className="font-display text-2xl sm:text-3xl mb-6 sm:mb-8 text-center">
                Explorar por categoría
              </h2>
              <div
                data-visual-part="categoryList"
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-3"
              >
                {categories.map(cat => {
                  const image = landingProducts.find(p => p.category === cat)?.images[0];

                  return (
                    <Link
                      data-visual-part="categoryItem"
                      key={cat}
                      to={route(`catalogo?cat=${encodeURIComponent(cat)}`)}
                      className="group relative rounded-xl overflow-hidden min-h-[140px] sm:min-h-0 aspect-[16/9] sm:aspect-square flex items-end"
                    >
                      {image && (
                        <img
                          src={image}
                          alt={cat}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      )}
                      <div data-visual-part="categoryLabel" className="relative z-10 w-full bg-black/45 flex items-end p-4 sm:p-3 min-h-full">
                        <span className="text-white font-semibold text-base sm:text-sm break-words">
                          {cat}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )
      }} />
      <LandingDetails />
    </div>
  );
}
