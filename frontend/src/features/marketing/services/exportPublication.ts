import { PUBLICATION_FORMATS, type PublicationFormat } from '../domain/types';

export type ExportType = 'png' | 'jpg';
function timeout<T>(promise: Promise<T>, message: string, ms = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}
function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('No pudimos preparar un recurso de la publicación.')); reader.readAsDataURL(blob); });
}
async function resource(url: string, kind: 'image' | 'font'): Promise<string> {
  if (url.startsWith('data:')) return url;
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error();
    const blob = await response.blob();
    if (!blob.size || kind === 'image' && !/^image\//.test(blob.type)) throw new Error();
    return await dataUrl(blob);
  } catch { throw new Error(kind === 'image' ? 'No se puede exportar una imagen: su servidor no permite descargarla (CORS) o no está disponible. Usa otra foto del catálogo.' : 'No pudimos incluir la fuente elegida. Reintenta o usa una fuente del sistema.'); }
}
const family = (value: string) => value.replace(/["']/g, '').trim().toLowerCase();
async function embeddedFonts(used: Set<string>): Promise<string> {
  const custom = new Set([...document.fonts].map(face => family(face.family)).filter(name => used.has(name)));
  if (!custom.size) return '';
  const faces: string[] = [], found = new Set<string>(), visited = new Set<string>();
  const cssText = async (css: string, base: string) => {
    for (const face of css.match(/@font-face\s*\{[^}]*\}/gi) || []) {
      const name = family(face.match(/font-family\s*:\s*([^;}]*)/i)?.[1] || '');
      if (!custom.has(name)) continue;
      let result = face;
      for (const match of [...face.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)]) result = result.replace(match[0], `url("${await resource(new URL(match[1], base).href, 'font')}")`);
      faces.push(result); found.add(name);
    }
  };
  const sheet = async (value: CSSStyleSheet) => {
    if (value.href && visited.has(value.href)) return;
    if (value.href) visited.add(value.href);
    try {
      for (const rule of [...value.cssRules]) {
        if (rule instanceof CSSImportRule && rule.styleSheet) await sheet(rule.styleSheet);
        else if (rule instanceof CSSFontFaceRule) await cssText(rule.cssText, value.href || location.href);
      }
    } catch {
      if (!value.href) throw new Error('No pudimos leer las fuentes de la publicación.');
      const response = await fetch(value.href, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('No pudimos cargar las fuentes para exportar.');
      await cssText(await response.text(), value.href);
    }
  };
  for (const value of [...document.styleSheets]) await sheet(value);
  if ([...custom].some(name => !found.has(name))) throw new Error('No pudimos incluir la fuente elegida. Usa otra fuente o reintenta.');
  return faces.join('\n');
}

/** Copia solo la pieza con estilos calculados en px: conserva cqw, grid y tipografía sin clonar el editor. */
export async function renderPublication(art: HTMLElement, format: PublicationFormat, type: ExportType, isCurrent: () => boolean = () => true): Promise<Blob> {
  const check = () => {
    if (!art.isConnected || !isCurrent()) throw new Error('La publicación o sesión cambió durante la exportación. Vuelve a descargarla.');
    if (art.dataset.blocked === 'true') throw new Error('Ajusta el contenido: esta publicación no cabe de forma legible.');
    if (art.dataset.resourceError === 'true') throw new Error('Hay una imagen o logo que no pudo cargarse. Corrígelo antes de descargar.');
  };
  check();
  const nodes = [art, ...art.querySelectorAll<HTMLElement>('*')];
  const used = new Set<string>();
  const loads = nodes.map(node => {
    const css = getComputedStyle(node);
    css.fontFamily.split(',').forEach(name => used.add(family(name)));
    return document.fonts.load(`${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`, node.textContent || 'Aa');
  });
  await timeout(Promise.all(loads).catch(() => { throw new Error('No pudimos cargar la fuente elegida. Reintenta o usa una fuente del sistema.'); }), 'Las fuentes tardan demasiado en cargar. Reintenta.');
  await timeout(document.fonts.ready, 'Las fuentes no están listas para exportar.');
  await timeout(Promise.all([...art.querySelectorAll('img')].map(image => image.decode())).catch(() => { throw new Error('Una imagen no pudo cargarse. Revisa la foto o logo antes de descargar.'); }), 'Una imagen no terminó de cargar. Reintenta.');
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  check();
  const cssFonts = await embeddedFonts(used);
  const copy = async (node: Node): Promise<Node> => {
    if (!(node instanceof HTMLElement)) return document.createTextNode(node.nodeType === Node.TEXT_NODE ? node.textContent || '' : '');
    const clone = document.createElement(node.tagName.toLowerCase());
    const css = getComputedStyle(node);
    for (const name of css) if (!name.startsWith('--')) clone.style.setProperty(name, css.getPropertyValue(name));
    if (node instanceof HTMLImageElement) {
      (clone as HTMLImageElement).src = await resource(node.currentSrc || node.src, 'image');
    } else for (const child of node.childNodes) clone.appendChild(await copy(child));
    return clone;
  };
  const clone = await copy(art) as HTMLElement;
  const rect = art.getBoundingClientRect(), dimensions = PUBLICATION_FORMATS.find(f => f.id === format)!;
  if (!rect.width || !rect.height) throw new Error('La publicación no está visible. Reintenta.');
  clone.style.width = `${rect.width}px`; clone.style.height = `${rect.height}px`; clone.style.margin = '0';
  const root = document.createElement('div'); root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const style = document.createElement('style'); style.textContent = cssFonts; root.append(style, clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${rect.width} ${rect.height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(root)}</foreignObject></svg>`;
  const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await timeout(image.decode().catch(() => { throw new Error('El navegador no pudo componer la publicación. Prueba con un navegador actualizado.'); }), 'El navegador no pudo componer la publicación. Reintenta.');
  const canvas = document.createElement('canvas'); canvas.width = dimensions.width; canvas.height = dimensions.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('El navegador no permite generar imágenes.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  check();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  if (!pixels.some((value, index) => index % 4 === 3 && value > 0)) throw new Error('La imagen generada está vacía. No se descargó ningún archivo.');
  if (type === 'jpg') { context.globalCompositeOperation = 'destination-over'; context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); }
  const mime = type === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await timeout(new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value && value.size > 200 && value.type === mime ? resolve(value) : reject(new Error('No pudimos generar un archivo completo.')), mime, .95)), 'La descarga tardó demasiado en generarse.');
  check(); return blob;
}
export function publicationFilename(template: string, format: PublicationFormat, type: ExportType): string {
  // Sin nombre de cliente, usuario, SKU, token ni referencias privadas.
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return `publicacion-${template.replace(/[^a-z-]/g, '')}-${format}-${date}.${type}`;
}
export function downloadPublication(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.hidden = true; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
