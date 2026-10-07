import { useLandingContent } from '../../landing/hooks/useLandingContent';
import { LandingDetails } from '../../landing/components/LandingDetails';
import { useLandingSectionVisibility } from '../../landing/hooks/useLandingSectionVisibility';
import { useStore } from '../context/StoreContext';
import { LandingStatus } from '../../landing/components/LandingStatus';
import { Link } from 'react-router-dom';

import { formatPrice } from '../data/mockData';

export default function VisualHome() {
  const { featured } = useLandingContent();
  const isSectionVisible = useLandingSectionVisibility();
  const { landing } = useStore();
  const visualProducts = featured.map(p => ({ id: p.id, name: p.name, category: p.category, description: p.description, price: p.basePrice, image: p.images[0] }));
  return (
    <>
      {/* ======================================================
          HERO
      ====================================================== */}
      <section className="px-5 md:px-8 pt-5">
        <div
          className="
            relative min-h-[620px] md:min-h-[720px]
            overflow-hidden
            flex items-end
          "
        >
          <img
            data-landing-image={landing?.imagen_principal ? true : undefined}
            src={landing?.imagen_principal || undefined} hidden={!landing?.imagen_principal}
            alt={landing?.titulo || ''}
            className="absolute inset-0 w-full h-full object-cover"
          />

          <div
            className="
              absolute inset-0
              bg-gradient-to-t
              from-black/75
              via-black/25
              to-black/5
            "
          />

          <div
            className="
              relative z-10
              text-white
              max-w-3xl
              px-7 md:px-12
              pb-10 md:pb-14
            "
          >
            <p
              className="
                text-[10px] md:text-xs
                uppercase tracking-[0.24em]
                mb-5
              "
            >
              Abierto ahora
            </p>

            <LandingStatus />
            <h1
              className="
                font-serif
                text-5xl md:text-7xl
                leading-[0.96]
                max-w-3xl
              "
            >
              {landing?.titulo}
            </h1>

            <p
              className="
                mt-7
                text-sm md:text-base
                leading-relaxed
                max-w-xl
                text-white/85
              "
            >
              {landing?.descripcion}
            </p>

            <div className="flex flex-wrap gap-3 mt-8">
              <Link
                to="catalogo"
                className="
                  bg-[var(--primary)] text-white
                  px-7 py-4
                  text-[11px] font-semibold
                  uppercase tracking-[0.12em]
                  hover:opacity-90
                  transition-colors
                "
              >
                {landing?.texto_boton}
              </Link>

              <Link
                to="nuestra-historia"
                className="
                  border border-white/70
                  text-white
                  px-7 py-4
                  text-[11px] font-semibold
                  uppercase tracking-[0.12em]
                  hover:bg-white hover:text-black
                  transition-colors
                "
              >
                Nuestra historia
              </Link>
            </div>

            <p
              className="
                mt-8
                text-[10px]
                uppercase tracking-[0.2em]
                text-white/65
              "
            >
              — Velta · Envíos a todo Chile
            </p>
          </div>
        </div>
      </section>

      {/* ======================================================
          PRODUCTOS DESTACADOS
      ====================================================== */}
      {isSectionVisible('Productos destacados') && visualProducts.length > 0 && (<section data-landing-content className="px-5 md:px-8 py-20 md:py-28">
        <div className="max-w-6xl mx-auto">
          <header className="mb-12">
            <p
              className="
                text-[10px]
                uppercase tracking-[0.24em]
                text-gray-400
                mb-4
              "
            >
              Productos destacados
            </p>

            <h2
              className="
                font-serif
                text-5xl md:text-6xl
                leading-none
              "
            >
              Los más vendidos
            </h2>
          </header>

          {/* PRODUCTO PRINCIPAL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <VisualHomeProduct product={visualProducts[0]} large />
            {visualProducts.length > 1 && <div className="grid grid-cols-1 gap-4">
              {visualProducts.slice(1, 3).map(p => <VisualHomeProduct key={p.id} product={p} />)}
            </div>}
          </div>

          {/* SEGUNDA FILA */}
          {visualProducts.length > 3 && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid grid-cols-2 gap-4">
              {visualProducts.slice(3, 5).map(p => <VisualHomeProduct key={p.id} product={p} />)}
            </div>
            {visualProducts[5] && <VisualHomeProduct product={visualProducts[5]} wide />}
          </div>}

          <div className="mt-10">
            <Link
              to="catalogo"
              className="
                inline-flex
                border border-[var(--primary)]
                px-7 py-4
                text-[11px] font-semibold
                uppercase tracking-[0.12em]
                hover:bg-[var(--primary)] hover:text-white
                transition-colors
              "
            >
              Ver catálogo completo
            </Link>
          </div>
        </div>
      </section>)}

      {/* ======================================================
          HISTORIA
      ====================================================== */}
      <section className="bg-[#f2f1ef]">
        <div
          className="
            max-w-6xl mx-auto
            grid grid-cols-1 md:grid-cols-2
          "
        >
          <div className="min-h-[620px]">
            <img
              src="https://images.unsplash.com/photo-1643168343279-3f93c2e592ef?w=800&h=1000&fit=crop&auto=format"
              alt="Selección de productos Velta"
              className="w-full h-full object-cover"
            />
          </div>

          <div
            className="
              flex flex-col justify-center
              px-8 md:px-14
              py-16
            "
          >
            <p
              className="
                text-[10px]
                uppercase tracking-[0.24em]
                text-gray-500
                mb-7
              "
            >
              7 años en marcha
            </p>

            <p
              className="
                text-[10px]
                uppercase tracking-[0.24em]
                text-gray-500
                mb-4
              "
            >
              Nuestra historia
            </p>

            <h2
              className="
                font-serif
                text-4xl md:text-5xl
                leading-[1.05]
              "
            >
              Nacido de una idea,
              <br />
              <em className="font-normal">
                construido con criterio
              </em>
            </h2>

            <p className="mt-7 text-sm leading-7 text-gray-600">
              Valentina Roque fundó Velta en 2018 con una
              convicción simple: que encontrar productos de
              calidad no debería ser complicado. Lo que comenzó
              como un catálogo pequeño y cuidado se convirtió
              en una tienda que hoy despacha a todo el país.
            </p>

            <p className="mt-5 text-sm leading-7 text-gray-600">
              Cada producto pasa por una selección estricta.
              Si no cumple con los estándares de calidad,
              diseño y durabilidad que exigimos, no entra al
              catálogo. Así de simple.
            </p>

            <p className="mt-8 font-serif italic text-lg">
              Valentina Roque, fundadora
            </p>
          </div>
        </div>
      </section>

      {/* ======================================================
          SEGUNDA SECCIÓN DE HISTORIA
      ====================================================== */}
      <section className="py-20 md:py-28 px-5 md:px-8">
        <div
          className="
            max-w-6xl mx-auto
            grid grid-cols-1 md:grid-cols-2
            gap-12 md:gap-20
            items-center
          "
        >
          <div>
            <p
              className="
                text-[10px]
                uppercase tracking-[0.24em]
                text-gray-400
                mb-5
              "
            >
              Nuestro espacio
            </p>

            <h2
              className="
                font-serif
                text-4xl md:text-5xl
                leading-[1.05]
              "
            >
              Un catálogo que crece
              <br />
              <em className="font-normal">
                con intención
              </em>
            </h2>

            <p className="mt-7 text-sm leading-7 text-gray-600">
              Trabajamos con proveedores y marcas que comparten
              la misma idea: que un producto bien elegido vale
              más que diez comprados sin criterio. Cada categoría
              se revisa y actualiza de forma constante.
            </p>

            <p className="mt-5 text-sm leading-7 text-gray-600">
              Tenés dudas o querés conocernos mejor — escribinos.
              Respondemos todas las consultas.
            </p>
          </div>

          <div className="min-h-[520px]">
            <img
              src="https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=900&h=700&fit=crop&auto=format"
              alt="Interior de la tienda Velta"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>
      <LandingDetails />
    </>
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
    <article
      className={`
        bg-[#f1f0ee]
        flex flex-col
        ${large ? 'h-full' : ''}
      `}
    >
      <Link
        to={`producto/${product.id}`}
        className={`
          block overflow-hidden bg-gray-200
          ${
            large
              ? 'min-h-[620px] flex-1'
              : wide
                ? 'h-[390px]'
                : 'h-[300px]'
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

      <div className="p-6">
        <p
          className="
            text-[9px]
            uppercase tracking-[0.2em]
            text-gray-500
            mb-3
          "
        >
          {product.category}
        </p>

        <h3 className="font-serif text-2xl leading-tight">
          {product.name}
        </h3>

        <p className="text-sm text-gray-500 leading-6 mt-3">
          {product.description}
        </p>

        <div
          className="
            flex items-center justify-between
            gap-5 mt-6
          "
        >
          <span className="text-sm font-semibold">
            {formatPrice(product.price)}
          </span>

          <Link
            to={`producto/${product.id}`}
            className="
              bg-[var(--primary)]
              text-white
              px-6 py-3
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