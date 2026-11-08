/**
 * Biblioteca cerrada de transiciones para las portadas OpenMind.
 * Las IDs están validadas; NO se ejecuta código CSS o JS importado por usuarios.
 * El carrusel público, el editor y el guardado comparten estos identificadores.
 */
export type CarouselTransitionId =
  | 'fade' | 'slide' | 'zoom' | 'blur' | 'rise' | 'reveal'
  | 'curtain' | 'curtain-up' | 'drop' | 'flip'
  | 'diagonal' | 'bounce' | 'spin' | 'zoom-blur';

export type CarouselTransitionOption = {
  id: CarouselTransitionId;
  title: string;
  description: string;
  keywords: string;
  category: 'Esenciales' | 'Movimiento' | 'Revelación';
};

export const CAROUSEL_TRANSITIONS: readonly CarouselTransitionOption[] = [
  { id: 'fade', title: 'Fundido', description: 'Una imagen aparece suavemente.', keywords: 'opacidad desvanecer fade', category: 'Esenciales' },
  { id: 'slide', title: 'Deslizar', description: 'Entra desde la derecha.', keywords: 'horizontal lado movimiento', category: 'Esenciales' },
  { id: 'zoom', title: 'Zoom', description: 'Acercamiento al cambiar.', keywords: 'ampliar acercamiento escala', category: 'Esenciales' },
  { id: 'blur', title: 'Enfoque', description: 'De borroso a nítido.', keywords: 'blur desenfoque nitidez', category: 'Esenciales' },
  { id: 'rise', title: 'Ascenso', description: 'Entra suavemente desde abajo.', keywords: 'subir vertical', category: 'Esenciales' },
  { id: 'reveal', title: 'Revelar', description: 'Barrido de izquierda a derecha.', keywords: 'cortina barrido', category: 'Esenciales' },
  { id: 'curtain', title: 'Cortina inversa', description: 'Revela la fotografía desde la derecha.', keywords: 'barrido wipe izquierda', category: 'Revelación' },
  { id: 'curtain-up', title: 'Cortina vertical', description: 'Descubre la imagen de abajo hacia arriba.', keywords: 'wipe vertical subir', category: 'Revelación' },
  { id: 'drop', title: 'Descenso', description: 'La nueva imagen entra desde arriba.', keywords: 'caer bajar vertical', category: 'Movimiento' },
  { id: 'flip', title: 'Volteo 3D', description: 'Entrada girando sobre el eje vertical.', keywords: 'giro perspectiva flip', category: 'Movimiento' },
  { id: 'diagonal', title: 'Diagonal', description: 'La imagen aparece desde una esquina.', keywords: 'deslizar esquina traslación', category: 'Movimiento' },
  { id: 'bounce', title: 'Rebote suave', description: 'La imagen entra con un rebote ligero.', keywords: 'elástico salto resorte', category: 'Movimiento' },
  { id: 'spin', title: 'Giro suave', description: 'Rotación leve durante el cambio.', keywords: 'rotar girar espiral', category: 'Movimiento' },
  { id: 'zoom-blur', title: 'Zoom y enfoque', description: 'Acercamiento con desenfoque inicial.', keywords: 'blur escala acercar enfoque', category: 'Revelación' },
];

export function isCarouselTransitionId(value: string): value is CarouselTransitionId {
  return CAROUSEL_TRANSITIONS.some(effect => effect.id === value);
}

export function carouselTransitionById(value: string): CarouselTransitionOption | undefined {
  return CAROUSEL_TRANSITIONS.find(effect => effect.id === value);
}
