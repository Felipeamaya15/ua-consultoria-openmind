import { useStore } from '../../storefront/context/StoreContext';

export type LandingSection =
  | 'Productos destacados'
  | 'Categorías'
  | 'Beneficios'
  | 'Información de contacto'
  | 'Mapa / ubicación';

export function useLandingSectionVisibility() {
  const { landing } = useStore();
  // Las configuraciones anteriores sin esta bandera conservan su visibilidad.
  return (section: LandingSection) => landing?.secciones?.[section] !== false;
}
