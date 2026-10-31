import { LandingBlocks } from '../../landing/components/LandingBlocks';
import { VISUAL_SECTION } from '../visual/sectionIds';
import { useLandingContent } from '../../landing/hooks/useLandingContent';
import { LandingDetails } from '../../landing/components/LandingDetails';
import { useLandingSectionVisibility } from '../../landing/hooks/useLandingSectionVisibility';
import { useStore } from '../context/StoreContext';
import { LandingStatus } from '../../landing/components/LandingStatus';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui';

import { formatPrice } from '../data/mockData';

export default function VisualHome() {
  const { featured, content } = useLandingContent();
  const isSectionVisible = useLandingSectionVisibility();
  const { landing, config } = useStore();
  const visualProducts = featured.map(p => ({ id: p.id, name: p.name, category: p.category, description: p.description, price: p.basePrice, image: p.images[0] }));
  return (
    <div data-landing-page="visual" className="min-w-0 overflow-x-hidden">
      {/* ======================================================
          HERO
      ====================================================== */}
      <section data-visual-section={VISUAL_SECTION.hero} className="px-4 sm:px-5 md:px-8 pt-4 sm:pt-5">
        <div data-visual-part="heroLayout"
          className="
            relative min-h-[460px] sm:min-h-[620px] md:min-h-[720px]
            overflow-hidden
            flex items-end
          "
        >
          <img data-visual-part="heroImage"
            data-landing-image={landing?.imagen_principal ? true : undefined}
            src={landing?.imagen_principal || undefined} hidden={!landing?.imagen_principal}
            alt={landing?.titulo || 'Imagen principal de la tienda'}
            className="absolute inset-0 w-full h-full object-cover"
          />

          <div data-visual-part="heroOverlay"
            className="
              absolute inset-0
              bg-gradient-to-t
              from-black/75
              via-black/25
              to-black/5
            "
          />

          <div data-visual-part="heroContent"
            className="
              relative z-10
              text-white
              w-full min-w-0
              max-w-3xl
              px-5 sm:px-7 md:px-12
              pb-8 sm:pb-10 md:pb-14
            "
          >
            <p
              className="
                text-[10px] md:text-xs
                uppercase tracking-[0.24em]
                mb-4 sm:mb-5
              "
            >
              Abierto ahora
            </p>

            <LandingStatus />
            <h1
              className="
                font-serif
                text-4xl sm:text-5xl md:text-7xl
                leading-[0.98]
                max-w-3xl
                break-words
              "
            >
              {landing?.titulo}
            </h1>

            <p data-visual-part="heroSubtitle"
              className="
                mt-5 sm:mt-7
                text-sm md:text-base
                leading-relaxed
                max-w-xl
                text-white/85
                break-words
              "
            >
              {landing?.descripcion}
            </p>

            <div data-visual-part="heroCtaLayout" className="flex flex-col sm:flex-row flex-wrap gap-3 mt-6 sm:mt-8">
              <Link data-visual-section={VISUAL_SECTION.heroCta}
                to="catalogo"
                className="
                  inline-flex items-center justify-center min-h-11
                  bg-[var(--primary)] text-[var(--on-primary)]
                  px-7 py-3.5
                  text-[11px] font-semibold
                  uppercase tracking-[0.12em]
                  hover:opacity-90
                  transition-colors
                "
              >
                {landing?.texto_boton}
              </Link>

              {landing?.contenido?.bloques?.some(block=>block.visible&&block.tipo==='historia') && <Link
                to="nuestra-historia"
                className="
                  inline-flex items-center justify-center min-h-11
                  border border-white/70
                  text-white
                  px-7 py-3.5
                  text-[11px] font-semibold
                  uppercase tracking-[0.12em]
                  hover:bg-white hover:text-black
                  transition-colors
                "
              >
                Nuestra historia
              </Link>}
            </div>

            <p
              className="
                mt-6 sm:mt-8
                text-[10px]
                uppercase tracking-[0.2em]
                text-white/65
              "
            >
              — {config.name} · Envíos a todo Chile
            </p>
          </div>
        </div>
      </section>

      {/* Beneficios compactos: inmediatamente debajo de la portada. */}
      {isSectionVisible('Beneficios') && content.beneficios.length > 0 && (
        <section
          aria-label="Beneficios de la tienda"
          data-landing-content
          className="w-full px-4 sm:px-5 md:px-8 py-5"
        >
          <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-start gap-x-12 gap-y-4">
            {content.beneficios.map((benefit, index) => (
              <div key={index} className="flex items-start gap-3 min-w-0 max-w-full sm:max-w-[260px]">
                <Icon name={benefit.icono} className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5 break-words">{benefit.titulo}</p>
                  {benefit.descripcion && (
                    <p className="text-xs opacity-70 mt-1 leading-5 break-words">{benefit.descripcion}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <LandingBlocks />


      {/* ======================================================
          PRODUCTOS DESTACADOS
      ====================================================== */}
      {isSectionVisible('Productos destacados') && visualProducts.length > 0 && (<section data-visual-section={VISUAL_SECTION.sections} data-visual-kind="featured" data-landing-content className="px-4 sm:px-5 md:px-8 py-14 sm:py-20 md:py-28">
        <div className="max-w-6xl mx-auto">
          <header className="mb-8 sm:mb-12">
            <p
              className="
                text-[10px]
                uppercase tracking-[0.24em]
                text-gray-500
                mb-3 sm:mb-4
              "
            >
              Productos destacados
            </p>

            <h2
              className="
                font-serif
                text-3xl sm:text-5xl md:text-6xl
                leading-none
              "
            >
              Los más vendidos
            </h2>
          </header>

          {/* PRODUCTO PRINCIPAL */}
          <div data-visual-section={VISUAL_SECTION.productGrid} data-visual-grid="products" className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <VisualHomeProduct product={visualProducts[0]} large />
            {visualProducts.length > 1 && <div data-visual-section={VISUAL_SECTION.productGrid} data-visual-grid="products" className="grid grid-cols-1 gap-4">
              {visualProducts.slice(1, 3).map(p => <VisualHomeProduct key={p.id} product={p} />)}
            </div>}
          </div>

          {/* SEGUNDA FILA */}
          {visualProducts.length > 3 && <div data-visual-section={VISUAL_SECTION.productGrid} data-visual-grid="products" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div data-visual-section={VISUAL_SECTION.productGrid} data-visual-grid="products" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visualProducts.slice(3, 5).map(p => <VisualHomeProduct key={p.id} product={p} />)}
            </div>
            {visualProducts[5] && <VisualHomeProduct product={visualProducts[5]} wide />}
          </div>}

          <div className="mt-8 sm:mt-10">
            <Link
              to="catalogo"
              className="
                inline-flex items-center justify-center min-h-11 w-full sm:w-auto
                border border-[var(--primary)]
                px-7 py-3.5
                text-[11px] font-semibold
                uppercase tracking-[0.12em]
                hover:bg-[var(--primary)] hover:text-[var(--on-primary)]
                transition-colors
              "
            >
              Ver catálogo completo
            </Link>
          </div>
        </div>
      </section>)}

      <LandingDetails />
    </div>
  );
}

/* ============================================================
   TARJETA EXCLUSIVA DEL HOME DE VELTA
============================================================ */

interface VisualHomeProductProps {
  product: {
    id: string;
    name: string;
    category: string;
    description: string;
    price: number;
    image: string;
  };
  large?: boolean;
  wide?: boolean;
}

function VisualHomeProduct({
  product,
  large = false,
  wide = false,
}: VisualHomeProductProps) {
  return (
    <article data-visual-section={VISUAL_SECTION.productCard} data-visual-card="grid"
      className={`
        bg-[#f1f0ee]
        flex flex-col min-w-0
        ${large ? 'h-full' : ''}
      `}
    >
      <Link
        to={`producto/${product.id}`}
        className={`
          block overflow-hidden bg-gray-200
          ${
            large
              ? 'min-h-[300px] sm:min-h-[480px] md:min-h-[620px] flex-1'
              : wide
                ? 'h-[240px] sm:h-[390px]'
                : 'h-[220px] sm:h-[300px]'
          }
        `}
      >
        <img
          src={product.image}
          alt={product.name}
          className="
            w-full h-full object-cover
            hover:scale-[1.02]
            transition-transform duration-700
          "
        />
      </Link>

      <div data-visual-part="body" className="p-4 sm:p-6">
        <p
          className="
            text-[9px]
            uppercase tracking-[0.2em]
            text-gray-500
            mb-2 sm:mb-3
          "
        >
          {product.category}
        </p>

        <h3 className="font-serif text-xl sm:text-2xl leading-tight break-words">
          {product.name}
        </h3>

        <p data-visual-part="description" className="text-sm text-gray-500 leading-6 mt-2 sm:mt-3 break-words">
          {product.description}
        </p>

        <div
          className="
            flex flex-wrap items-center justify-between
            gap-3 sm:gap-5 mt-5 sm:mt-6
          "
        >
          <span data-visual-part="price" className="text-sm font-semibold">
            {formatPrice(product.price)}
          </span>

          <Link data-visual-part="buyButton"
            to={`producto/${product.id}`}
            className="
              inline-flex items-center justify-center min-h-10
              bg-[var(--primary)]
              text-white
              px-6 py-2.5
              text-[10px]
              font-semibold
              uppercase
              tracking-[0.12em]
              hover:opacity-90
              transition-colors
            "
          >
            Comprar
          </Link>
        </div>
      </div>
    </article>
  );
}