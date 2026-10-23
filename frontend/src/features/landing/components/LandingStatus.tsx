import { useStore } from '../../storefront/context/StoreContext';
import { ErrorState, LoadingState } from '../../../shared/components/states';

// Solo informa el estado del hero; mantiene visible el resto de la plantilla.
export function LandingStatus() {
  const { landing, landingLoading, landingError, landingCatalogError } = useStore();
  if (landingLoading) return <LoadingState align="start" spacing="compact">Cargando configuración de inicio...</LoadingState>;
  if (landingError) return <ErrorState>{landingError}</ErrorState>;
  if (landingCatalogError) return <ErrorState>{landingCatalogError}</ErrorState>;
  if (!landing) return <p>La tienda todavía no tiene configuración de inicio.</p>;
  return null;
}
