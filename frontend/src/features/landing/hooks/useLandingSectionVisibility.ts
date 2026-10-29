import { useStore } from '../../storefront/context/StoreContext';

export type LandingSection =
  | 'Productos destacados'
  | 'Categorías'
  | 'Beneficios'
  | 'Información de contacto'
  | 'Mapa / ubicación'
  | 'Horarios de atención';

export function useLandingSectionVisibility() {
  const { landing } = useStore();
  // Las configuraciones anteriores sin esta bandera conservan su visibilidad.
  return (section: LandingSection) => section === 'Horarios de atención' && landing?.secciones?.[section] === undefined ? landing?.secciones?.['Información de contacto'] !== false : landing?.secciones?.[section] !== false;
}
