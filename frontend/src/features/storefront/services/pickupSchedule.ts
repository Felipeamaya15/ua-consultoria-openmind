import type { PickupConfiguration, PickupDay } from '../../admin/services/pickupConfiguration';
import { businessDateParts, formatBusinessDate } from '../../admin/services/businessTime';

export interface PickupSelection { fecha: string; hora: string }
const days: PickupDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const calendarMinutes = new Map<string, string[]>();
function minutesInChile(date: string): string[] {
  if (calendarMinutes.has(date)) return calendarMinutes.get(date)!;
  const start = Date.parse(`${date}T00:00:00Z`), minutes = new Set<string>();
  for (let i = 0; i < 48 * 60; i++) {
    const p = businessDateParts(new Date(start + i * 60000).toISOString())!;
    if (`${p.year}-${p.month}-${p.day}` === date) minutes.add(`${p.hour}:${p.minute}`);
  }
  const result = [...minutes].sort();
  if (calendarMinutes.size >= 16) calendarMinutes.delete(calendarMinutes.keys().next().value!);
  calendarMinutes.set(date, result);
  return result;
}
export function pickupToday(now = new Date()): string {
  const p = businessDateParts(now.toISOString())!;
  return `${p.year}-${p.month}-${p.day}`;
}
export function pickupTimes(pickup: PickupConfiguration, date: string, now = new Date()): string[] {
  if (!pickup.enabled || pickup.version !== 2 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const calendar = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== date || date < pickupToday(now)) return [];
  const row = pickup.hours?.[days[calendar.getUTCDay()]];
  if (!row?.enabled || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.start) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.end) || row.start >= row.end) return [];
  const current = businessDateParts(now.toISOString())!;
  const currentMinute = `${current.hour}:${current.minute}`;
  return minutesInChile(date)
    .filter(time => time >= row.start && time <= row.end && (date !== pickupToday(now) || time > currentMinute));
}
export const pickupSelectionLabel = (selection: PickupSelection) => `${formatBusinessDate(selection.fecha)} a las ${selection.hora} h · Hora de Chile`;
