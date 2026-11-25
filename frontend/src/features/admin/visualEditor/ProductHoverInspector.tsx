
import { useEffect, useState, type CSSProperties, type ChangeEvent } from 'react';
import type { VisualConfig } from '../../storefront/visual/types';
import { MOVEMENT_EFFECTS, LIGHT_EFFECTS, motionTransform, lightStyle } from '../../storefront/visual/effectLibrary';
import {
  ONLINE_EFFECT_SOURCE_URL, ensureOnlineEffect, isOnlineEffectId,
  loadOnlineEffects, onlineEffectAnimation, type OnlineEffect,
  type ProductMotionChoice, type ProductLightChoice,
} from '../../storefront/visual/onlineEffects';
import { CarouselTransitionLibrary } from './CarouselTransitionLibrary';
import { CAROUSEL_TRANSITIONS, carouselTransitionById } from '../../storefront/visual/carouselTransitionLibrary';
import './heroCarouselInspector.css';
import './productHoverInspector.css';
import './effectLibraryInspector.css';
import '../../storefront/visual/image-hover.css';

type Area = 'featured' | 'catalog' | 'category';
type Kind = 'motion' | 'light';
type Field = 'productImageMode' | 'productImageInterval' | 'productImageTransition' | 'catalogProductImageMode' | 'catalogProductImageInterval' | 'catalogProductImageTransition' | 'hoverFeaturedMotion' | 'hoverFeaturedLight' | 'hoverCatalogMotion' |
  'hoverCatalogLight' | 'hoverCategoryMotion' | 'hoverCategoryLight';
type Props = { hero: VisualConfig['hero']; suggestedArea: Area; onEdit: (field: Field, value: string | number) => void };
const groups = [
  { id: 'featured', label: 'Destacados', description: 'Fotografías de los productos destacados y banners del inicio.', motion: 'hoverFeaturedMotion', light: 'hoverFeaturedLight' },
  { id: 'catalog', label: 'Catálogo', description: 'Tarjetas de productos en el catálogo.', motion: 'hoverCatalogMotion', light: 'hoverCatalogLight' },
  { id: 'category', label: 'Categorías', description: 'Tarjetas de categorías que tienen fotografía.', motion: 'hoverCategoryMotion', light: 'hoverCategoryLight' },
] as const;
function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}
function matches(effect: OnlineEffect, query: string): boolean {
  if (!query.trim()) return true;
  const synonyms = /flip|rotate|swash|twister/i.test(effect.name) ? 'giro rotación voltear' :
    /boing|bounce|puff/i.test(effect.name) ? 'rebote salto aparecer' :
    /slide|tin|open/i.test(effect.name) ? 'deslizar entrada movimiento' :
    /vanish|foolish|space|magic/i.test(effect.name) ? 'efecto especial desaparecer aparecer' : '';
  const searchable = `${effect.name} ${effect.category} ${effect.id} ${synonyms}`;
  return normalize(query).split(/\s+/).every(term => normalize(searchable).includes(term));
}

function PhotoChangeControls({ hero, area, onEdit }: { hero: VisualConfig['hero']; area: 'featured' | 'catalog'; onEdit: Props['onEdit'] }) {
  const catalog = area === 'catalog';
  const mode = (catalog ? hero.catalogProductImageMode : hero.productImageMode) ?? 'hover';
  const interval = (catalog ? hero.catalogProductImageInterval : hero.productImageInterval) ?? (catalog ? 2 : 5);
  const transition = (catalog ? hero.catalogProductImageTransition : hero.productImageTransition) ?? 'slide';
  const max = catalog ? 10 : 20;
  const [draft, setDraft] = useState(String(interval));
  const [libraryOpen, setLibraryOpen] = useState(false);
  useEffect(() => setDraft(String(interval)), [interval]);
  const changeInterval = (value: number) => { if (value !== interval) onEdit(catalog ? 'catalogProductImageInterval' : 'productImageInterval', value); };
  const commitInterval = () => {
    const n = Number(draft);
    const value = draft.trim() !== '' && Number.isInteger(n) ? Math.min(max, Math.max(1, n)) : interval;
    setDraft(String(value)); changeInterval(value);
  };
  const changeTransition = (value: string) => onEdit(catalog ? 'catalogProductImageTransition' : 'productImageTransition', value);
  return <fieldset className="ve-carousel-panel__fieldset">
    <legend>Cambio de fotografías</legend>
    <label>Modo de cambio
      <select aria-label="Cambio de fotografías de productos" value={mode} onChange={event => onEdit(catalog ? 'catalogProductImageMode' : 'productImageMode', event.target.value)}>
        <option value="hover">Al pasar el mouse</option><option value="static">Manual</option><option value="automatic">Automático (computador)</option>
      </select>
    </label>
    {mode !== 'static' && <>
      <div className="ve-carousel-panel__interval-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label htmlFor="ve-product-interval">Segundos entre fotografías</label>
        <input id="ve-product-interval" type="number" min={1} max={max} step={1} inputMode="numeric" value={draft}
          onChange={event => { const raw = event.target.value; setDraft(raw); const n = Number(raw); if (raw.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= max) changeInterval(n); }}
          onBlur={commitInterval} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
          style={{ width: 78, minHeight: 38, borderRadius: 8, border: '1px solid var(--border, #a7a7a7)', background: 'var(--background, white)', color: 'inherit', padding: '6px 10px' }} />
        <span aria-hidden="true">s</span>
      </div>
      <p className="ve-carousel-panel__subhint">Entre 1 y {max} segundos.</p>
    </>}
    <label>Transición entre fotografías
      <select aria-label="Transición de fotografías de productos" value={transition} onChange={event => changeTransition(event.target.value)}>
        {CAROUSEL_TRANSITIONS.slice(0, 6).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        {!CAROUSEL_TRANSITIONS.slice(0, 6).some(item => item.id === transition) && <option value={transition}>{carouselTransitionById(transition)?.title ?? transition}</option>}
      </select>
    </label>
    <button className="ve-carousel-library-launch" type="button" aria-expanded={libraryOpen} onClick={() => setLibraryOpen(open => !open)}>{libraryOpen ? 'Cerrar biblioteca de transiciones' : 'Explorar más transiciones'}</button>
    {libraryOpen && <CarouselTransitionLibrary current={transition} onApply={changeTransition} />}
    <p>Una sola foto permanece estática. En celulares puedes deslizar o usar los controles disponibles.</p>
  </fieldset>;
}

export function ProductHoverInspector({ hero, suggestedArea, onEdit }: Props) {
  const [area, setArea] = useState<Area>(suggestedArea);
  const [opened, setOpened] = useState<Kind | null>(null);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<OnlineEffect[]>([]);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repeat, setRepeat] = useState(0);
  useEffect(() => { setArea(suggestedArea); setOpened(null); }, [suggestedArea]);
  useEffect(() => {
    if (!opened) return;
    let alive = true;
    setLoading(true); setFailure('');
    loadOnlineEffects().then(list => {
      if (alive) { setOptions(list); setLoading(false); }
    }).catch(() => {
      if (alive) { setLoading(false); setFailure('No pudimos conectar con Magic CSS. Revisa internet y vuelve a intentar.'); }
    });
    return () => { alive = false; };
  }, [opened]);
  const current = groups.find(group => group.id === area) ?? groups[0];
  const motion: ProductMotionChoice = hero[current.motion] ?? 'none';
  useEffect(() => {
    if (!opened || !options.length) return;
    const selected = options.find(x => x.id === selectedId) ?? options.find(x => matches(x, query));
    if (selected) void ensureOnlineEffect(selected.id).catch(() => undefined);
  }, [opened, options, selectedId, query]);
  const light: ProductLightChoice = hero[current.light] ?? 'none';

  function toggle(kind: Kind) {
    setOpened(old => old === kind ? null : kind);
    setQuery(''); setSelectedId(null); setRepeat(r => r + 1);
  }
  function library(kind: Kind) {
    const list = options.filter(entry => (kind === 'motion' || entry.lightCompatible) && matches(entry, query));
    const chosen = list.find(entry => entry.id === selectedId) ?? list[0];
    const actual = kind === 'motion' ? motion : light;
    const animation = onlineEffectAnimation(chosen?.id, kind === 'light' ? 1100 : 850);
    const sampleStyle = {
      '--ve-sample-transform': kind === 'motion' ? 'none' : motionTransform(motion),
      '--ve-sample-overlay-animation': kind === 'light' ? animation : lightStyle(light).animation,
      '--ve-sample-overlay-background': kind === 'light' ? 'radial-gradient(ellipse,rgba(255,255,255,.65),rgba(255,255,255,.08) 70%,transparent 95%)' : lightStyle(light).background,
      '--ve-sample-overlay-opacity': kind === 'light' ? '.65' : '0',
      '--om-online-sample-animation': kind === 'motion' ? animation : 'none',
    } as CSSProperties;
    return (
      <section className="ve-effect-library ve-effect-library--inline om-online-library" aria-label="Biblioteca de efectos de internet">
        <strong>{kind === 'motion' ? 'Buscar movimientos en internet' : 'Buscar luces y desenfoques en internet'}</strong>
        <label htmlFor={`om-online-${kind}`} className="ve-effect-library__search-label">
          Biblioteca externa: Magic CSS
        </label>
        <input id={`om-online-${kind}`} className="ve-effect-library__search" type="search" value={query}
          placeholder={kind === 'motion' ? 'Ej.: boing, puff, rotate, tin…' : 'Ej.: puff, vanish, desenfoque…'}
          onChange={(e: ChangeEvent<HTMLInputElement>) => { setQuery(e.target.value); setSelectedId(null); }}/>
        <p className="ve-effect-library__count" role="status">
          {loading ? 'Consultando Magic CSS…' : failure || `${list.length} animaciones encontradas en línea`}
        </p>
        {!failure && !loading && <div className="ve-effect-library__results om-online-library__list" aria-label="Efectos del proveedor">
          {list.map(effect => <button key={effect.id} type="button"
            className={chosen?.id === effect.id ? 'is-previewing' : ''}
            aria-pressed={chosen?.id === effect.id}
            onClick={() => { setSelectedId(effect.id); setRepeat(n => n + 1); void ensureOnlineEffect(effect.id); }}>
              <strong>{effect.name}</strong><span>{effect.category} · Magic CSS</span>
            </button>)}
          {!list.length && <p className="ve-effect-library__empty">No se encontraron efectos de este tipo. Prueba otra palabra. La biblioteca de luz solo muestra efectos externos compatibles; también tienes nueve opciones locales.</p>}
        </div>}
        {failure && <button type="button" className="ve-effect-library__repeat" onClick={() => {
          setOpened(null); setTimeout(() => setOpened(kind), 0);
        }}>Volver a conectar</button>}
        {chosen && !loading && !failure && <div className="ve-effect-library__preview">
          <strong>Vista previa: {chosen.name}</strong>
          <div key={`${chosen.id}-${repeat}`} className="ve-effect-library__sample" style={sampleStyle} tabIndex={0}
            aria-label="Pasa el mouse para ver el efecto externo">
            <div className="ve-effect-library__sample-art" key={`${chosen.id}-${repeat}`}>🪴</div>
          </div>
          <button type="button" className="ve-effect-library__repeat" onClick={() => {
            setRepeat(r => r + 1); void ensureOnlineEffect(chosen.id);
          }}>Probar otra vez</button>
          <button type="button" className="ve-effect-library__apply" disabled={actual === chosen.id}
            onClick={() => onEdit(kind === 'motion' ? current.motion : current.light, chosen.id)}>
            {actual === chosen.id ? 'Efecto en uso' : 'Importar y aplicar'}
          </button>
          <p>Se importa con un clic. Después pulsa «Guardar cambios» arriba.</p>
        </div>}
        <p className="om-online-library__credit">Fuente: <a href={ONLINE_EFFECT_SOURCE_URL} target="_blank" rel="noopener noreferrer">Magic CSS (MIT)</a>. Solo se usan animaciones CSS validadas.</p>
      </section>
    );
  }
  return <section className="ve-hover-panel" aria-labelledby="ve-hover-heading">
    <div className="ve-hover-panel__heading"><span className="ve-hover-panel__eyebrow">INTERACCIÓN CON EL MOUSE</span>
      <h2 id="ve-hover-heading">Efectos de las fotografías</h2>
      <p>Escoge un movimiento y una iluminación por separado. También puedes buscar animaciones en internet.</p>
    </div>
    <label className="ve-hover-panel__label" htmlFor="ve-hover-area">Dónde aplicar los efectos</label>
    <select id="ve-hover-area" value={area} onChange={(e: ChangeEvent<HTMLSelectElement>) => {
      setArea(e.target.value as Area); setOpened(null);
    }}>{groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select>
    <p className="ve-hover-panel__help">{current.description}</p>
    {area === 'category' ? <p className="ve-hover-panel__help">Cada categoría utiliza una sola fotografía; no necesita intervalo ni transición.</p> : <PhotoChangeControls key={area} hero={hero} area={area} onEdit={onEdit} />}
    <fieldset className="ve-hover-panel__group"><legend>Movimiento de la fotografía al pasar el mouse</legend>
      <div className="ve-hover-panel__choices">{MOVEMENT_EFFECTS.map(effect => <label key={effect.id}
        className={motion === effect.id ? 'is-selected' : ''}>
        <input type="radio" name={`hover-motion-${area}`} checked={motion === effect.id}
          onChange={() => onEdit(current.motion, effect.id)}/><span>{effect.label}</span>
      </label>)}</div>
      {isOnlineEffectId(motion) && <p className="om-online-library__active">Efecto externo en uso: {motion.slice(6)}</p>}
      {opened === 'motion' && library('motion')}
      <button type="button" className="ve-effect-library__open" onClick={() => toggle('motion')}
        aria-expanded={opened === 'motion'}>{opened === 'motion' ? 'Cerrar búsqueda en internet' : 'Buscar más movimientos en internet'}</button>
    </fieldset>
    <fieldset className="ve-hover-panel__group"><legend>Efectos de luz</legend>
      <div className="ve-hover-panel__choices">{LIGHT_EFFECTS.map(effect => <label key={effect.id}
        className={light === effect.id ? 'is-selected' : ''}>
        <input type="radio" name={`hover-light-${area}`} checked={light === effect.id}
          onChange={() => onEdit(current.light, effect.id)}/><span>{effect.label}</span>
      </label>)}</div>
      {isOnlineEffectId(light) && <p className="om-online-library__active">Efecto externo en uso: {light.slice(6)}</p>}
      {opened === 'light' && library('light')}
      <button type="button" className="ve-effect-library__open" onClick={() => toggle('light')}
        aria-expanded={opened === 'light'}>{opened === 'light' ? 'Cerrar búsqueda en internet' : 'Buscar más efectos visuales en internet'}</button>
    </fieldset>
    <p className="ve-hover-panel__footnote">La configuración se comparte entre las cuatro plantillas. En pantallas táctiles se evitan animaciones por hover.</p>
  </section>;
}


export function ProductDetailTransitionInspector({ transition, onEdit }: {
  transition: NonNullable<VisualConfig['hero']['detailProductImageTransition']>;
  onEdit: (value: NonNullable<VisualConfig['hero']['detailProductImageTransition']>) => void;
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const options = CAROUSEL_TRANSITIONS.slice(0, 6);
  return <section className="ve-hover-panel" aria-label="Transición de la galería del producto">
    <h2>Transición de la galería</h2>
    <fieldset className="ve-carousel-panel__fieldset">
      <legend>Cambio manual de fotografías</legend>
      <label>Efecto de transición
        <select aria-label="Transición de la galería del producto" value={transition}
          onChange={event => onEdit(event.target.value as NonNullable<VisualConfig['hero']['detailProductImageTransition']>)}>
          <option value="none">Sin transición</option>
          {options.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          {transition !== 'none' && !options.some(item => item.id === transition) && <option value={transition}>{carouselTransitionById(transition)?.title ?? transition}</option>}
        </select>
      </label>
      <button className="ve-carousel-library-launch" type="button" aria-expanded={libraryOpen} onClick={() => setLibraryOpen(open => !open)}>{libraryOpen ? 'Cerrar biblioteca de transiciones' : 'Explorar más transiciones'}</button>
      {libraryOpen && <CarouselTransitionLibrary current={transition} onApply={onEdit} />}
      <p>Cambia de fotografía con las flechas o miniaturas de la vista previa. Esta configuración se comparte entre las cuatro plantillas.</p>
    </fieldset>
  </section>;
}
