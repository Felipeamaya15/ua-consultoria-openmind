import { Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { mockProducts } from '../data/mockData';
import { ProductCard } from '../components/store/ProductCard';
import { Badge, Icon } from '../components/ui';
export default function EditorialHome() {
  const { config } = useStore();
  const featured = mockProducts.filter(p => p.featured && p.status === 'active');
  return (
    <div>
      {/* Hero - full-width editorial */}
      <section className="relative h-[72vh] min-h-[480px] overflow-hidden">
        <img src={config.heroImage} alt="Atención a clientes en Mi Tienda" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f1623]/80 via-[#0f1623]/40 to-transparent" />
        <div className="absolute inset-0 flex items-end pb-16 px-8 max-w-7xl mx-auto">
          <div className="max-w-xl animate-fade-in">
            <Badge variant="accent" className="mb-4">Temporada 2025</Badge>
            <h1 className="font-display text-5xl md:text-7xl text-white leading-tight mb-4">{config.name}</h1>
            <p className="text-white/80 text-lg mb-8">{config.description}</p>
            <Link to="/catalogo" className="inline-flex items-center gap-2 bg-white text-[var(--foreground)] px-7 py-3.5 rounded-lg font-semibold hover:bg-[var(--muted)] transition-colors">
              Ver tienda →
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits strip */}
      <section className="bg-white border-b border-[var(--border)] py-4">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[
            { icon: 'truck', text: 'Envío a todo Chile' },
            { icon: 'lock', text: 'Pago seguro' },
            { icon: 'return', text: 'Devolución fácil' },
            { icon: 'chat', text: 'Soporte 24/7' },
          ].map(b => (
            <div key={b.text} className="flex items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Icon name={b.icon} className="w-4 h-4" /><span>{b.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)] mb-1">Selección</p>
            <h2 className="font-display text-4xl text-[var(--foreground)]">Destacados</h2>
          </div>
          <Link to="/catalogo" className="text-sm font-medium text-[var(--primary)] hover:underline">Ver todos →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {featured.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* Category grid */}
      <section className="bg-[var(--muted)] py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="font-display text-3xl mb-8 text-center">Explorar por categoría</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {['Ropa', 'Accesorios', 'Tecnología', 'Hogar', 'Papelería', 'Alimentos'].map((cat, i) => {
              const imgs = ['photo-1542291026-7eec264c27ff', 'photo-1553062407-98eeb64c6a62', 'photo-1505740420928-5e560c06d30e', 'photo-1416879595882-3373a0480b5b', 'photo-1531346878377-a5be20888e57', 'photo-1514432324607-a09d9b4aefdd'];
              return (
                <Link key={cat} to={`/catalogo?cat=${cat}`} className="group relative rounded-xl overflow-hidden aspect-square">
                  <img src={`https://images.unsplash.com/${imgs[i]}?w=300&h=300&fit=crop&auto=format`} alt={cat} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <div className="absolute inset-0 bg-black/40 flex items-end p-3">
                    <span className="text-white font-semibold text-sm">{cat}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

