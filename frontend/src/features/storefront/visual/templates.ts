import type { TemplateId } from '../data/mockData';

export const TEMPLATE_BY_NUMBER: Record<string, TemplateId> = { '1': 'editorial', '2': 'minimal', '3': 'visual', '4': 'catalog' };
export function templateFromPath(pathname: string): TemplateId | undefined {
  const match = pathname.match(/^\/plantilla\/([1-4])(?:\/|$)/);
  return match ? TEMPLATE_BY_NUMBER[match[1]] : undefined;
}
