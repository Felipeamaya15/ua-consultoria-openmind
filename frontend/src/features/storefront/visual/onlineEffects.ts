/**
 * OPENMIND_ONLINE_EFFECTS_V1
 * Proveedor web real: Magic CSS, https://github.com/miniMAC/magic (MIT).
 * El archivo remoto SOLO se analiza como datos. Nunca se inserta CSS remoto
 * completo ni JS de terceros; únicamente keyframes con propiedades permitidas.
 */
export type OnlineEffectId = `magic:${string}`;
export type ProductMotionChoice = import('./effectLibrary').MotionEffectId | OnlineEffectId;
export type ProductLightChoice = import('./effectLibrary').LightEffectId | OnlineEffectId;
export type CarouselChoice = import('./carouselTransitionLibrary').CarouselTransitionId | OnlineEffectId;
export type OnlineEffect = { id: OnlineEffectId; name: string; category: string; lightCompatible: boolean };

export const ONLINE_EFFECT_SOURCE = 'Magic CSS';
export const ONLINE_EFFECT_SOURCE_URL = 'https://github.com/miniMAC/magic';
const CSS_URL = 'https://raw.githubusercontent.com/miniMAC/magic/master/dist/magic.css';
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9]{1,47}$/;
const ID_PATTERN = /^magic:([A-Za-z][A-Za-z0-9]{1,47})$/;
const MAX_CSS_BYTES = 250000;
let pending: Promise<OnlineEffect[]> | null = null;
const definitions = new Map<string, string>();
const installed = new Set<string>();

export function isOnlineEffectId(value: unknown): value is OnlineEffectId {
  return typeof value === 'string' && ID_PATTERN.test(value);
}
export function onlineEffectName(value: string | undefined): string {
  const match = typeof value === 'string' ? ID_PATTERN.exec(value) : null;
  return match ? `om-magic-${match[1]}` : 'none';
}
export function onlineEffectAnimation(value: string | undefined, duration = 750): string {
  return isOnlineEffectId(value) ? `${onlineEffectName(value)} ${duration}ms ease-in-out both` : 'none';
}

function safeCss(property: string, input: string): string | null {
  const value = input.trim();
  if (value.length > 220 || /[;{}<>@\\]/.test(value)) return null;
  if (property === 'opacity') {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 1 && /^\d*\.?\d+$/.test(value) ? value : null;
  }
  if (property === 'filter') {
    return /^(?:none|blur\(\d{1,3}(?:\.\d{1,2})?px\))$/.test(value) ? value : null;
  }
  if (property === 'transform-origin') {
    return /^(?:(?:left|right|top|bottom|center|0|-?\d+(?:\.\d+)?(?:px|%))\s*){1,3}$/.test(value) ? value : null;
  }
  if (property === 'transform') {
    if (value === 'none') return value;
    const transformFn = /\s*(?:translate(?:3d|X|Y|Z)?|scale(?:3d|X|Y|Z)?|rotate(?:3d|X|Y|Z)?|skew(?:X|Y)?|perspective|matrix(?:3d)?)\([-+\d.,%a-zA-Z\s]+\)/gy;
    let index = 0;
    while (index < value.length) {
      transformFn.lastIndex = index;
      const match = transformFn.exec(value);
      if (!match || transformFn.lastIndex <= index) return null;
      index = transformFn.lastIndex;
    }
    return value;
  }
  return null;
}

function cleanKeyframes(rule: CSSKeyframesRule): { css: string; light: boolean } | null {
  const parts: string[] = [];
  let light = false;
  let terminalOpacity: number | null = null;
  if (rule.cssRules.length > 28) return null;
  for (let i = 0; i < rule.cssRules.length; i++) {
    const frame = rule.cssRules[i] as CSSKeyframeRule;
    const key = frame.keyText.trim();
    if (!/^(?:from|to|\d{1,3}%(?:\s*,\s*\d{1,3}%)*)$/.test(key)) return null;
    const properties: string[] = [];
    for (const property of ['opacity', 'transform', 'transform-origin', 'filter']) {
      const raw = frame.style.getPropertyValue(property);
      if (!raw) continue;
      const safe = safeCss(property, raw);
      if (safe === null) return null;
      properties.push(`${property}:${safe}`);
      if (property === 'filter') light = true;
    }
    if ((key === 'to' || key === '100%') && frame.style.getPropertyValue('opacity')) {
      terminalOpacity = Number(frame.style.getPropertyValue('opacity'));
    }
    if (properties.length > 0) parts.push(`${key}{${properties.join(';')}}`);
  }
  // No importar animaciones que hagan desaparecer las fotos al terminar.
  if (!parts.length || (terminalOpacity !== null && terminalOpacity < .5)) return null;
  const css = parts.join('');
  return css.length <= 6000 ? { css, light } : null;
}

function pretty(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}
function category(name: string): string {
  if (/flip|rotate|swash|boing|twister/i.test(name)) return 'Giros y rebotes';
  if (/puff|vanish|foolish|space|magic/i.test(name)) return 'Efectos especiales';
  if (/slide|tin|open/i.test(name)) return 'Entradas y deslizamientos';
  return 'Animaciones';
}

/** Fetch real de la biblioteca online. No lista fija de efectos. */
export async function loadOnlineEffects(): Promise<OnlineEffect[]> {
  if (pending) return pending;
  pending = (async () => {
    if (typeof CSSStyleSheet === 'undefined' || typeof document === 'undefined') {
      throw new Error('Tu navegador no admite la consulta segura de animaciones CSS.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response: Response;
    try { response = await fetch(CSS_URL, { signal: controller.signal, cache: 'default' }); }
    finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error(`El proveedor no respondió (${response.status}).`);
    const css = await response.text();
    if (css.length > MAX_CSS_BYTES) throw new Error('La biblioteca remota supera el tamaño permitido.');
    const detached = new CSSStyleSheet();
    detached.replaceSync(css); // NO se adopta ni se aplica la hoja remota.
    const results: OnlineEffect[] = [];
    definitions.clear();
    for (let i = 0; i < detached.cssRules.length; i++) {
      const rule = detached.cssRules[i];
      if (rule.type !== CSSRule.KEYFRAMES_RULE) continue;
      const frames = rule as CSSKeyframesRule;
      if (!SAFE_NAME.test(frames.name) || /Out(?:$|[A-Z])/.test(frames.name)) continue;
      const validated = cleanKeyframes(frames);
      if (!validated || definitions.has(frames.name)) continue;
      definitions.set(frames.name, validated.css);
      results.push({ id: `magic:${frames.name}`, name: pretty(frames.name), category: category(frames.name), lightCompatible: validated.light });
    }
    if (!results.length) throw new Error('El proveedor no entregó animaciones compatibles.');
    return results.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  })().catch((error: unknown) => { pending = null; throw error; });
  return pending;
}

/** Solo inyecta keyframes regenerados con propiedades y valores admitidos. */
export async function ensureOnlineEffect(value: string | undefined): Promise<boolean> {
  if (!isOnlineEffectId(value)) return false;
  const name = value.substring(6);
  if (installed.has(name)) return true;
  await loadOnlineEffects();
  const css = definitions.get(name);
  if (!css || typeof document === 'undefined') return false;
  const style = document.createElement('style');
  style.setAttribute('data-openmind-effect', name);
  style.textContent = `/* Magic CSS - Copyright (c) 2022 Christian Pucci - MIT: https://github.com/miniMAC/magic/blob/master/LICENSE */\n@keyframes ${onlineEffectName(value)}{${css}}`;
  document.head.appendChild(style);
  installed.add(name);
  return true;
}
