import { useLocation } from 'react-router-dom';
import type { TemplateId } from '../data/mockData';
import { useStore } from '../context/StoreContext';
import { NUMBER_BY_TEMPLATE, previewPathFromPathname } from '../visual/templates';
import { VISUAL_PRESETS } from '../visual/presets';

export type StorefrontTemplate = TemplateId;

export function useStorefrontTemplate() {
  const { pathname } = useLocation();
  const store = useStore();
  const preview = previewPathFromPathname(pathname);
  const storeTemplate: TemplateId =
    store?.activeTemplate ??
    (['editorial', 'minimal', 'visual', 'catalog'].includes(String(store?.config?.template))
      ? (store.config.template as TemplateId)
      : 'editorial');

  const template: TemplateId = preview?.template ?? storeTemplate;
  const basePath = preview?.isProtectedPreview ? preview.basePath : '/';
  const templateNumber = NUMBER_BY_TEMPLATE[template] as '1' | '2' | '3' | '4';
  const templateName = VISUAL_PRESETS[template].name;

  const route = (path = '') => {
    const cleanPath = path.replace(/^\/+/, '');
    if (!cleanPath) {
      return basePath;
    }
    return basePath === '/' ? `/${cleanPath}` : `${basePath}/${cleanPath}`;
  };

  return {
    template,
    templateName,
    templateNumber,
    basePath,
    route,
    isEditorial: template === 'editorial',
    isMinimal: template === 'minimal',
    isVisual: template === 'visual',
    isCatalog: template === 'catalog',
  };
}
