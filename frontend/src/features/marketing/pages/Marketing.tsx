import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button } from '../../admin/components/ui';
import { buildPublication, productProblem } from '../domain/content';
import { useMarketingSources } from '../hooks/useMarketingSources';
import { ContentPicker } from '../components/ContentPicker';
import { FormatPicker } from '../components/FormatPicker';
import { DesignStudio } from '../components/DesignStudio';
import type { ContentSource, PublicationDesign } from '../domain/types';
import '../marketing.css';
import '../editor.css';

export default function Marketing() {
  const [params] = useSearchParams();
  const [productId, setProductId] = useState(() => params.get('producto') || '');
  const [sku, setSku] = useState('');
  const [source, setSource] = useState<ContentSource>('product');
  const [design, setDesign] = useState<PublicationDesign>({ format: 'square', layout: 'product-spotlight' });
  const sources = useMarketingSources();
  const product = sources.products.find(p => p.id === productId);
  const problem = product ? productProblem(product, source) : productId && !sources.loading && !sources.productError ? 'Este producto ya no está disponible en tu catálogo. Selecciona otro.' : null;
  const content = product && !sources.loading ? buildPublication(product, source, sku) : null;
  const changeProduct = (id: string) => { setProductId(id); setSku(''); };
  const refresh = () => { setSku(''); sources.refresh(); };
  return <section className="marketing-module" aria-label="Generador de publicaciones">
    <div className="marketing-intro"><p>Elige un producto y su formato. Tu publicación se compone con los datos y colores de tu tienda.</p>
      <Button type="button" variant="outline" size="sm" disabled={sources.loading} onClick={refresh}>Actualizar datos</Button></div>
    {sources.loading && <p role="status" className="marketing-loading">Cargando productos e identidad de tu tienda...</p>}
    {sources.productError && <div role="alert"><Alert variant="error">{sources.productError}</Alert></div>}
    {sources.brandError && <div role="alert"><Alert variant="error">{sources.brandError}</Alert></div>}
    {!sources.loading && (sources.productError || sources.brandError) && <Button type="button" onClick={refresh}>Reintentar carga</Button>}
    <DesignStudio sourceKey={`${productId}:${source}`} sourceData={content} brandData={sources.brand} design={design} images={product?.images || []} selection={
      <div className="marketing-controls"><fieldset disabled={sources.loading || !!sources.productError} className="marketing-control-group">
        <ContentPicker catalogReady={!sources.loading && !sources.productError} source={source} products={sources.products} productId={productId} sku={sku}
          onSource={next => { setSource(next); changeProduct(''); }} onProduct={changeProduct} onSku={setSku} />
      </fieldset><FormatPicker value={design.format} onChange={format => setDesign({ ...design, format })} />
        <p className="marketing-hint">La publicación es temporal. Puedes probar los formatos sin cambiar tu catálogo.</p>
        <Link to="/emprendedor/productos" className="marketing-text-link">Administrar productos →</Link>
      </div>} notices={<>
        {sources.brandWarning && <p role="status" className="marketing-notice">{sources.brandWarning}</p>}
        {problem && <div role="status" className="marketing-notice">{problem}</div>}
        </>} empty={<div className="marketing-preview-empty"><span className="marketing-empty-mark" aria-hidden="true">↗</span><h3>Tu próxima publicación empieza aquí</h3><p>{sources.loading ? 'Estamos consultando los datos de tu tienda.' : sources.brandError ? 'Carga la identidad de tu tienda para generar la vista previa.' : 'Selecciona un producto disponible para ver su composición.'}</p></div>} />
  </section>;
}
