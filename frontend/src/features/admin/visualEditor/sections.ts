import { VISUAL_SECTION, type VisualSectionId } from '../../storefront/visual/sectionIds';
export type { VisualSectionId } from '../../storefront/visual/sectionIds';
export const VISUAL_SECTIONS = [
  [VISUAL_SECTION.global, 'Estilo general'], [VISUAL_SECTION.topBar, 'Barra superior'], [VISUAL_SECTION.header, 'Encabezado'],
  [VISUAL_SECTION.hero, 'Banner principal'], [VISUAL_SECTION.heroCta, 'Botón principal'], [VISUAL_SECTION.categories, 'Categorías'],
  [VISUAL_SECTION.productGrid, 'Distribución de productos'], [VISUAL_SECTION.productCard, 'Tarjeta de producto'],
  [VISUAL_SECTION.sections, 'Secciones generales'], [VISUAL_SECTION.contact, 'Contacto'], [VISUAL_SECTION.location, 'Ubicación'],
  [VISUAL_SECTION.footer, 'Pie de página'], [VISUAL_SECTION.catalog, 'Catálogo'],
  [VISUAL_SECTION.pageLayout, 'Diseño de esta página'], [VISUAL_SECTION.pagePanel, 'Cajas y formularios'],
  [VISUAL_SECTION.pageField, 'Campos del formulario'], [VISUAL_SECTION.pageButton, 'Botones de esta página'],
] as const;
export function isVisualSection(value: unknown): value is VisualSectionId {
  return VISUAL_SECTIONS.some(([id]) => id === value);
}
export function sectionFromTarget(target: Element): VisualSectionId | null {
  const page = target.closest('[data-visual-page]');
  if (page) {
    if (target.closest('input,select,textarea')) return VISUAL_SECTION.pageField;
    if (target.closest('button[type="submit"],[data-page-action="primary"],a[data-page-action="outline"]')) return VISUAL_SECTION.pageButton;
    if (target.closest('[data-page-panel]')) return VISUAL_SECTION.pagePanel;
    if (target.closest('form')) return VISUAL_SECTION.pagePanel;
  }
  let element = target.closest('[data-visual-section]');
  while (element?.getAttribute('data-visual-section')?.startsWith('page') && !page) element = element.parentElement?.closest('[data-visual-section]') ?? null;
  const value = element?.getAttribute('data-visual-section');
  return isVisualSection(value) ? value : null;
}
