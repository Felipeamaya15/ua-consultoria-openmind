import type { TemplateId } from '../data/mockData';

export const TEMPLATE_BY_NUMBER: Record<string, TemplateId> = { '1': 'editorial', '2': 'minimal', '3': 'visual', '4': 'catalog' };
export function templateFromPath(pathname: string): TemplateId | undefined {
  const match = pathname.match(/^\/plantilla\/([1-4])(?:\/|$)/);
  return match ? TEMPLATE_BY_NUMBER[match[1]] : undefined;
}

export const NUMBER_BY_TEMPLATE: Record<TemplateId, string> = { editorial: '1', minimal: '2', visual: '3', catalog: '4' };
export function templatePath(template: unknown): string {
  return `/plantilla/${typeof template === 'string' && Object.prototype.hasOwnProperty.call(NUMBER_BY_TEMPLATE, template) ? NUMBER_BY_TEMPLATE[template as TemplateId] : '1'}`;
}
