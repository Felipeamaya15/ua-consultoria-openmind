/**
 * Estados de seguimiento estandarizados (SCRUM-355 y SCRUM-356).
 *
 * Cada transportista informa sus hitos con códigos propios (EN_TRANSITO_REGIONAL,
 * EN_REPARTO_DOMICILIO, EN_DISTRIBUCION…). Esta función los traduce a las etapas que ve el
 * comprador: "En origen", "En tránsito", "En reparto" y "Entregado".
 */
export type TrackingStage = 'en_origen' | 'en_transito' | 'en_reparto' | 'entregado' | 'incidencia' | 'desconocido';

export interface TrackingStageInfo {
  stage: TrackingStage;
  label: string;
  icon: 'store' | 'truck' | 'home' | 'checkCircle' | 'clock' | 'box';
  variant: 'info' | 'success' | 'warning' | 'default';
}

type KnownStage = Exclude<TrackingStage, 'desconocido'>;

const STAGES: Record<KnownStage, Omit<TrackingStageInfo, 'stage'>> = {
  en_origen: { label: 'En origen', icon: 'store', variant: 'info' },
  en_transito: { label: 'En tránsito', icon: 'truck', variant: 'info' },
  en_reparto: { label: 'En reparto', icon: 'home', variant: 'info' },
  entregado: { label: 'Entregado', icon: 'checkCircle', variant: 'success' },
  incidencia: { label: 'Incidencia en el envío', icon: 'clock', variant: 'warning' },
};

/** Avance normal de un envío, en orden. Sirve para marcar hitos cumplidos en una línea de tiempo. */
export const TRACKING_PROGRESS: readonly TrackingStage[] = ['en_origen', 'en_transito', 'en_reparto', 'entregado'];

/** Mayúsculas, sin tildes y con "_" entre palabras: "En tránsito" y "EN-TRANSITO" dan "EN_TRANSITO". */
export function normalizeTrackingCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// El orden importa: la primera regla que coincide gana.
const RULES: Array<[RegExp, KnownStage]> = [
  // Problemas primero, para que NO_ENTREGADO nunca se lea como entregado.
  [/(^|_)(NO_ENTREGAD|DEVUELT|DEVOLUCION|EXTRAVIAD|SINIESTR|ROBAD|DANAD|RECHAZAD|INCIDENCIA|CANCELAD|ANULAD)/, 'incidencia'],
  [/(^|_)ENTREGAD[OA]($|_)/, 'entregado'],
  // Centros de distribución, hubs y terminales: el paquete sigue viajando, aún no es el reparto final.
  [/CENTRO|HUB|CLASIFICACION|TERMINAL|BODEGA|CONSOLIDACION/, 'en_transito'],
  [/(^|_)(REPARTO|DISTRIBUCION|ULTIMA_MILLA|ENTREGA|ENTREGA_FINAL)($|_)|RUTA_DE_ENTREGA/, 'en_reparto'],
  [/TRANSITO|TRASLADO|EN_RUTA|EN_VIAJE|EN_CAMINO|DESPACHAD|ENVIAD|INTERURBANO|REGIONAL/, 'en_transito'],
  [/ORIGEN|CREAD|EMITID|RECEPCION|INGRESO|ADMITID|ADMISION|RETIRAD|RECOLECTAD|REGISTRAD|ETIQUETA/, 'en_origen'],
];

/** "EN_ALGO_RARO" -> "En algo raro": un estado desconocido nunca se muestra como código crudo. */
function humanize(raw: string): string {
  const text = raw.replace(/[_\-\s]+/g, ' ').trim().toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

export function describeTrackingState(raw: unknown): TrackingStageInfo {
  const code = normalizeTrackingCode(raw);
  for (const [pattern, stage] of RULES) {
    if (pattern.test(code)) return { stage, ...STAGES[stage] };
  }
  const label = typeof raw === 'string' ? humanize(raw) : '';
  return { stage: 'desconocido', label: label || 'Estado no disponible', icon: 'box', variant: 'default' };
}

export const trackingStageOf = (raw: unknown): TrackingStage => describeTrackingState(raw).stage;

/** Posición en TRACKING_PROGRESS (0 = En origen … 3 = Entregado); -1 si no es un hito del avance normal. */
export const trackingProgressIndex = (raw: unknown): number => TRACKING_PROGRESS.indexOf(trackingStageOf(raw));
