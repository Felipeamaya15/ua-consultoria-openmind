import TimePicker from '../../../../shared/components/TimePicker';
import type { PickupConfiguration } from '../../../admin/services/pickupConfiguration';
import { pickupTimes, pickupToday, pickupSelectionLabel, type PickupSelection } from '../../services/pickupSchedule';

export function PickupSelectionSummary({ selection }: { selection: unknown }) {
  if (!selection || typeof selection !== 'object' || !('fecha' in selection) || !('hora' in selection)
    || typeof selection.fecha !== 'string' || typeof selection.hora !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(selection.fecha) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(selection.hora)) return null;
  return <p className="text-sm mt-2">Retiro: {pickupSelectionLabel({ fecha: selection.fecha, hora: selection.hora })}</p>;
}

export default function PickupSchedule({ pickup, value, onChange, error }: {
  pickup: PickupConfiguration; value: PickupSelection; onChange: (value: PickupSelection) => void; error?: string;
}) {
  const times = pickupTimes(pickup, value.fecha);
  return <section aria-label="Seleccionar horario de retiro" className="border-t border-[var(--border)] pt-4 mt-3 space-y-3">
    <h3 className="font-semibold text-sm">Elige cuándo retirar tu pedido</h3>
    <p className="text-xs">Selecciona una fecha y una hora dentro del horario del local. Hora de Chile.</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="text-sm font-medium" htmlFor="pickup-date">Fecha de retiro<input id="pickup-date" type="date" lang="es-CL" min={pickupToday()} value={value.fecha}
        className="block w-full min-h-11 rounded-lg border border-[var(--border)] bg-[var(--input-background,white)] px-3 py-2 mt-2"
        onChange={event => onChange({ fecha: event.target.value, hora: '' })} /></label>
      <TimePicker id="pickup-selected" label="Hora de retiro" value={times.includes(value.hora) ? value.hora : ''} times={times}
        onChange={hora => onChange({ ...value, hora })} />
    </div>
    {value.fecha && !times.length && <p role="status" className="text-sm">No hay horarios disponibles para este día. Selecciona otra fecha.</p>}
    {times.includes(value.hora) && <p role="status" className="text-sm font-semibold">Retiro: {pickupSelectionLabel(value)}</p>}
    {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
  </section>;
}
