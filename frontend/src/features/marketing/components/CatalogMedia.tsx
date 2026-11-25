import { useState } from 'react';
import { AdminCard, Button, Input, Select } from '../../admin/components/ui';
import { EmptyListState, ErrorState, LoadingState } from '../../../shared/components/states';
import { formatMarketingMoney, pricedVariants, publicationImages, searchProducts, variantDescription } from '../domain/content';
import type { MarketingProduct } from '../domain/types';

export interface CatalogSelection { productId: string; sku: string; imageIndex: number }
export interface CatalogStatus { loading: boolean; error: string; retry: () => void }
interface Props { products: MarketingProduct[]; busy: boolean; onSelect?: (selection: CatalogSelection) => boolean | Promise<boolean>; status?: CatalogStatus }

function CatalogCard({ product, busy, onSelect }: { product: MarketingProduct } & Omit<Props, 'products'>) {
  const variants = pricedVariants(product);
  const [sku, setSku] = useState(variants[0]?.variant.sku || '');
  const [imageIndex, setImageIndex] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const variant = variants.find(row => row.variant.sku === sku) || variants[0];
  const images = publicationImages(product, variant?.variant.sku);
  const selected = Math.min(imageIndex, Math.max(0, images.length - 1));
  return <AdminCard className="media-resource-card">
    <div className="media-resource-heading"><span>Catálogo · {product.category || 'Sin categoría'}</span><span>{product.active ? 'Activo' : 'Inactivo'}</span></div>
    <h3>{product.name}</h3>
    {variants.length > 0 && <Select label={`Variante de ${product.name}`} value={variant.variant.sku} options={variants.map(row => ({ value: row.variant.sku, label: `${variantDescription(row.variant)} · ${formatMarketingMoney(row.price)}` }))} onChange={event => { setSku(event.target.value); setImageIndex(0); }} />}
    <div className="media-catalog-preview">{images[selected] && !failed.includes(images[selected]) ? <img src={images[selected]} alt={product.name} loading="lazy" onError={() => setFailed(old => [...old, images[selected]])} /> : <p role="status">{images.length ? 'Imagen no disponible. Puedes elegir otra.' : 'Sin imágenes. Puedes preparar una composición de texto.'}</p>}</div>
    {images.length > 1 && <div className="media-thumbnails" role="group" aria-label={`Imágenes de ${product.name}`}>{images.map((image, index) => <button type="button" key={image} aria-label={`Usar imagen ${index + 1} de ${product.name}`} aria-pressed={selected === index} onClick={() => setImageIndex(index)}>{failed.includes(image) ? <span>Sin imagen</span> : <img src={image} alt={`Imagen ${index + 1}`} loading="lazy" onError={() => setFailed(old => [...old, image])} />}</button>)}</div>}
    <p className="media-help">{variant?.variant.images?.length ? 'Imágenes de la variante y del producto.' : 'Las variantes utilizan las imágenes compartidas del producto.'} No se crean copias.</p>
    <Button type="button" disabled={busy || !variant || !onSelect} onClick={() => onSelect?.({ productId: product.id, sku: variant.variant.sku, imageIndex: selected })}>Preparar publicación de {product.name}</Button>
  </AdminCard>;
}

export function CatalogMedia({ products, busy, onSelect, status }: Props) {
  const [query, setQuery] = useState(''), [category, setCategory] = useState('');
  const categories = [...new Set(products.map(product => product.category).filter(Boolean))].sort();
  const filtered = searchProducts(products, query).filter(product => !category || product.category === category);
  return <div className="media-library">
    <p>Selecciona imágenes y variantes existentes para preparar una pieza con su nombre, descripción y precio. Los datos del catálogo se conservan.</p>
    {status?.loading && <LoadingState>Cargando imágenes del catálogo…</LoadingState>}
    {status?.error && <ErrorState onRetry={status.retry}>{status.error}</ErrorState>}
    <div className="media-filters"><Input label="Buscar imágenes del catálogo" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Producto, categoría o SKU" /><Select label="Categoría del catálogo" value={category} options={[{ value: '', label: 'Todas las categorías' }, ...categories.map(value => ({ value, label: value }))]} onChange={event => setCategory(event.target.value)} /></div>
    {!status?.loading && !status?.error && <><p role="status">{filtered.length} productos encontrados</p>
      {!filtered.length && <EmptyListState title="No hay productos para esta búsqueda">Prueba otro nombre, categoría o SKU.</EmptyListState>}
      <div className="media-library-grid">{filtered.map(product => <CatalogCard key={product.id} product={product} busy={busy} onSelect={onSelect} />)}</div></>}
  </div>;
}
