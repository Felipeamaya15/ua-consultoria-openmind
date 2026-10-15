import { comunasDeRegion } from '../../storefront/data/comunasChile';

export const PICKUP_DAYS = [
  ['mon', 'Lunes'], ['tue', 'Martes'], ['wed', 'Miércoles'], ['thu', 'Jueves'],
  ['fri', 'Viernes'], ['sat', 'Sábado'], ['sun', 'Domingo'],
] as const;
export type PickupDay = typeof PICKUP_DAYS[number][0];
export interface PickupLocation { region: string; comuna: string; street: string; number: string; reference: string; verification: string }
export interface PickupConfiguration {
  enabled: boolean; address: string; schedule: string;
  version?: 2; location?: PickupLocation;
  hours?: Record<PickupDay, { enabled: boolean; start: string; end: string }>;
  legacy_address?: string; legacy_schedule?: string;
  /** Procedencia calculada por el servidor; manual no significa verificada por Google. */
  validation_method?: 'manual' | 'google' | 'unverified';
}
export const emptyLocation = (): PickupLocation => ({ region: '', comuna: '', street: '', number: '', reference: '', verification: '' });
export function structuredPickup(value: PickupConfiguration): PickupConfiguration & { location: PickupLocation; hours: NonNullable<PickupConfiguration['hours']> } {
  return { ...value, version: 2,
    ...(value.version !== 2 ? { legacy_address: value.address, legacy_schedule: value.schedule } : {}),
    location: { ...emptyLocation(), ...value.location },
    hours: Object.fromEntries(PICKUP_DAYS.map(([day]) => [day, { enabled: false, start: '', end: '', ...value.hours?.[day] }])) as NonNullable<PickupConfiguration['hours']>,
  };
}
export function groupPickupHours(hours: PickupConfiguration['hours']): string {
  if (!hours) return '';
  const groups = new Map<string, string[]>(), closed: string[] = [];
  for (const [day, label] of PICKUP_DAYS) {
    const row = hours[day];
    if (!row?.enabled) { closed.push(label); continue; }
    const key = `${row.start} a ${row.end}`;
    groups.set(key, [...(groups.get(key) || []), label]);
  }
  return [...Array.from(groups, ([time, labels]) => `${labels.join(', ')}: ${time}`), ...(closed.length ? [`${closed.join(', ')}: cerrado`] : [])].join('; ');
}
export function validatePickup(value: PickupConfiguration, requireExternal = true): Record<string, string> {
  if (!value.enabled) return {};
  if (value.version !== 2) return value.address.trim() && value.schedule.trim() ? {} : { 'location.verification': 'Completa la dirección y los horarios de retiro.' };
  const errors: Record<string, string> = {}, location = value.location || emptyLocation();
  for (const key of ['region', 'comuna', 'street'] as const) if (!location[key].trim()) errors[`location.${key}`] = 'Este campo es obligatorio.';
  if (location.region && location.comuna && !comunasDeRegion(location.region).includes(location.comuna)) errors['location.comuna'] = 'Selecciona una comuna de la región elegida.';
  if (!location.verification && requireExternal) errors['location.verification'] = 'Busca y selecciona una dirección reconocida.';
  if (!location.number.trim() && (!location.verification || value.validation_method === 'manual')) errors['location.number'] = 'Indica numeración o selecciona un establecimiento reconocido sin número.';
  let active = false;
  for (const [day] of PICKUP_DAYS) {
    const row = value.hours?.[day];
    if (!row?.enabled) continue;
    active = true;
    for (const key of ['start', 'end'] as const) if (!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(row[key])) errors[`hours.${day}.${key}`] = 'Indica una hora válida.';
    if (row.start && row.end && row.end <= row.start) errors[`hours.${day}.end`] = 'El término debe ser posterior al inicio.';
  }
  if (!active) errors.hours = 'Habilita al menos un día de retiro.';
  return errors;
}
