import { Link, useParams, useSearchParams } from 'react-router-dom';
import { categories, mockProducts, formatPrice } from '../data/mockData';
import { ProductCard } from '../components/store/ProductCard';
import { useCart } from '../context/CartContext';

// Pantallas de apoyo para navegar el inicio. Su diseño final se implementa por separado.
export function CatalogPreview() {
  const [params] = useSearchParams();
  const category = params.get('cat') || 'Todos';
  const products = mockProducts.filter(p => p.status === 'active' && (category === 'Todos' || p.category === category));
  return <section className="max-w-7xl mx-auto px-4 py-12"><h1 className="font-display text-4xl mb-6">Catálogo</h1>
    <nav aria-label="Filtrar categoría" className="flex flex-wrap gap-4 mb-8">{categories.map(c => <Link key={c} to={`/catalogo?cat=${encodeURIComponent(c)}`} aria-current={category === c ? 'page' : undefined} className={category === c ? 'font-bold underline' : ''}>{c}</Link>)}</nav>
    {products.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">{products.map(p => <ProductCard key={p.id} product={p} />)}</div> : <p>No hay productos en esta categoría.</p>}
  </section>;
}
export function CartPreview() {
  const { items, count, subtotal, updateQuantity, removeItem } = useCart();
  return <section className="max-w-7xl mx-auto px-4 py-12"><h1 className="font-display text-4xl mb-8">Mi carrito ({count})</h1>
    {!items.length ? <p>Tu carrito está vacío. <Link className="underline" to="/catalogo">Explorar catálogo</Link></p> : <>
      <div className="space-y-4">{items.map(item => <article key={item.variantId} className="flex flex-wrap items-center gap-5 border border-[var(--border)] bg-white p-4 rounded-xl">
        <img src={item.image} alt={item.name} className="w-20 h-20 object-cover rounded-lg" /><div className="flex-1"><h2 className="font-semibold">{item.name}</h2><p className="text-sm">{Object.values(item.attributes).join(' · ')}</p><p>{formatPrice(item.price)}</p></div>
        <label className="text-sm">Cantidad <input aria-label={`Cantidad de ${item.name}`} className="border rounded p-2 w-20" type="number" min="1" max={item.maxStock} value={item.quantity} onChange={e => updateQuantity(item.productId, item.variantId, Number(e.target.value))} /></label>
        <button className="underline text-sm" onClick={() => removeItem(item.productId, item.variantId)}>Eliminar</button>
      </article>)}</div><p className="text-xl font-bold mt-8">Subtotal: {formatPrice(subtotal)}</p>
    </>}
  </section>;
}
export function ProductPreview() {
  const { id } = useParams();
  const product = mockProducts.find(p => p.id === id);
  return <section className="max-w-7xl mx-auto px-4 py-12"><Link className="underline" to="/catalogo">Volver al catálogo</Link>{product ? <div className="max-w-sm mt-6"><ProductCard product={product}/><p className="mt-4">{product.description}</p></div> : <h1>Producto no encontrado</h1>}</section>;
}
export function PendingPage({ title }: { title: string }) {
  return <section className="max-w-7xl mx-auto px-4 py-16"><h1 className="font-display text-4xl mb-4">{title}</h1><p>Esta sección estará disponible próximamente.</p><Link className="inline-block mt-6 underline" to="/">Volver al inicio</Link></section>;
}
