import { useEffect, useId, useRef, useState } from 'react';
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
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!searchOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !searchRef.current?.contains(event.target)) setSearchOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [searchOpen]);
  const radioName = useId();
  const candidates = source === 'promotion' ? products.filter(hasRealOffer) : products;
  const filtered = searchProducts(candidates, query);
  const selected = products.find(p => p.id === productId);
  const variants = selected ? pricedVariants(selected).filter(v => source === 'product' || v.originalPrice !== null) : [];
  return <div className="marketing-picker">
    <fieldset className="marketing-source-options"><legend>1. Elige el contenido</legend>
      {([{ id: 'product', label: 'Productos', detail: 'Crear publicación de producto' }, { id: 'promotion', label: 'Promociones', detail: 'Crear publicación de promoción' }] as const).map(item =>
        <label key={item.id} className={`marketing-source ${source === item.id ? 'is-selected' : ''}`}>
          <input type="radio" name={radioName} value={item.id} checked={source === item.id} onChange={() => { setQuery(''); setSearchOpen(false); onSource(item.id); }} />
          <span><strong>{item.label}</strong><span>{item.detail}</span></span>
        </label>)}
    </fieldset>
    {source === 'promotion' && catalogReady && <div className="marketing-source-note"><strong>Ofertas de tu catálogo</strong>
      <p>Usa las ofertas registradas en productos activos con stock. Para enviar correos promocionales, abre Marketing → Correos y campañas.</p>
      {!candidates.length && <p role="status">No hay ofertas de productos disponibles para crear una publicación.</p>}
    </div>}
    {catalogReady && products.length === 0 && <p role="status" className="marketing-empty-message">Tu catálogo está vacío. Agrega un producto en Productos para comenzar.</p>}
    {candidates.length > 0 && <>
      <div className="marketing-product-search" ref={searchRef}
        onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setSearchOpen(false); }}
        onKeyDown={e => { if (e.key === 'Escape' && searchOpen) { e.preventDefault(); e.stopPropagation(); searchRef.current?.querySelector('input')?.focus(); setSearchOpen(false); } }}>
        <Input label="Buscar producto" type="search" value={query} placeholder="Nombre, categoría o SKU"
          onFocus={() => setSearchOpen(true)} onClick={() => setSearchOpen(true)}
          onChange={e => { setQuery(e.target.value); setSearchOpen(true); }} />
        {selected && <div className="marketing-product-current"><span>Producto seleccionado</span><strong>{selected.name}</strong></div>}
        {searchOpen && <>
        <div className="marketing-product-results-header">
          <span role="status" aria-live="polite">{filtered.length === 1 ? '1 producto encontrado' : `${filtered.length} productos encontrados`}</span>
          {query && <button type="button" onClick={() => setQuery('')}>Limpiar búsqueda</button>}
        </div>
        {filtered.length ? <div className="marketing-product-results" role="group" aria-label={source === 'promotion' ? 'Productos con oferta' : 'Resultados de productos'}>
          {filtered.map(p => {
            const issue = productProblem(p, source);
            const image = p.images[0] || p.variants.find(v => v.active && v.images?.length)?.images?.[0];
            const isSelected = p.id === productId;
            return <button type="button" key={p.id} className="marketing-product-result" aria-pressed={isSelected} onClick={() => { if (!isSelected) onProduct(p.id); setQuery(''); searchRef.current?.querySelector('input')?.focus(); setSearchOpen(false); }}>
              <span className="marketing-product-thumb" aria-hidden="true">
                {image ? <img src={image} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }} /> : null}
              </span>
              <span className="marketing-product-summary"><strong>{p.name}</strong><small>{p.category || 'Sin categoría'}</small>
                {issue && <small className="marketing-product-issue">{!p.active ? 'Inactivo' : 'Revisar datos antes de publicar'}</small>}
              </span>
              {isSelected && <span className="marketing-product-selected-mark" aria-hidden="true">✓</span>}
            </button>;
          })}
        </div> : <p className="marketing-product-no-results">No encontramos productos con esa búsqueda. Prueba otro nombre, categoría o SKU.</p>}
        </>}
      </div>
      {selected && variants.length > 1 && <Select label="Variante de la publicación" value={sku} options={[
        { value: '', label: source === 'promotion' ? 'Oferta disponible de menor precio' : 'Precio disponible más bajo' },
        ...variants.map(v => ({ value: v.variant.sku, label: `${variantDescription(v.variant)} · ${formatMarketingMoney(v.price)}` })),
      ]} onChange={e => onSku(e.target.value)} />}
    </>}
    {source === 'promotion' && candidates.length > 0 && <p className="marketing-hint">La oferta corresponde a la variante indicada. El catálogo no registra fechas de inicio o fin para estos precios.</p>}
  </div>;
}
