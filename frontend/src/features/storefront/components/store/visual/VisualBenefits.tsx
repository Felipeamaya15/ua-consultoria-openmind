import { useLandingContent } from '../../../../landing/hooks/useLandingContent';
import { Icon } from '../../ui';
export function VisualBenefits() {
  const { content } = useLandingContent();
  const benefits = content.beneficios;
  if (!benefits.length) return null;

  return (
    <section className="border-t border-black/10 bg-white">
      <div className="max-w-6xl mx-auto px-5 py-10 md:py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {benefits.map((benefit) => (
          <div key={benefit.titulo}>
            <span className="text-2xl">
              <Icon name={benefit.icono} className="w-6 h-6" />
            </span>

            <p className="font-semibold text-sm mt-4">
              {benefit.titulo}
            </p>

            <p className="text-xs text-black/50 mt-2">
              {benefit.descripcion}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}