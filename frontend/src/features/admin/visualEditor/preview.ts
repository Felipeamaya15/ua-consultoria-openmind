import type { VisualConfig } from '../../storefront/visual/types';
import { visualConfigToCssVariables } from '../../storefront/visual/cssVariables';
import { stableImageKey, findImageSetting, captureOriginalImage, isLegacyEditableImage, restoreOriginalImage, type OriginalImageStyle, type ThemeImageSetting } from '../../storefront/visual/imageSettings';
import { sectionFromTarget, type VisualSectionId } from './sections';

/** Same-origin protocol v1: data-visual-section IDs + delegated, captured events. */
export function connectVisualPreview(doc: Document, onSelect: (section: VisualSectionId, href?: string, group?: string) => void, onImage: (key: string, src: string, legacyKey?: string) => void, onContentImage?: (institutional: boolean, section?: VisualSectionId) => void, onPresence?: (present: boolean) => void) {
  let effective: VisualConfig | null = null;
  let images: Record<string, ThemeImageSetting> = {};
  let variableCss = '';
  let selected: VisualSectionId = 'global';
  let imageMode = false;
  const focusAttributes = new Map<HTMLElement, string | null>();
  const originals = new Map<HTMLImageElement, OriginalImageStyle>();
  const style = doc.createElement('style'); style.id = 'ua-theme-preview-vars'; doc.head.appendChild(style);
  const outlines = doc.createElement('style'); outlines.id = 'ua-theme-editor-style';
  outlines.textContent = '[data-visual-section]{cursor:pointer} [data-visual-section]:hover:not(:has([data-visual-section]:hover)){outline:2px dashed #818cf8!important;outline-offset:-2px} [data-visual-selected="true"], [data-editor-image-selected="true"]{outline:2px solid #6366f1!important;outline-offset:-2px} [data-visual-section]:focus-visible,img[data-theme-editor-key]:focus-visible{outline:3px solid #4338ca!important;outline-offset:-3px}';
  doc.head.appendChild(outlines);
  function restore(img: HTMLImageElement) {
    const original = originals.get(img); if (!original) return;
    restoreOriginalImage(img, original);
  }
  function apply() {
    if (style.textContent !== variableCss) style.textContent = variableCss;
    let present = selected === 'global';
    for (const element of doc.querySelectorAll<HTMLElement>('[data-visual-section]')) {
      if (element.tagName && !['BUTTON','A','INPUT','SELECT','TEXTAREA'].includes(element.tagName) && !element.closest('[data-institutional-branding]')) {
        if (!focusAttributes.has(element)) focusAttributes.set(element, element.getAttribute('tabindex'));
        element.tabIndex = 0;
      }
      element.removeAttribute('data-visual-selected');
      if (element.dataset.visualSection === selected) { element.dataset.visualSelected = 'true'; present = true; }
    }
    onPresence?.(present);
    doc.querySelectorAll<HTMLImageElement>('img').forEach((img, index) => {
      if (!isLegacyEditableImage(img)) return;
      const key = stableImageKey(img); img.dataset.themeEditorKey = key; img.dataset.themeEditorLegacyKey = `image-${index}`;
      if (!focusAttributes.has(img)) focusAttributes.set(img, img.getAttribute('tabindex'));
      img.tabIndex = 0;
      const setting = findImageSetting(images, img, index);
      if (!setting) { restore(img); return; }
      if (!originals.has(img)) originals.set(img, captureOriginalImage(img));
      if (setting.src) img.src = setting.src;
      img.style.objectFit = setting.fit ?? originals.get(img)?.fit ?? '';
      img.style.objectPosition = `${setting.x}% ${setting.y}%`; img.style.transform = `scale(${setting.scale / 100})`; img.style.transformOrigin = 'center'; img.style.borderRadius = `${setting.radius}px`;
    });
  }
  function click(event: Event) {
    const target = event.target;
    if (!target || typeof (target as Element).closest !== 'function') return;
    const element = target as Element;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    const img = element.closest<HTMLImageElement>('img');
    for (const selectedImage of doc.querySelectorAll('[data-editor-image-selected]')) selectedImage.removeAttribute('data-editor-image-selected');
    if (img && (imageMode || !element.closest('[data-visual-page="product"]'))) { if (isLegacyEditableImage(img)) { img.setAttribute('data-editor-image-selected', 'true'); onImage(img.dataset.themeEditorKey || '', img.src, img.dataset.themeEditorLegacyKey); } else onContentImage?.(!!img.closest('[data-institutional-branding]'), sectionFromTarget(img) ?? undefined); return; }
    const section = sectionFromTarget(element);
    if (section) {
      const product = element.closest('[data-visual-page="product"]');
      const group = product ? element.closest('[data-page-main-image]') ? 'Imagen principal' : element.closest('[data-page-gallery],[data-page-gallery-item]') ? 'Galería' : element.closest('[data-page-price]') ? 'Precio' : element.closest('[data-page-description]') ? 'Información' : element.closest('[data-page-quantity]') ? 'Cantidad' : element.closest('select,[data-page-action="choice"]') ? 'Variantes' : undefined : section === 'productCard' ? element.closest('button,a') ? 'Botón' : element.closest('h2,h3,h4,p') ? 'Texto' : 'Contenedor' : section === 'hero' && element.closest('h1,h2,h3,p') ? 'Texto' : undefined;
      selected = product && group ? ['Variantes','Cantidad'].includes(group) ? 'pageField' : 'pageLayout' : section; apply();
      onSelect(selected, element.closest<HTMLAnchorElement>('a')?.href, group);
    }
  }
  const submit = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const keydown = (event: KeyboardEvent) => { const target = event.target as Element | null; if ((event.key === 'Enter' || event.key === ' ') && target && !['INPUT','SELECT','TEXTAREA'].includes(target.tagName)) click(event); };
  doc.addEventListener('click', click, true); doc.addEventListener('submit', submit, true);
  doc.addEventListener('keydown', keydown, true);
  const Observer = doc.defaultView?.MutationObserver;
  const observer = Observer ? new Observer(apply) : null;
  observer?.observe(doc.body, { childList: true, subtree: true });
  return {
    update(config: VisualConfig, nextImages: Record<string, ThemeImageSetting>) { effective = config; variableCss = `[data-storefront-visual]{${Object.entries(visualConfigToCssVariables(effective)).map(([key,value]) => `${key}:${value}!important;`).join('')}}`; images = nextImages; apply(); },
    imageMode(enabled: boolean) { imageMode = enabled; },
    focus(section: VisualSectionId) { selected = section; apply(); const target = doc.querySelector<HTMLElement>(`[data-visual-section="${section}"]`); target?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return !!target; },
    disconnect() { observer?.disconnect(); doc.removeEventListener('click', click, true); doc.removeEventListener('submit', submit, true); doc.removeEventListener('keydown', keydown, true); for (const img of originals.keys()) restore(img); for (const [element, tabindex] of focusAttributes) { if (tabindex === null) element.removeAttribute('tabindex'); else element.setAttribute('tabindex', tabindex); } for (const element of doc.querySelectorAll('[data-visual-selected],[data-editor-image-selected]')) { element.removeAttribute('data-visual-selected'); element.removeAttribute('data-editor-image-selected'); } style.remove(); outlines.remove(); },
  };
}
