import { useLocation } from 'react-router-dom';
import type { TemplateId } from '../data/mockData';
import { TEMPLATE_BY_NUMBER } from '../visual/templates';
import { VISUAL_PRESETS } from '../visual/presets';

export type StorefrontTemplate = TemplateId;

const TEMPLATE_CONFIG = {
  '1': {
    template: TEMPLATE_BY_NUMBER['1'],
    name: VISUAL_PRESETS.editorial.name,
    basePath: '/plantilla/1',
  },
  '2': {
    template: TEMPLATE_BY_NUMBER['2'],
    name: VISUAL_PRESETS.minimal.name,
    basePath: '/plantilla/2',
  },
  '3': {
    template: TEMPLATE_BY_NUMBER['3'],
    name: VISUAL_PRESETS.visual.name,
    basePath: '/plantilla/3',
  },
  '4': {
    template: TEMPLATE_BY_NUMBER['4'],
    name: VISUAL_PRESETS.catalog.name,
    basePath: '/plantilla/4',
  },
} as const;

export function useStorefrontTemplate() {
  const { pathname } = useLocation();

  const match = pathname.match(/^\/plantilla\/([1-4])(?:\/|$)/);

  const templateNumber =
    match?.[1] && match[1] in TEMPLATE_CONFIG
      ? (match[1] as keyof typeof TEMPLATE_CONFIG)
      : '1';

  const config = TEMPLATE_CONFIG[templateNumber];

  /**
   * Genera una ruta que permanece dentro de la plantilla actual.
   *
   * Ejemplo:
   * route('producto/1')
   *
   * En plantilla 1:
   * /plantilla/1/producto/1
   *
   * En plantilla 2:
   * /plantilla/2/producto/1
   */
  const route = (path = '') => {
    const cleanPath = path.replace(/^\/+/, '');

    return cleanPath
      ? `${config.basePath}/${cleanPath}`
      : config.basePath;
  };

  return {
    template: config.template,
    templateName: config.name,
    templateNumber,
    basePath: config.basePath,
    route,
    isEditorial: config.template === 'editorial',
    isMinimal: config.template === 'minimal',
    isVisual: config.template === 'visual',
    isCatalog: config.template === 'catalog',
  };

}
