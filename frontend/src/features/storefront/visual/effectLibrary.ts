/**
 * Biblioteca local de efectos seguros para fotografías de productos.
 * Solo se admiten identificadores de esta lista; no se ejecuta CSS ni JS externo.
 */
export type MotionEffectId =
  | 'none' | 'zoom' | 'lift' | 'tilt' | 'rotate'
  | 'pop' | 'slide' | 'lean' | 'shrink';

export type LightEffectId =
  | 'none' | 'shine' | 'flash' | 'glow' | 'sparkle'
  | 'beam' | 'pulse' | 'border' | 'twinkle';

export type EffectOption<Id extends string> = {
  id: Id;
  label: string;
  description: string;
  keywords: string;
};

export const MOVEMENT_EFFECTS: ReadonlyArray<EffectOption<MotionEffectId>> = [
  { id: 'none', label: 'Ninguno', description: 'Imagen sin movimiento adicional.', keywords: 'desactivar quieto estático normal' },
  { id: 'zoom', label: 'Acercamiento suave', description: 'La fotografía se acerca ligeramente.', keywords: 'zoom agrandar ampliar' },
  { id: 'lift', label: 'Elevación', description: 'La imagen sube con una pequeña ampliación.', keywords: 'subir flotar elevar' },
  { id: 'tilt', label: 'Inclinación 3D', description: 'Inclinación con perspectiva suave.', keywords: 'perspectiva tres dimensiones' },
  { id: 'rotate', label: 'Giro leve', description: 'La imagen gira unos grados.', keywords: 'rotación girar' },
  { id: 'pop', label: 'Salto visual', description: 'Acercamiento más marcado al pasar el mouse.', keywords: 'pop resaltar ampliar' },
  { id: 'slide', label: 'Desplazar a la derecha', description: 'La imagen se mueve lateralmente.', keywords: 'deslizar movimiento horizontal' },
  { id: 'lean', label: 'Inclinar a la izquierda', description: 'Giro suave hacia el lado opuesto.', keywords: 'inclinar balanceo diagonal' },
  { id: 'shrink', label: 'Alejamiento', description: 'La fotografía se reduce ligeramente.', keywords: 'reducir pequeño alejar' },
];

export const LIGHT_EFFECTS: ReadonlyArray<EffectOption<LightEffectId>> = [
  { id: 'none', label: 'Ninguno', description: 'Sin iluminación adicional.', keywords: 'desactivar normal' },
  { id: 'shine', label: 'Barrido de luz', description: 'Un reflejo cruza la fotografía.', keywords: 'brillo reflejo barrido' },
  { id: 'flash', label: 'Destello', description: 'Flash blanco breve y suave.', keywords: 'ráfaga luz flash' },
  { id: 'glow', label: 'Resplandor', description: 'Halo blanco sobre los bordes, sin teñir la imagen.', keywords: 'brillo contorno halo blanco' },
  { id: 'sparkle', label: 'Brillos puntuales', description: 'Destellos pequeños distribuidos en la fotografía.', keywords: 'puntos estrellas brillo' },
  { id: 'beam', label: 'Haz de luz', description: 'Una franja de luz recorre la fotografía.', keywords: 'rayo reflejo recorrido' },
  { id: 'pulse', label: 'Pulso luminoso', description: 'Una iluminación suave aparece y desaparece.', keywords: 'respirar iluminar latido' },
  { id: 'border', label: 'Borde luminoso', description: 'Se ilumina el marco de la imagen sin cubrirla.', keywords: 'contorno blanco marco' },
  { id: 'twinkle', label: 'Estrellas', description: 'Puntos luminosos que centellean suavemente.', keywords: 'chispa destellos partículas' },
];

export function motionTransform(motion: MotionEffectId | string | undefined): string {
  switch (motion) {
    case 'zoom': return 'scale(1.075)';
    case 'lift': return 'translateY(-9px) scale(1.025)';
    case 'tilt': return 'perspective(850px) rotateY(5deg) rotateX(2deg) scale(1.045)';
    case 'rotate': return 'rotate(2.5deg) scale(1.06)';
    case 'pop': return 'scale(1.12)';
    case 'slide': return 'translateX(12px) scale(1.045)';
    case 'lean': return 'rotate(-4deg) scale(1.055)';
    case 'shrink': return 'scale(.94)';
    default: return 'none';
  }
}

export type LightStyle = { animation: string; background: string };

export function lightStyle(effect: LightEffectId | string | undefined): LightStyle {
  switch (effect) {
    case 'shine': return { animation: 'om-product-shine 850ms ease-out 1', background: 'linear-gradient(105deg, transparent 25%, rgba(255,255,255,.55) 50%, transparent 75%)' };
    case 'flash': return { animation: 'om-product-flash 700ms ease-out 1', background: 'rgba(255,255,255,.55)' };
    case 'glow': return { animation: 'om-product-glow 1100ms ease-in-out infinite alternate', background: 'linear-gradient(90deg, rgba(255,255,255,.35), transparent 12%, transparent 88%, rgba(255,255,255,.35)), linear-gradient(180deg, rgba(255,255,255,.28), transparent 12%, transparent 88%, rgba(255,255,255,.28))' };
    case 'sparkle': return { animation: 'om-product-sparkle 950ms ease-in-out infinite alternate', background: 'radial-gradient(circle at 18% 24%, white 0 3px,transparent 6px),radial-gradient(circle at 72% 48%,white 0 2px,transparent 5px),radial-gradient(circle at 54% 78%,white 0 3px,transparent 7px),radial-gradient(circle at 88% 16%,white 0 2px,transparent 5px)' };
    case 'beam': return { animation: 'om-product-beam 950ms ease-in-out 1', background: 'linear-gradient(100deg, transparent 25%, rgba(255,255,255,.65) 48%, rgba(255,255,255,.10) 56%, transparent 75%)' };
    case 'pulse': return { animation: 'om-product-pulse 1150ms ease-in-out infinite alternate', background: 'rgba(255,255,255,.45)' };
    case 'border': return { animation: 'om-product-border 1200ms ease-in-out infinite alternate', background: 'transparent' };
    case 'twinkle': return { animation: 'om-product-twinkle 1050ms ease-in-out infinite alternate', background: 'radial-gradient(circle at 14% 30%,white 0 3px,transparent 7px),radial-gradient(circle at 38% 67%,white 0 3px,transparent 7px),radial-gradient(circle at 68% 21%,white 0 2px,transparent 6px),radial-gradient(circle at 82% 75%,white 0 3px,transparent 7px),radial-gradient(circle at 54% 49%,white 0 2px,transparent 6px)' };
    default: return { animation: 'none', background: 'transparent' };
  }
}
