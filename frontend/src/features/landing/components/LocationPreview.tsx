import { useId, useState } from 'react';
import type { UbicacionLanding } from '../types/landing.types';
import { mapLocation } from '../types/mapLocation';
import './LandingDetails.css';

/** Misma dirección y destino en el panel y en las cuatro tiendas públicas. */
export function LocationPreview({ value, enabled = true }: { value: UbicacionLanding; enabled?: boolean }) {
  const location = mapLocation(value);
  const id = useId();
  const [requested, setRequested] = useState('');
  const [failed, setFailed] = useState(false);
  const showing = enabled && !!location.embed && requested === location.embed && !failed;
  return <div className="location-preview">
    {location.address && <address>{location.address}</address>}
    {!enabled ? <p>Activa Mapa / ubicación para mostrar la ubicación en tu tienda.</p> : !location.href ?
      <p>Agrega calle y comuna, comuna y región, o un enlace HTTPS válido de Google Maps. No se cargará un mapa sin destino.</p> : <>
      <div className="location-preview__actions">
        <a href={location.href} target="_blank" rel="noopener noreferrer">Abrir en Google Maps ↗</a>
        {location.embed && <button type="button" aria-expanded={showing} aria-controls={id} onClick={() => { setFailed(false); setRequested(showing ? '' : location.embed); }}>{showing ? 'Ocultar mapa' : 'Cargar vista previa del mapa'}</button>}
      </div>
      <p>{location.embed ? 'La vista previa es aproximada. Solo al cargarla se conecta con Google Maps; no solicita tu ubicación GPS.' : 'Este enlace abre Google Maps en otra pestaña. Completa la dirección para habilitar una vista previa aquí.'}</p>
      {showing && <iframe id={id} title="Mapa de ubicación del negocio" loading="lazy" referrerPolicy="no-referrer" src={location.embed} onError={() => setFailed(true)} />}
      {(showing || failed) && <p role={failed ? 'status' : undefined}>Si la vista previa no está disponible, usa «Abrir en Google Maps» para consultar la dirección.</p>}
    </>}
  </div>;
}
