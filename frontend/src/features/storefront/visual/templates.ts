import type { TemplateId } from '../data/mockData';

export const TEMPLATE_BY_NUMBER: Record<string, TemplateId> = {
  '1': 'editorial',
  '2': 'minimal',
  '3': 'visual',
  '4': 'catalog',
};

export const NUMBER_BY_TEMPLATE: Record<TemplateId, string> = {
  editorial: '1',
  minimal: '2',
  visual: '3',
  catalog: '4',
};

export function normalizeTemplateId(value: unknown): TemplateId | undefined {
  if (typeof value === 'number' && Object.prototype.hasOwnProperty.call(TEMPLATE_BY_NUMBER, String(value))) {
    return TEMPLATE_BY_NUMBER[String(value)];
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (Object.prototype.hasOwnProperty.call(NUMBER_BY_TEMPLATE, trimmed)) {
    return trimmed as TemplateId;
  }
  if (Object.prototype.hasOwnProperty.call(TEMPLATE_BY_NUMBER, trimmed)) {
    return TEMPLATE_BY_NUMBER[trimmed];
  }
  return undefined;
}

export function previewPathFromPathname(
  pathname: string,
): { template: TemplateId; basePath: string; isProtectedPreview: boolean } | undefined {
  const protectedMatch = pathname.match(
    /^(\/(?:admin|emprendedor)\/preview\/plantilla\/([1-4]|editorial|minimal|visual|catalog))(?:\/|$)/,
  );
  if (protectedMatch) {
    const template = normalizeTemplateId(protectedMatch[2]);
    if (template) {
      return { template, basePath: protectedMatch[1], isProtectedPreview: true };
    }
  }
  const legacyMatch = pathname.match(/^(\/plantilla\/([1-4]|editorial|minimal|visual|catalog))(?:\/|$)/);
  if (legacyMatch) {
    const template = normalizeTemplateId(legacyMatch[2]);
    if (template) {
      return { template, basePath: '/', isProtectedPreview: false };
    }
  }
  return undefined;
}

export function templateFromPath(pathname: string): TemplateId | undefined {
  return previewPathFromPathname(pathname)?.template;
}

export function adminPreviewTemplatePath(template: unknown): string {
  const normalized = normalizeTemplateId(template) ?? 'editorial';
  return `/admin/preview/plantilla/${NUMBER_BY_TEMPLATE[normalized]}`;
}

export function templatePath(_template?: unknown): string {
  return '/';
}
