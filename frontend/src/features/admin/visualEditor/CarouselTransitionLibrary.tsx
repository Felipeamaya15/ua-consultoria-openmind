// OPENMIND_ONLINE_EFFECTS_V1: búsqueda real y segura en Magic CSS.
import { useEffect, useState, type CSSProperties, type ChangeEvent } from 'react';
import {
  CAROUSEL_TRANSITIONS, isCarouselTransitionId,
  type CarouselTransitionId,
} from '../../storefront/visual/carouselTransitionLibrary';
import {
  ONLINE_EFFECT_SOURCE_URL, ensureOnlineEffect, isOnlineEffectId,
  loadOnlineEffects, onlineEffectAnimation, type OnlineEffect,
  type OnlineEffectId,
} from '../../storefront/visual/onlineEffects';
import '../../storefront/components/hero-carousel.css';
import './carouselTransitionLibrary.css';
import './onlineTransitionLibrary.css';

type Choice = CarouselTransitionId | OnlineEffectId;
type Props = { current: string; onApply: (value: Choice) => void };
function simplify(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
export function CarouselTransitionLibrary({ current, onApply }: Props) {
  const [source, setSource] = useState<'online'|'basic'>('online');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Choice>(
    isOnlineEffectId(current) || isCarouselTransitionId(current) ? current : 'fade',
  );
  const [remote, setRemote] = useState<OnlineEffect[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    if (source !== 'online') return;
    let alive = true;
    setLoading(true); setError('');
    loadOnlineEffects().then(list => {
      if (alive) { setRemote(list); setLoading(false); }
    }).catch(() => {
      if (alive) { setLoading(false); setError('No se pudo conectar con Magic CSS. Revisa internet y vuelve a intentar.'); }
    });
    return () => { alive = false; };
  }, [source, refresh]);

  const words = simplify(query).split(/\s+/).filter(Boolean);
  const filteredOnline = remote.filter(item => words.every(w => simplify(`${item.name} ${item.category} ${item.id}`).includes(w)));
  const filteredBasic = CAROUSEL_TRANSITIONS.filter(item => words.every(w =>
    simplify(`${item.title} ${item.description} ${item.keywords} ${item.category}`).includes(w)));
  const onlineSelected = filteredOnline.find(item => item.id === selected) ?? filteredOnline[0];
  const basicSelected = filteredBasic.find(item => item.id === selected) ?? filteredBasic[0];
  const chosen: Choice | undefined = source === 'online' ? onlineSelected?.id : basicSelected?.id;
  const title = source === 'online' ? onlineSelected?.name : basicSelected?.title;
  const usingOnline = isOnlineEffectId(chosen);
  const previewStyle = (usingOnline ? {
    animation: onlineEffectAnimation(chosen, 850),
  } : {}) as CSSProperties;
  const inUse = current === chosen;
  useEffect(() => { if (isOnlineEffectId(chosen)) void ensureOnlineEffect(chosen).catch(() => undefined); }, [chosen]);

  return <div className="ve-carousel-library om-online-transition" aria-label="Biblioteca de transiciones">
    <h3>Buscar transiciones</h3>
    <div className="om-online-transition__sources" role="group" aria-label="Origen de los efectos">
      <button type="button" aria-pressed={source === 'online'} onClick={() => {
        setSource('online');setSelected(isOnlineEffectId(current) ? current : 'magic:puffIn');setQuery('');
      }}>En internet · Magic CSS</button>
      <button type="button" aria-pressed={source === 'basic'} onClick={() => {
        setSource('basic');setSelected(isCarouselTransitionId(current) ? current : 'fade');setQuery('');
      }}>Efectos de OpenMind</button>
    </div>
    <label className="ve-carousel-library__search">Buscar por nombre
      <input type="search" value={query} onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
        placeholder={source === 'online' ? 'Ej.: magic, puff, rotate, boing…' : 'Ej.: cortina, giro, zoom…'}/>
    </label>
    <p className="ve-carousel-library__count" role="status">
      {source === 'online' ? loading ? 'Conectando con Magic CSS…' : error || `${filteredOnline.length} animaciones disponibles en internet` :
        `${filteredBasic.length} efectos de OpenMind`}
    </p>
    <div className="ve-carousel-library__results om-online-transition__results" role="group" aria-label="Resultados">
      {source === 'online' && !loading && !error && filteredOnline.map(effect =>
        <button key={effect.id} type="button" className="ve-carousel-library__option" aria-pressed={chosen === effect.id}
          onClick={() => {setSelected(effect.id);setReplay(n => n + 1);void ensureOnlineEffect(effect.id);}}>
          <strong>{effect.name}</strong><small>{effect.category} · Magic CSS</small>
        </button>)}
      {source === 'basic' && filteredBasic.map(effect =>
        <button key={effect.id} type="button" className="ve-carousel-library__option" aria-pressed={chosen === effect.id}
          onClick={() => {setSelected(effect.id);setReplay(n => n + 1);}}>
          <strong>{effect.title}</strong><small>{effect.description}</small>
        </button>)}
      {source === 'online' && !!error && <button type="button" onClick={() => setRefresh(n => n + 1)}>Reintentar conexión</button>}
      {!loading && !error && (source === 'online' ? !filteredOnline.length : !filteredBasic.length) &&
        <p className="ve-carousel-library__empty">No hay coincidencias. Prueba con otro nombre.</p>}
    </div>
    {chosen && !error && !loading && <div className="ve-carousel-library__preview-area">
      <strong>Vista previa: {title}</strong>
      <div className="ve-carousel-library__scene hero-carousel" role="img"
        aria-label={`Vista previa de ${title}`} onMouseEnter={() => setReplay(n => n + 1)}>
        <div className="ve-carousel-library__scene-base"><span>Foto A</span></div>
        <div key={`${chosen}-${replay}`}
          className={usingOnline ? 've-carousel-library__scene-new' : `hero-carousel__image hero-carousel__image--transition-${chosen} ve-carousel-library__scene-new`}
          style={previewStyle}><span>Foto B</span></div>
      </div>
      <button type="button" className="ve-carousel-library__replay" onClick={() => {setReplay(n => n + 1); if(usingOnline) void ensureOnlineEffect(chosen);}}>
        Repetir animación
      </button>
      <p>Seleccionar solo muestra la transición. «Importar y aplicar» la agrega al carrusel.</p>
      <button type="button" className="ve-carousel-library__apply" disabled={inUse} onClick={() => onApply(chosen)}>
        {inUse ? 'Transición en uso' : usingOnline ? 'Importar y aplicar' : 'Aplicar transición'}
      </button>
    </div>}
    {source === 'online' && <p className="om-online-transition__credit">Fuente: <a href={ONLINE_EFFECT_SOURCE_URL} target="_blank" rel="noopener noreferrer">Magic CSS (MIT)</a>. Solo importamos fotogramas CSS seguros.</p>}
  </div>;
}
