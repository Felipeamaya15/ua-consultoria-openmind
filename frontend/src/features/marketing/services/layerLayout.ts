
export function layerLayoutProblem(art: HTMLElement): string | null {
  if (art.querySelector('[data-layer-dragging=true]')) return 'Termina de mover el elemento antes de exportar.';
  const layers = [...art.querySelectorAll<HTMLElement>('[data-free-layer]')];
  if (!layers.length) return null;
  const area = art.getBoundingClientRect();
  const protectedNodes = [...art.querySelectorAll<HTMLElement>(
    '.marketing-art-brand > *, .marketing-art-copy > *, .marketing-activity-head > *, .marketing-activity-footer > *'
  )].filter(node => node.getClientRects().length && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
  for (const layer of layers) {
    const rect = layer.getBoundingClientRect();
    const image = layer.querySelector('img');
    if (layer.dataset.layerInvalid === 'true' || (image?.complete && image.naturalWidth === 0)) return 'Revisa el texto editorial o la fotografía de la capa.';
    if (rect.left < area.left - 1 || rect.top < area.top - 1 || rect.right > area.right + 1 || rect.bottom > area.bottom + 1) return 'Hay un elemento libre que sale de la publicación. Ajusta su posición, tamaño o rotación.';
    const text = layer.querySelector<HTMLElement>('[data-layer-text]');
    if (text && (text.scrollHeight > text.clientHeight + 1 || text.scrollWidth > text.clientWidth + 1)) return 'Un texto libre no cabe en su caja. Aumenta el tamaño de la caja o reduce la letra.';
    if (protectedNodes.some(node => { const p = node.getBoundingClientRect(); return rect.left < p.right-1 && rect.right > p.left+1 && rect.top < p.bottom-1 && rect.bottom > p.top+1; })) return 'Un elemento libre se superpone a información de la plantilla. Muévelo antes de exportar.';
  }
  return null;
}
