import { ViewportVideo } from '../../../landing/components/ViewportVideo';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './productImageGallery.css';

type Props = { images: string[]; alt: string; href?: string; imageClassName?: string; detail?: boolean; index?: number; onSelect?: (index: number) => void; videoUrl?: string };

/** One gallery for cards and detail; navigation never changes product order. */
export function ProductImageGallery({ images, alt, href, imageClassName = '', detail = false, index, onSelect, videoUrl }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const esInicio = /^\/plantilla\/\d+\/?$/.test(pathname);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const [selected, setSelected] = useState(0), [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false), [visible, setVisible] = useState(true), [reduced, setReduced] = useState(false);
  const [settings, setSettings] = useState({ mode: 'hover', interval: 5, transition: 'slide', indicators: true });
  const count = images.length + (detail && videoUrl ? 1 : 0), current = count ? ((index ?? selected) + count) % count : 0, src = images[current];
  const previous = useRef<string>();
  const [outgoing, setOutgoing] = useState<string>();
  const hoverChangeId = useRef(0);

  function select(next: number) {
    if (count < 1) return;
    const value = (next + count) % count;

    if (!esInicio || detail || value === current) {
      setSelected(value);
      onSelect?.(value);
      return;
    }

    const candidate = images[value];
    if (!candidate) return;

    const requestId = ++hoverChangeId.current;
    const preload = new Image();
    let applied = false;

    const apply = () => {
      if (applied || requestId !== hoverChangeId.current) return;
      if (preload.naturalWidth < 1) return;

      applied = true;
      setSelected(value);
      onSelect?.(value);
    };

    preload.onload = apply;
    preload.onerror = () => {
      // Mantener la fotografia anterior si la siguiente falla.
    };
    preload.src = candidate;

    if (preload.complete) apply();
  }
  useEffect(() => {
    const node = host.current; if (!node) return;
    const sync = () => {
      const style = getComputedStyle(node), read = (name: string) => style.getPropertyValue(name).trim();
      const mode = read('--openmind-product-mode');
      setSettings({ mode: ['static', 'hover', 'automatic'].includes(mode) ? mode : 'hover', interval: Math.max(2, Math.min(20, Number(read('--openmind-product-interval')) || 5)), transition: read('--openmind-product-transition') || 'slide', indicators: read('--openmind-carousel-indicators') !== '0' });
    };
    const observer = new MutationObserver(sync), root = node.closest('[data-storefront-visual]');
    if (root) observer.observe(root, { attributes: true, attributeFilter: ['style', 'class'] });
    node.ownerDocument.defaultView?.addEventListener('openmind:carousel:sync', sync); sync();
    return () => { observer.disconnect(); node.ownerDocument.defaultView?.removeEventListener('openmind:carousel:sync', sync); };
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches); update(); media.addEventListener('change', update);
    const visibility = () => setVisible(!document.hidden); document.addEventListener('visibilitychange', visibility);
    return () => { media.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = host.current; if (!node) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const observer = new IntersectionObserver(entries => setInView(entries[0].isIntersecting)); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!esInicio || detail || count < 2 || reduced || !visible || !inView || !hovered) return;
    const timer = window.setTimeout(() => select(current + 1), 3500);
    return () => clearTimeout(timer);
  }, [esInicio, count, current, detail, reduced, visible, inView, paused, focused, hovered, settings.mode, settings.interval]);
  useEffect(() => {
    if (!esInicio || !inView || count < 2 || detail || settings.mode === 'static') return;
    const image = new Image(); image.src = images[(current + 1) % count];
  }, [esInicio, inView, count, current, detail, settings.mode, images.join('|')]);
  useEffect(() => {
    const old = previous.current; previous.current = src;
    if (!src || !old || old === src || reduced) { setOutgoing(undefined); return; }
    setOutgoing(old); const timer = window.setTimeout(() => setOutgoing(undefined), 450);
    return () => clearTimeout(timer);
  }, [src, reduced]);
  const image = <>
    {esInicio && !detail && images[0] && (
      <div className="om-product-gallery__fallback" aria-hidden="true">
        <img src={images[0]} alt="" loading="eager" />
      </div>
    )}
    {outgoing && <div className="om-product-gallery__layer" aria-hidden="true"><img src={outgoing} alt="" className={imageClassName} /></div>}
    {src && <div key={src} className={`om-product-gallery__layer ${outgoing && count > 1 && !reduced ? 'om-product-gallery__layer--' + settings.transition : ''}`}><img {...(detail ? { 'data-page-main-image': true } : {})} src={src} alt={alt} loading={detail ? 'eager' : 'lazy'} decoding="async" className={imageClassName} /></div>}

    {detail && videoUrl && current === images.length && (
      <div className="om-product-gallery__layer">
        <ViewportVideo
          data-page-main-image
          src={videoUrl}
          autoPlay
          muted
          controls
          playsInline
          preload="none"
          className="w-full h-full object-contain bg-black"
          style={{ pointerEvents: 'auto' }}
        />
      </div>
    )}
  </>;
  return <div ref={host} className={detail ? "om-product-gallery om-product-gallery--detail om-product-gallery--detail-controls" : esInicio ? "om-product-gallery om-product-gallery--featured" + (hovered ? " om-product-gallery--hovering" : "") : "om-product-gallery"} role="group" aria-label={`Fotografías de ${alt}`}
    onPointerEnter={event => { if (!esInicio || detail || event.pointerType !== 'mouse') return; setHovered(true);  }} onPointerLeave={() => {
      setHovered(false);
      if (esInicio && !detail) {
        hoverChangeId.current += 1;
        setSelected(0);
        onSelect?.(0);
      }
    }}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false); }}
    onKeyDown={event => { if (count > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); select(current + (event.key === 'ArrowRight' ? 1 : -1)); } }}
    onPointerDown={event => { if (event.pointerType === 'touch') touch.current = { x: event.clientX, y: event.clientY }; }}
    onPointerCancel={() => { touch.current = null; }}
    onPointerUp={event => { const start = touch.current; touch.current = null; if (start && count > 1 && Math.abs(event.clientX - start.x) > 40 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) { select(current + (event.clientX < start.x ? 1 : -1)); suppressClick.current = true; } }}
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
    {href ? <Link to={href} className="om-product-gallery__link" aria-label={`Ver ${alt}`}>{image}</Link> : image}
    {count > 1 && !esInicio && <>
      <button type="button" className="om-product-gallery__arrow om-product-gallery__arrow--previous" aria-label="Imagen anterior" onClick={() => select(current - 1)}>{detail ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg> : '‹'}</button>
      <button type="button" className="om-product-gallery__arrow om-product-gallery__arrow--next" aria-label="Imagen siguiente" onClick={() => select(current + 1)}>{detail ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg> : '›'}</button>
      {!detail && settings.indicators && <div className="om-product-gallery__dots">{images.map((url, i) => <button key={`${i}:${url}`} type="button" aria-label={`Mostrar imagen ${i + 1}`} aria-current={i === current ? 'true' : undefined} onClick={() => select(i)} />)}</div>}
      {!detail && settings.mode === 'automatic' && <button type="button" className="om-product-gallery__pause" aria-label={paused ? 'Reanudar fotografías' : 'Pausar fotografías'} onClick={() => setPaused(value => !value)}>{paused ? '▶' : 'Ⅱ'}</button>}
    </>}
  </div>;
}
