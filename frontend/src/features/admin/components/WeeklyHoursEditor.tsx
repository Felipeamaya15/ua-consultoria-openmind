import { useEffect, useState } from 'react';

export const weekDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export type Hours = { day: string; open: string; close: string };
export function parseWeeklyHours(value: string): Hours[] | null {
  if (!value) return [];
  const rows = value.split('; ').map(row => /^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo): (\d{2}:\d{2})?–(\d{2}:\d{2})?$/.exec(row));
  if (rows.some(row => !row) || new Set(rows.map(row => row![1])).size !== rows.length) return null;
  return rows.map(row => ({ day: row![1], open: row![2] || '', close: row![3] || '' }));
}
export function formatWeeklyHours(rows: Hours[]): string {
  return weekDays.flatMap(day => rows.filter(row => row.day === day).map(row => `${day}: ${row.open}–${row.close}`)).join('; ');
}
export const validHour = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function WeeklyHoursEditor({ value, onChange, onPendingChange }: { value: string; onChange: (value: string) => void; onPendingChange?: (pending: boolean) => void }) {
  const rows = parseWeeklyHours(value);
  const [day,setDay] = useState('');
  const [open,setOpen] = useState('09:00');
  const [close,setClose] = useState('20:00');
  const [editing,setEditing] = useState<string>();
  const [error,setError] = useState('');
  const [convert,setConvert] = useState(false);
  const original = rows?.find(row => row.day === editing);
  const pending = !!day && (!original || original.day !== day || original.open !== open || original.close !== close);
  useEffect(() => {onPendingChange?.(pending);return () => onPendingChange?.(false);}, [pending,onPendingChange]);
  const cancel = () => {setDay('');setEditing(undefined);setOpen('09:00');setClose('20:00');setError('');};
  function addDay() {
    if (!weekDays.includes(day) || !validHour(open) || !validHour(close)) {setError('Selecciona un día y completa ambas horas.');return;}
    if (rows?.some(row => row.day === day && row.day !== editing)) {setError('Ese día ya está configurado. Usa Editar para cambiarlo.');return;}
    onChange(formatWeeklyHours([...(rows ?? []).filter(row => row.day !== editing),{day,open,close}]));
    cancel();
  }
  if (rows === null) return <section className="hours-manager"><h3>Horario de atención</h3><p className="hours-legacy">{value}</p>{convert ? <div className="hours-convert"><p>El horario semanal reemplazará este texto al guardar. Puedes deshacerlo.</p><button type="button" onClick={() => {onChange('');setConvert(false);}}>Usar horario semanal</button><button type="button" onClick={() => setConvert(false)}>Cancelar</button></div> : <button type="button" className="lp-button" onClick={() => setConvert(true)}>Configurar horario por día</button>}</section>;
  return <section className="hours-manager" aria-label="Horario de atención"><div className="hours-heading"><div><h3>Horario de atención</h3><p>Los días no agregados se consideran cerrados.</p></div><span>{rows.length} de 7 días</span></div>
    <div className="hours-compose"><label>Día<select aria-label="Día" value={day} onChange={e => {setDay(e.target.value);setError('');}}><option value="">Seleccionar día</option>{weekDays.map(name => <option key={name} value={name} disabled={rows.some(row => row.day === name && row.day !== editing)}>{name}</option>)}</select></label><label>Apertura<input aria-label="Apertura" type="time" step={60} value={open} onChange={e => setOpen(e.target.value)} /></label><label>Cierre<input aria-label="Cierre" type="time" step={60} value={close} onChange={e => setClose(e.target.value)} /></label><button type="button" className="lp-button lp-button-primary" disabled={!day} onClick={addDay}>{editing ? 'Guardar día' : 'Agregar día'}</button></div>
    {error && <p role="alert" className="hours-error">{error}</p>}{day && close < open && <p className="hours-note">El cierre corresponde al día siguiente.</p>}
    {day && <div className="hours-draft"><span>{pending ? 'Agrega o guarda este día antes de guardar la página.' : 'Estás revisando un día configurado.'}</span><button type="button" onClick={cancel}>Cancelar edición</button></div>}
    <ul className="hours-list" aria-label="Días configurados">{weekDays.flatMap(name => rows.filter(row => row.day === name).map(row => <li key={row.day}><strong>{row.day}</strong><span>{row.open || 'Sin apertura'} <span aria-hidden="true">—</span> {row.close || 'Sin cierre'}{row.close && row.open && row.close < row.open && <small>día siguiente</small>}</span><div><button type="button" aria-label={`Editar ${row.day}`} onClick={() => {setEditing(row.day);setDay(row.day);setOpen(row.open);setClose(row.close);setError('');}}>Editar</button><button type="button" aria-label={`Quitar ${row.day}`} onClick={() => {onChange(formatWeeklyHours(rows.filter(item => item.day !== row.day)));if(editing === row.day)cancel();}}>Quitar</button></div></li>))}</ul>
    {!rows.length && <p className="hours-empty">Todavía no hay días configurados.</p>}
  </section>;
}
