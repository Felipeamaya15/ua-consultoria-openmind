
export const BUSINESS_TIME_ZONE = 'America/Santiago';
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE, calendar: 'gregory', numberingSystem: 'latn',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function businessDateParts(value: string) {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = formatter.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute') };
}


export function formatBusinessDate(value: string, withTime = false): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
      ? value.split('-').reverse().join('/') : '';
  }
  const parts = businessDateParts(value);
  return parts ? `${parts.day}/${parts.month}/${parts.year}${withTime ? `, ${parts.hour}:${parts.minute}` : ''}` : '';
}


export function chileanDateInput(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}
