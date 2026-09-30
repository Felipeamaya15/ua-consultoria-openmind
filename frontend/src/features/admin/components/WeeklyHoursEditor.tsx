import { Button, Input } from './ui';

export const weekDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
type Hours = { day: string; open: string; close: string };
export function parseWeeklyHours(value: string): Hours[] | null {
  if (!value) return [];
  const rows = value.split('; ').map(row => /^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo): (\d{2}:\d{2})?–(\d{2}:\d{2})?$/.exec(row));
  if (rows.some(row => !row) || new Set(rows.map(row => row![1])).size !== rows.length) return null;
  return rows.map(row => ({ day: row![1], open: row![2] || '', close: row![3] || '' }));
}
export function formatWeeklyHours(rows: Hours[]): string {
  return weekDays.flatMap(day => rows.filter(row => row.day === day).map(row => `${day}: ${row.open}–${row.close}`)).join('; ');
}

export function WeeklyHoursEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const rows = parseWeeklyHours(value);
  if (rows === null) return <div className="space-y-2"><p className="text-sm">Horario guardado: {value}</p><Button type="button" variant="outline" onClick={() => onChange('')}>Configurar horario por día</Button><p className="text-xs">Este botón reemplaza el horario anterior por una selección semanal.</p></div>;
  function update(day: string, key: 'open' | 'close', time: string) {
    onChange(formatWeeklyHours(rows!.map(row => row.day === day ? { ...row, [key]: time } : row)));
  }
  return <fieldset className="space-y-3"><legend className="text-sm font-semibold mb-2">Horario de atención</legend>
    <p className="text-xs">Selecciona los días de atención y las horas de apertura y cierre. Los días sin seleccionar no tienen atención. Si el cierre es anterior a la apertura, corresponde al día siguiente.</p>
    {weekDays.map(day => {
      const row = rows.find(item => item.day === day);
      return <div key={day} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={!!row} onChange={e => onChange(formatWeeklyHours(e.target.checked ? [...rows, { day, open: '', close: '' }] : rows.filter(item => item.day !== day)))} />{day}</label>
        {row && <><Input label={`Apertura · ${day}`} type="time" step={60} required value={row.open} onChange={e => update(day, 'open', e.target.value)} /><Input label={`Cierre · ${day}`} type="time" step={60} required value={row.close} onChange={e => update(day, 'close', e.target.value)} /></>}
      </div>;
    })}
  </fieldset>;
}
