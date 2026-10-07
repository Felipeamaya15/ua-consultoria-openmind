import { Link } from 'react-router-dom';

import { useStorefrontTemplate } from '../../../hooks/useStorefrontTemplate';

export function VisualCTA() {
  const { route } = useStorefrontTemplate();

  return (
    <section className="bg-[#111111] text-white">
      <div className="max-w-[1180px] mx-auto px-5 md:px-8 py-24 md:py-28">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">

          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/55 mb-6">
              Empieza hoy
            </p>

            <h2 className="font-serif text-[44px] sm:text-[52px] md:text-[58px] leading-[0.98] tracking-[-0.025em]">
              Encuentra lo que buscas
              <br />
              <em className="font-normal">
                al mejor precio
              </em>
            </h2>
          </div>

          <div>
            <p className="text-base md:text-lg leading-relaxed text-white/80 max-w-md">
              Miles de productos disponibles con envío rápido,
              pago seguro y una compra sin complicaciones.
            </p>

            <Link
              to={route('catalogo')}
              className="inline-flex mt-8 h-14 items-center justify-center bg-white text-black px-8 text-sm font-semibold hover:bg-white/90 transition-colors"
            >
              Ver catálogo
            </Link>
          </div>

        </div>
      </div>
    </section>
  );
}