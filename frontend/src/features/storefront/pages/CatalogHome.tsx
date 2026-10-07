import { useLandingContent } from '../../landing/hooks/useLandingContent';
import { LandingDetails } from '../../landing/components/LandingDetails';
import { useLandingSectionVisibility } from '../../landing/hooks/useLandingSectionVisibility';
import { useStore } from '../context/StoreContext';
import { LandingStatus } from '../../landing/components/LandingStatus';
import { Link } from 'react-router-dom';

import { formatPrice } from '../data/mockData';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

export default function CatalogHome() {
  const { featured } = useLandingContent();
  const isSectionVisible = useLandingSectionVisibility();
  const { landing } = useStore();
  const { route } = useStorefrontTemplate();

  const mochila = featured[0];
  const discover = featured.slice(1);

  return (
    <div className="bg-[#050505] text-white overflow-hidden">
      {/* HERO EDITORIAL */}
      <section className="max-w-[1320px] mx-auto px-5 pt-2 md:pt-4">
        <div className="relative min-h-[620px] md:min-h-[720px] overflow-hidden rounded-[28px]">
          <img
            data-landing-image={landing?.imagen_principal ? true : undefined}
            src={landing?.imagen_principal || undefined} hidden={!landing?.imagen_principal}
            alt={landing?.titulo || ''}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/15" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />

          <div className="relative z-10 min-h-[620px] md:min-h-[720px] flex items-center">
            <div className="px-7 sm:px-12 md:px-20 max-w-[650px]">
              <p className="text-[var(--primary)] text-[11px] md:text-xs font-extrabold uppercase tracking-[0.08em]">
                Producto destacado
              </p>

              <LandingStatus />
              <h1 className="mt-6 text-[54px] sm:text-[68px] md:text-[82px] leading-[0.93] tracking-[-0.055em] font-black">
                {landing?.titulo}
              </h1>

              <p className="mt-7 max-w-md text-sm md:text-base leading-7 text-white/80">
                {landing?.descripcion}
              </p>

              <div className="mt-8 flex items-center gap-5">

                <Link
                  to={route('catalogo')}
                  className="rounded-full bg-[var(--accent)] px-7 py-3 text-sm font-semibold hover:bg-[var(--accent)] transition-colors"
                >
                  {landing?.texto_boton}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MANIFIESTO + SEGUNDO PRODUCTO */}
      {isSectionVisible('Productos destacados') && mochila && (<section data-landing-content className="max-w-[1160px] mx-auto px-5 py-24 md:py-32">
        <h2 className="max-w-[800px] text-[48px] sm:text-[62px] md:text-[76px] leading-[0.96] tracking-[-0.055em] font-black">
          Todo lo que necesitas.
          <br />
          Nada que no.
        </h2>

        <Link
          to={route(`producto/${mochila.id}`)}
          className="group relative block mt-14 min-h-[500px] md:min-h-[620px] overflow-hidden rounded-[28px]"
        >
          <img
            src={mochila.images[0]}
            alt={mochila.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.025]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/25 to-transparent" />

          <div className="relative z-10 p-8 md:p-12">
            <p className="text-[var(--primary)] text-xs font-bold">
              {mochila.category}
            </p>
            <h3 className="mt-6 text-3xl md:text-4xl font-semibold tracking-tight">
              {mochila.name}
            </h3>
            <p className="mt-3 max-w-sm text-sm text-white/80">
              Diseñado para acompañarte todos los días.
            </p>
          </div>
        </Link>
      </section>)}

      {/* BLOQUE BLANCO */}
      <section className="bg-[#f6f6f4] text-[#151515]">
        <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[560px]">
          <div className="flex items-center">
            <div className="max-w-[580px] px-8 sm:px-14 lg:pl-[max(4rem,calc((100vw-1160px)/2))] lg:pr-16 py-20">
              <p className="text-[var(--primary)] text-xs font-bold">
                Selección cuidada
              </p>

              <h2 className="mt-7 text-[52px] md:text-[66px] leading-[0.96] tracking-[-0.05em] font-black">
                Una mejor
                <br />
                forma de
                <br />
                elegir.
              </h2>

              <p className="mt-7 max-w-md text-base leading-7 text-black/55">
                Encuentra productos de calidad, con información clara,
                precios transparentes y entrega a todo Chile.
              </p>

              <Link
                to={route('catalogo')}
                className="inline-flex mt-8 text-[var(--accent)] text-base font-medium hover:translate-x-1 transition-transform"
              >
                Explorar el catálogo →
              </Link>
            </div>
          </div>

          <div className="min-h-[420px] lg:min-h-full">
            <img
              src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&h=900&fit=crop&auto=format"
              alt="Compra en tienda"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* DESCUBRIR */}
      {isSectionVisible('Productos destacados') && discover.length > 0 && (<section data-landing-content className="max-w-[1160px] mx-auto px-5 py-24 md:py-28">
        <div className="flex items-end justify-between gap-6 mb-10">
          <div>
            <p className="text-[var(--primary)] text-xs font-bold">
              Más para descubrir
            </p>
            <h2 className="mt-3 text-3xl md:text-4xl font-black tracking-[-0.035em]">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {discover.map((product) => (
            <article key={product.id} className="group">
              <Link
                to={route(`producto/${product.id}`)}
                className="block aspect-[1.15/1] rounded-[24px] overflow-hidden bg-[#171719]"
              >
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-[1.035] transition-transform duration-500"
                />
              </Link>

              <p className="mt-5 text-[var(--primary)] text-xs font-bold">
                {product.category}
              </p>

              <h3 className="mt-3 text-xl md:text-2xl font-semibold tracking-tight">
                {product.name}
              </h3>

              <p className="mt-3 text-sm font-semibold">
                {formatPrice(product.basePrice)}
              </p>

              <Link
                to={route(`producto/${product.id}`)}
                className="mt-5 h-11 rounded-full bg-[var(--accent)] text-white text-sm font-semibold flex items-center justify-center hover:bg-[var(--accent)] transition-colors"
              >
                Comprar
              </Link>
            </article>
          ))}
        </div>

        <Link
          to={route('catalogo')}
          className="sm:hidden inline-block mt-9 text-[var(--accent)] text-sm"
        >
          Ver todos los productos →
        </Link>
      </section>)}
      <LandingDetails />
    </div>
  );
}
