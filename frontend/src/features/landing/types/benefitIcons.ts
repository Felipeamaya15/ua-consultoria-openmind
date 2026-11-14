/** Códigos aceptados por BeneficioSerializer y el juego compartido de iconos. */
export const BENEFIT_ICONS = {
  truck: 'Envío', lock: 'Protección', return: 'Devoluciones', chat: 'Atención',
  store: 'Retiro en tienda', leaf: 'Sostenibilidad', gift: 'Regalo',
  checkCircle: 'Calidad', hand: 'Artesanía', book: 'Educación', heart: 'Bienestar', clock: 'Atención a tiempo',
} as const;
export type BenefitIcon = keyof typeof BENEFIT_ICONS;
export function benefitIcon(value: unknown): BenefitIcon {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BENEFIT_ICONS, value) ? value as BenefitIcon : 'truck';
}
