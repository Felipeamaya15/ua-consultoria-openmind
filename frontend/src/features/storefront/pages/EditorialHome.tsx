import { useLandingContent } from '../../landing/hooks/useLandingContent';
import { LandingDetails } from '../../landing/components/LandingDetails';
import { useLandingSectionVisibility } from '../../landing/hooks/useLandingSectionVisibility';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';
import { LandingStatus } from '../../landing/components/LandingStatus';
import { Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/store/ProductCard';
import { Badge, Icon } from '../components/ui';
export default function EditorialHome() {
  const { featured, categories, content } = useLandingContent();
  const isSectionVisible = useLandingSectionVisibility();
  const { landing } = useStore();
  const { route } = useStorefrontTemplate();
  return (
    <div>
      {/* Hero - full-width editorial */}
      <section className="relative h-[72vh] min-h-[480px] overflow-hidden">
        <img data-landing-image={landing?.imagen_principal ? true : undefined} src={landing?.imagen_principal || undefined} hidden={!landing?.imagen_principal} alt={landing?.titulo || ''} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f1623]/80 via-[#0f1623]/40 to-transparent" />
        <div className="absolute inset-0 flex items-end pb-16 px-8 max-w-7xl mx-auto">
          <div className="max-w-xl animate-fade-in">
            <LandingStatus />
            <Badge variant="accent" className="mb-4">Temporada 2025</Badge>
            <h1 className="font-display text-5xl md:text-7xl text-white leading-tight mb-4">{landing?.titulo}</h1>
            <p className="text-white/80 text-lg mb-8">{landing?.descripcion}</p>
            <Link to={route('catalogo')} className="inline-flex items-center gap-2 bg-white text-[var(--foreground)] px-7 py-3.5 rounded-lg font-semibold hover:bg-[var(--muted)] transition-colors">
              {landing?.texto_boton} →
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits strip */}
      {isSectionVisible('Beneficios') && content.beneficios.length > 0 && (<section data-landing-content className="bg-white border-b border-[var(--border)] py-4">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {content.beneficios.map((b, i) => (
            <div key={i} className="flex flex-col items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
              <div className="flex items-center gap-2"><Icon name={b.icono} className="w-4 h-4" /><span>{b.titulo}</span></div>
              {b.descripcion && <p className="text-xs">{b.descripcion}</p>}
            </div>
          ))}
        </div>
      </section>)}

      {/* Featured products */}
      {isSectionVisible('Productos destacados') && featured.length > 0 && (<section data-landing-content className="max-w-7xl mx-auto px-4 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)] mb-1">Selección</p>
            <h2 className="font-display text-4xl text-[var(--foreground)]">Destacados</h2>
          </div>
          <Link to={route('catalogo')} className="text-sm font-medium text-[var(--primary)] hover:underline">Ver todos →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {featured.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>)}

      {/* Category grid */}
      {isSectionVisible('Categorías') && categories.length > 0 && (<section data-landing-content className="bg-[var(--muted)] py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="font-display text-3xl mb-8 text-center">Explorar por categoría</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {categories.map(cat => {
              const image = featured.find(p => p.category === cat)?.images[0];
              return (
                <Link key={cat} to={route(`catalogo?cat=${encodeURIComponent(cat)}`)} className="group relative rounded-xl overflow-hidden aspect-square">
                  {image && <img src={image} alt={cat} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />}
                  <div className="absolute inset-0 bg-black/40 flex items-end p-3">
                    <span className="text-white font-semibold text-sm">{cat}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>)}
      <LandingDetails />
    </div>
  );
}

