import { useEffect, useState } from 'react';
import { Button, Input, Select } from '../../admin/components/ui';
import { LoadingState } from '../../../shared/components/states';
import { fetchSharingSources, type SharingSources } from '../services/sharingService';
import { matchesSharing, sharingKey, type SharingItem } from '../domain/sharing';
import { formatMarketingMoney, pricedVariants, variantDescription } from '../domain/content';
import type { CampaignContentSelection } from '../../admin/services/campaignService';

/** Same published sources as Difusión; selections contain references, never client prices. */
export function PublishedContentPicker({ home, mode = 'campaign', selection, onSelect }: {
  home: string; mode?: 'campaign' | 'activities'; selection?: CampaignContentSelection;
  onSelect: (selection: CampaignContentSelection, item: SharingItem) => void | Promise<unknown>;
}) {
  const [data, setData] = useState<SharingSources | null>(null), [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(''), [group, setGroup] = useState(''), [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    fetchSharingSources(home, controller.signal).then(value => {if(!controller.signal.aborted)setData(value);}).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No pudimos cargar el contenido.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [home, attempt]);
  const items = (data?.items || []).filter(item => (mode === 'activities' ? item.reference.kind === 'section' : ['product', 'section'].includes(item.reference.kind)) && matchesSharing(item, group, query));
  const chosen = data?.items.find(item => item.reference.id === selection?.id && item.reference.kind === selection.kind);
  const product = data?.products?.find(item => item.id === selection?.id);
  const variants = product ? pricedVariants(product) : [];
  async function choose(item: SharingItem, next?: CampaignContentSelection) {
    if (busy) return; setBusy(true); setError('');
    try { await onSelect(next || { kind: item.reference.kind as 'product' | 'section', id: item.reference.id, skus: [], images: item.images.length ? [0] : [] }, item); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo preparar el contenido.'); }
    finally { setBusy(false); }
  }
  return <div className="published-content-picker">
    <div className="flex items-center justify-between gap-2"><h4 className="font-semibold">{mode === 'activities' ? 'Secciones publicadas de tu tienda' : 'Contenido publicado de tu tienda'}</h4><Button size="sm" variant="ghost" disabled={loading || busy} onClick={() => setAttempt(n => n + 1)}>Actualizar</Button></div>
    <Input label={mode === 'activities' ? 'Buscar cualquier sección' : 'Buscar contenido para la campaña'} value={query} onChange={event => setQuery(event.target.value)} placeholder="Nombre o descripción" />
    <Select label={mode === 'activities' ? 'Tipo de sección' : 'Tipo de contenido de campaña'} value={group} onChange={event => setGroup(event.target.value)} options={[{ value: '', label: 'Todos' }, ...(mode === 'activities' ? ['Servicios', 'Talleres', 'Información'] : ['Productos', 'Servicios', 'Talleres', 'Información']).map(value => ({ value, label: value }))]} />
    {loading && <LoadingState spacing="compact">Cargando contenido publicado…</LoadingState>}
    {error && <p role="alert">{error}</p>}{data?.errors.map(message => <p key={message} role="alert">{message}</p>)}
    {!loading && <div className="published-content-list">{items.map(item => <button type="button" key={sharingKey(item.reference)} disabled={busy} aria-pressed={selection?.id === item.reference.id} onClick={() => void choose(item)}>{item.images[0] && <img src={item.images[0]} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} />}<span><strong>{item.title}</strong><small>{item.group}{!item.content.hidePrice ? ` · ${formatMarketingMoney(item.content.price)}` : ''}</small></span></button>)}</div>}
    {!loading && !items.length && <p role="status">{query || group ? 'No hay coincidencias con estos filtros.' : 'No hay contenido publicado de este tipo. Puedes publicarlo desde Página principal.'}</p>}
    {chosen && selection && <div className="published-content-selection"><p><strong>{chosen.title}</strong> · {chosen.group}</p>
      {!!variants.length && <fieldset><legend>Variantes disponibles</legend><label><input type="checkbox" checked={!selection.skus.length} onChange={() => void choose(chosen, { ...selection, skus: [] })} /> Todas las variantes disponibles</label>{variants.map(({ variant, price }) => <label key={variant.sku}><input type="checkbox" checked={selection.skus.includes(variant.sku)} onChange={event => void choose(chosen, { ...selection, skus: event.target.checked ? [...selection.skus, variant.sku] : selection.skus.filter(sku => sku !== variant.sku) })} />{variantDescription(variant)} · {formatMarketingMoney(price)}</label>)}</fieldset>}
      {!!chosen.images.length && <fieldset><legend>Imágenes del contenido (hasta 6)</legend><Button size="sm" variant="ghost" onClick={() => void choose(chosen, { ...selection, images: chosen.images.slice(0, 6).map((_, index) => index) })}>Seleccionar imágenes disponibles</Button><div className="marketing-image-choices">{chosen.images.map((image, index) => <label key={image}><img src={image} alt={`Imagen ${index + 1} de ${chosen.title}`} loading="lazy" /><input type="checkbox" aria-label={`Incluir imagen ${index + 1}`} checked={selection.images.includes(index)} disabled={!selection.images.includes(index) && selection.images.length >= 6} onChange={event => void choose(chosen, { ...selection, images: event.target.checked ? [...selection.images, index] : selection.images.filter(value => value !== index) })} /></label>)}</div></fieldset>}
      <a href={chosen.url} target="_blank" rel="noopener noreferrer" className="marketing-text-link">Revisar contenido en la tienda ↗</a>
    </div>}
  </div>;
}
