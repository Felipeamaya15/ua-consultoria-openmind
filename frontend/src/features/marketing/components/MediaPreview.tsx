import { useEffect, useRef, useState } from 'react';
import { ErrorState, LoadingState } from '../../../shared/components/states';
import { Button } from '../../admin/components/ui';
import { humanizeAdminError } from '../../admin/utils/humanizeError';
import { inspectMediaUrl, type MediaResource } from '../domain/mediaLibrary';
import { fetchMediaImage } from '../services/mediaLibraryService';
import './mediaLibrary.css';

type InstagramWindow = Window & { instgrm?: { Embeds: { process: () => void } } };
function InstagramEmbed({ url }: { url: string }) {
  const host = useRef<HTMLDivElement>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    const target = host.current;
    if (!target) return;
    const quote = document.createElement('blockquote'); quote.className = 'instagram-media';
    quote.setAttribute('data-instgrm-permalink', url); quote.setAttribute('data-instgrm-version', '14');
    const link = document.createElement('a'); link.href = url; link.textContent = 'Ver publicación en Instagram'; link.target = '_blank'; link.rel = 'noopener noreferrer';
    quote.appendChild(link); target.replaceChildren(quote);
    const fail = () => setFailed(true);
    const process = () => { try { (window as InstagramWindow).instgrm?.Embeds.process(); } catch { fail(); } };
    let script = document.querySelector<HTMLScriptElement>('script[data-openmind-instagram]');
    if (!script) { script = document.createElement('script'); script.src = 'https://www.instagram.com/embed.js'; script.async = true; script.dataset.openmindInstagram = 'true'; document.head.appendChild(script); }
    script.addEventListener('load', process); script.addEventListener('error', fail); process();
    const timer = window.setTimeout(() => { if (!target.querySelector('iframe')) fail(); }, 8000);
    return () => { clearTimeout(timer); script?.removeEventListener('load', process); script?.removeEventListener('error', fail); target.replaceChildren(); };
  }, [url]);
  return <>{failed && <p>No se pudo mostrar la incrustación. Usa el enlace al original.</p>}<div ref={host} className="media-instagram-embed" /></>;
}

export function MediaPreview({ resource, publicImageUrl, initiallyOpen = false }: { resource: MediaResource; publicImageUrl?: string; initiallyOpen?: boolean }) {
  // OPENMIND_PUBLIC_MEDIA_PREVIEW_V1
  const pathname = typeof window !== 'undefined'
    ? window.location.pathname
    : '';
  const isPublicStorefront = /^\/plantilla\/[1-4](?:\/|$)/.test(pathname);
  // OPENMIND_PUBLIC_MEDIA_PREVIEW_V2
  // Identificar el recurso por su enlace, no solamente por su ID.
  const normalizedUrl = (resource.url || '')
    .trim()
    .split(/[?#]/)[0]
    .replace(/\/+$/, '');

  const storePath =
    pathname.match(/^\/plantilla\/[1-4]/)?.[0] || '';

  const previewKey =
    `openmind:public-media-preview:v2:${storePath}:${resource.tipo}:${normalizedUrl || resource.id}`;

  // Compatibilidad con preferencias guardadas anteriormente.
  const legacyPreviewKey =
    `openmind:public-media-preview:${resource.id}`;

  const [opened, setOpened] = useState(() => {
    if (!isPublicStorefront) return initiallyOpen;
    try {
      const saved = localStorage.getItem(previewKey) ?? localStorage.getItem(legacyPreviewKey);
      return saved === null ? initiallyOpen : saved === 'open';
    } catch {
      return initiallyOpen;
    }
  });

  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isPublicStorefront) return;
    try {
      const saved = localStorage.getItem(previewKey) ?? localStorage.getItem(legacyPreviewKey);
      setOpened(saved === null ? initiallyOpen : saved === 'open');
    } catch {
      setOpened(initiallyOpen);
    }
  }, [previewKey, initiallyOpen, isPublicStorefront]);

  function togglePreview() {
    const next = !opened;
    setOpened(next);
    setError('');
    setImageUrl('');

    if (isPublicStorefront) {
      try {
        localStorage.setItem(previewKey, next ? 'open' : 'closed');
      } catch {
        // La vista previa sigue funcionando.
      }
    }
  }
  const info = resource.url ? inspectMediaUrl(resource.tipo, resource.url) : { url: '', embed: '', error: '' };
  useEffect(() => {
    if (!opened || !resource.archivo || publicImageUrl) return;
    const controller = new AbortController(); let objectUrl = '';
    fetchMediaImage(resource.id, controller.signal).then(blob => { if (controller.signal.aborted) return; objectUrl = URL.createObjectURL(blob); setImageUrl(objectUrl); }).catch(cause => { if (!controller.signal.aborted) setError(humanizeAdminError(cause instanceof Error ? cause.message : 'No pudimos cargar la imagen.')); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [opened, resource.id, resource.archivo, publicImageUrl]);

  const canPreview = resource.tipo !== 'enlace';
  return <div className="media-preview">
    {canPreview && <Button type="button" variant="outline" onClick={togglePreview}>{opened ? 'Ocultar vista previa' : 'Ver vista previa'}</Button>}
    {opened && canPreview && <div className={`media-preview-content media-preview-content--${resource.tipo}`}>
      {error ? <ErrorState>{error}</ErrorState> : resource.tipo === 'video' ? (publicImageUrl || imageUrl ? <video controls muted playsInline preload="none" src={publicImageUrl || imageUrl} aria-label={resource.titulo} onPlay={event => { document.querySelectorAll('video').forEach(video => { if (video !== event.currentTarget) video.pause(); }); }} /> : <LoadingState>Cargando video…</LoadingState>) : publicImageUrl ? <img src={publicImageUrl} alt={resource.titulo} loading="lazy" onError={() => setError('La imagen ya no está publicada o disponible.')} /> : resource.archivo ? imageUrl ? <img src={imageUrl} alt={resource.titulo} /> : <LoadingState>Cargando imagen…</LoadingState>
        : info.error ? <p>La vista previa no está disponible. Edita el enlace.</p>
        : resource.tipo === 'imagen' ? <img src={info.url} alt={resource.titulo} loading="lazy" referrerPolicy="no-referrer" onError={() => setError('No pudimos cargar la imagen externa. Usa el enlace al original.')} />
        : resource.tipo === 'instagram' ? <InstagramEmbed url={info.url} />
        : info.embed && <iframe title={`Vista previa: ${resource.titulo}`} src={info.embed} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" onError={() => setError('El proveedor no permitió la vista previa. Usa el enlace al original.')} />}
      {!resource.archivo && <p>Si el proveedor limita la incrustación, abre el contenido original.</p>}
    </div>}
    {info.url && <a href={info.url} target="_blank" rel="noopener noreferrer" className="marketing-text-link">Abrir contenido original ↗</a>}
  </div>;
}
