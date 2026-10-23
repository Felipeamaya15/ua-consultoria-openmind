import { useStore } from '../../storefront/context/StoreContext';
import { LoadingState } from '../../../shared/components/states';

// Solo informa el estado del hero; mantiene visible el resto de la plantilla.
export function LandingStatus() {
  const { landing, landingLoading, landingError, landingCatalogError } = useStore();
  if (landingLoading) return <LoadingState align="start" spacing="compact">Cargando configuración de inicio...</LoadingState>;
  if (landingError) return <p role="alert">{landingError}</p>;
  if (landingCatalogError) return <p role="alert">{landingCatalogError}</p>;
  if (!landing) return <p>La tienda todavía no tiene configuración de inicio.</p>;
  return null;
}
