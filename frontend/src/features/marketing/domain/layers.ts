export const MAX_LAYERS = 12;
export const LAYER_KINDS = ['text', 'rectangle', 'circle', 'line', 'photo'] as const;
export type LayerKind = typeof LAYER_KINDS[number];
export interface FreeLayer {
  id: string; kind: LayerKind; text: string; color: string; x: number; y: number;
  width: number; height: number; rotation: number; opacity: number; fontSize: number;
  bold: boolean; locked: boolean; imageIndex: number;
}
const number = (v: unknown, min: number, max: number, fallback: number) => Math.min(max, Math.max(min, typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback));
export function normalizeLayers(value: unknown): FreeLayer[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: FreeLayer[] = [];
  for (const raw of value.slice(0, MAX_LAYERS)) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^[a-z0-9-]{8,80}$/i.test(raw.id) || seen.has(raw.id) || !LAYER_KINDS.includes(raw.kind)) continue;
    seen.add(raw.id);
    const width = number(raw.width, 4, 100, 25), height = number(raw.height, 2, 100, 12);
    result.push({ id: raw.id, kind: raw.kind, text: typeof raw.text === 'string' ? raw.text.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80) : '',
      color: typeof raw.color === 'string' && /^#[a-f\d]{6}$/i.test(raw.color) ? raw.color : '#ffffff',
      x: number(raw.x, 0, 100-width, 5), y: number(raw.y, 0, 100-height, 20), width, height,
      rotation: number(raw.rotation, -180, 180, 0), opacity: number(raw.opacity, 10, 100, 100), fontSize: number(raw.fontSize, 1, 12, 4),
      bold: raw.bold === true, locked: raw.locked === true, imageIndex: number(raw.imageIndex, 0, 9999, 0) });
  }
  return result;
}
export function newLayer(kind: LayerKind, color: string, imageIndex = 0): FreeLayer {
  const id = globalThis.crypto?.randomUUID?.() || `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, kind, text: kind === 'text' ? 'Descubre nuestra colección' : '', color, x: 5, y: 22,
    width: kind === 'text' ? 46 : 26, height: kind === 'line' ? 2 : kind === 'text' ? 12 : 20,
    rotation: 0, opacity: 100, fontSize: 4, bold: true, locked: false, imageIndex };
}
