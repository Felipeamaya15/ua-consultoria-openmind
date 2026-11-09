/**
 * OpenMind · intercambio seguro de presets (versión 1).
 * Importa RECETAS de efectos ya admitidos, nunca CSS, HTML ni JavaScript.
 * Los datos validados se guardan en la apariencia compartida de las 4 plantillas.
 */
import { isCarouselTransitionId, type CarouselTransitionId } from './carouselTransitionLibrary';
import { MOVEMENT_EFFECTS, LIGHT_EFFECTS, type MotionEffectId, type LightEffectId } from './effectLibrary';

export type ImportedCarouselPreset = {
  id: string;
  name: string;
  kind: 'carousel';
  settings: {
    mode: 'static' | 'manual' | 'automatic';
    interval: 5 | 10 | 20;
    transition: CarouselTransitionId;
    indicators: boolean;
  };
};

export type ImportedProductPreset = {
  id: string;
  name: string;
  kind: 'product';
  settings: { motion: MotionEffectId; light: LightEffectId };
};

export type ImportedEffectPreset = ImportedCarouselPreset | ImportedProductPreset;
export const MAX_IMPORTED_PRESETS = 16;
export const MAX_IMPORT_BYTES = 12 * 1024;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function nameValue(value: unknown): string {
  if (typeof value !== 'string') throw new Error('El nombre del efecto debe ser texto.');
  const name = value.trim();
  if (name.length < 3 || name.length > 60 || /[<>\u0000-\u001f\u007f]/.test(name)) {
    throw new Error('El nombre debe tener entre 3 y 60 caracteres y no contener etiquetas.');
  }
  return name;
}

function normalizePreset(input: unknown, id: string): ImportedEffectPreset {
  if (!record(input) || input.format !== 'openmind-effect-preset' || input.version !== 1 ||
      !onlyKeys(input, ['format', 'version', 'name', 'kind', 'settings', 'id'])) {
    throw new Error('Formato no compatible. Se requiere openmind-effect-preset, versión 1.');
  }
  const name = nameValue(input.name);
  if (!record(input.settings)) throw new Error('El archivo no contiene una configuración válida.');
  const settings = input.settings;
  if (input.kind === 'carousel') {
    if (!onlyKeys(settings, ['mode', 'interval', 'transition', 'indicators']) ||
        !['static', 'manual', 'automatic'].includes(String(settings.mode)) ||
        ![5, 10, 20].includes(settings.interval as number) ||
        typeof settings.transition !== 'string' || !isCarouselTransitionId(settings.transition) ||
        typeof settings.indicators !== 'boolean') {
      throw new Error('La transición o los ajustes del carrusel no están admitidos.');
    }
    return { id, name, kind: 'carousel', settings: {
      mode: settings.mode as ImportedCarouselPreset['settings']['mode'],
      interval: settings.interval as 5 | 10 | 20,
      transition: settings.transition,
      indicators: settings.indicators,
    } };
  }
  if (input.kind === 'product') {
    if (!onlyKeys(settings, ['motion', 'light']) ||
        typeof settings.motion !== 'string' || typeof settings.light !== 'string' ||
        !MOVEMENT_EFFECTS.some(value => value.id === settings.motion) ||
        !LIGHT_EFFECTS.some(value => value.id === settings.light)) {
      throw new Error('El movimiento o efecto de luz no está admitido.');
    }
    return { id, name, kind: 'product', settings: {
      motion: settings.motion as MotionEffectId,
      light: settings.light as LightEffectId,
    } };
  }
  throw new Error('Tipo de preset desconocido. Usa carousel o product.');
}

/** Texto proporcionado por el emprendedor; no ejecutamos ni interpretamos código. */
export function importEffectPreset(source: string): ImportedEffectPreset {
  if (new TextEncoder().encode(source).length > MAX_IMPORT_BYTES) {
    throw new Error('El archivo JSON supera el límite de 12 KB.');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(source); }
  catch { throw new Error('No se pudo leer el JSON. Comprueba su sintaxis.'); }
  return normalizePreset(parsed, crypto.randomUUID());
}

/**
 * Al leer datos guardados volvemos a validar TODO el contenido.
 * Se admite una librería vacía cuando una tienda todavía no ha importado presets.
 */
export function readImportedPresets(serialized: string | undefined): ImportedEffectPreset[] {
  if (!serialized || serialized.length > 24000) return [];
  try {
    const values: unknown = JSON.parse(serialized);
    if (!Array.isArray(values) || values.length > MAX_IMPORTED_PRESETS) return [];
    const found = new Set<string>();
    return values.flatMap((value): ImportedEffectPreset[] => {
      if (!record(value) || typeof value.id !== 'string' ||
          !/^[a-f0-9-]{36}$/i.test(value.id) || found.has(value.id)) return [];
      try {
        const preset = normalizePreset({ ...value, format: 'openmind-effect-preset', version: 1 }, value.id);
        found.add(value.id);
        return [preset];
      } catch { return []; }
    });
  } catch { return []; }
}

export function addImportedPreset(serialized: string | undefined, preset: ImportedEffectPreset): string {
  const current = readImportedPresets(serialized);
  if (current.length >= MAX_IMPORTED_PRESETS) throw new Error('Máximo 16 efectos importados. Elimina uno para continuar.');
  return JSON.stringify([...current, preset]);
}

export function removeImportedPreset(serialized: string | undefined, id: string): string {
  return JSON.stringify(readImportedPresets(serialized).filter(item => item.id !== id));
}
