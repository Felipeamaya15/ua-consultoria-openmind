import { useId, useState } from 'react';
import { Input, Select } from '../../admin/components/ui';
import { hasRealOffer, productProblem, pricedVariants, searchProducts, variantDescription, formatMarketingMoney } from '../domain/content';
import type { ContentSource, MarketingProduct } from '../domain/types';

interface Props {
  catalogReady: boolean;
  source: ContentSource; products: MarketingProduct[]; productId: string; sku: string;
  onSource: (source: ContentSource) => void; onProduct: (id: string) => void; onSku: (sku: string) => void;
}
export function ContentPicker({ catalogReady, source, products, productId, sku, onSource, onProduct, onSku }: Props) {
  const [query, setQuery] = useState('');
  const radioName = useId();
  const candidates = source === 'promotion' ? products.filter(hasRealOffer) : products;
  const filtered = searchProducts(candidates, query);
  const selected = products.find(p => p.id === productId);
  const variants = selected ? pricedVariants(selected).filter(v => source === 'product' || v.originalPrice !== null) : [];
  return <div className="marketing-picker">
    <fieldset className="marketing-source-options"><legend>1. Elige el contenido</legend>
      {([{ id: 'product', label: 'Productos', detail: 'Crear publicación de producto' }, { id: 'promotion', label: 'Promociones', detail: 'Crear publicación de promoción' }] as const).map(item =>
        <label key={item.id} className={`marketing-source ${source === item.id ? 'is-selected' : ''}`}>
          <input type="radio" name={radioName} value={item.id} checked={source === item.id} onChange={() => { setQuery(''); onSource(item.id); }} />
          <span><strong>{item.label}</strong><span>{item.detail}</span></span>
        </label>)}
    </fieldset>
    {source === 'promotion' && catalogReady && <div className="marketing-source-note"><strong>Ofertas de tu catálogo</strong>
      <p>Las campañas generales aún no están disponibles aquí. Puedes usar las ofertas registradas en productos activos con stock.</p>
      {!candidates.length && <p role="status">No hay ofertas de productos disponibles para crear una publicación.</p>}
    </div>}
    {catalogReady && products.length === 0 && <p role="status" className="marketing-empty-message">Tu catálogo está vacío. Agrega un producto en Productos para comenzar.</p>}
    {candidates.length > 0 && <>
      <Input label="Buscar producto" type="search" value={query} placeholder="Nombre, categoría o SKU" onChange={e => { setQuery(e.target.value); onProduct(''); }} />
      {!filtered.length && <p role="status">No encontramos productos con esa búsqueda.</p>}
      <Select label={source === 'promotion' ? 'Producto con oferta' : 'Producto para publicar'} value={productId}
        options={[{ value: '', label: 'Selecciona un producto' }, ...filtered.map(p => ({ value: p.id, label: p.name + (!p.active ? ' · Inactivo' : productProblem(p, source) ? ' · Revisar datos' : '') }))]}
        onChange={e => onProduct(e.target.value)} />
      {selected && variants.length > 1 && <Select label="Variante de la publicación" value={sku} options={[
        { value: '', label: source === 'promotion' ? 'Oferta disponible de menor precio' : 'Precio disponible más bajo' },
        ...variants.map(v => ({ value: v.variant.sku, label: `${variantDescription(v.variant)} · ${formatMarketingMoney(v.price)}` })),
      ]} onChange={e => onSku(e.target.value)} />}
    </>}
    {source === 'promotion' && candidates.length > 0 && <p className="marketing-hint">La oferta corresponde a la variante indicada. El catálogo no registra fechas de inicio o fin para estos precios.</p>}
  </div>;
}
