export function VisualBenefits() {
  const benefits = [
    {
      icon: '→',
      title: 'Envío a todo Chile',
      text: 'Despacho en 3 a 5 días hábiles',
    },
    {
      icon: '○',
      title: 'Embalaje seguro',
      text: 'Cada producto va envuelto con cuidado',
    },
    {
      icon: '◷',
      title: 'Cambios en 15 días',
      text: 'Si algo llega dañado, lo reponemos',
    },
    {
      icon: '♧',
      title: 'Regalo especial',
      text: 'Incluimos tarjeta con nota personalizada',
    },
  ];

  return (
    <section className="border-t border-black/10 bg-white">
      <div className="max-w-6xl mx-auto px-5 py-10 md:py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {benefits.map((benefit) => (
          <div key={benefit.title}>
            <span className="text-2xl">
              {benefit.icon}
            </span>

            <p className="font-semibold text-sm mt-4">
              {benefit.title}
            </p>

            <p className="text-xs text-black/50 mt-2">
              {benefit.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}