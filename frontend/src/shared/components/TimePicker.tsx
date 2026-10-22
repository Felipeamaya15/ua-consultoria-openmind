import { useEffect, useRef, useState } from 'react';

export const validTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Selector explícito de horas y minutos en 24 h, independiente del idioma del navegador. */
export default function TimePicker({ id, label, value, onChange, disabled = false, times, error, native = false, clock = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  disabled?: boolean; times?: string[]; error?: string; native?: boolean; clock?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [stage, setStage] = useState<'hour' | 'minute'>('hour');
  const [draftHour, setDraftHour] = useState(9);
  const [draftMinute, setDraftMinute] = useState(0);
  const [meridiem, setMeridiem] = useState<'AM' | 'PM'>('AM');
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const outside = (event: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setIsOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [isOpen]);

  if (clock) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const openClock = () => {
      const [h, m] = validTime(value) ? value.split(':').map(Number) : [9, 0];
      setDraftHour(h % 12 || 12);
      setDraftMinute(m);
      setMeridiem(h >= 12 ? 'PM' : 'AM');
      setStage('hour');
      setIsOpen(true);
    };
    const confirm = () => {
      const hour24 = draftHour % 12 + (meridiem === 'PM' ? 12 : 0);
      onChange(`${pad(hour24)}:${pad(draftMinute)}`);
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    const options = stage === 'hour' ? Array.from({ length: 12 }, (_, i) => i === 0 ? 12 : i) : Array.from({ length: 12 }, (_, i) => i * 5);
    return <div className="min-w-0" ref={pickerRef}>
      <label id={`${id}-label`} className="mb-2 block text-sm font-medium">{label}</label>
      <button type="button" id={id} ref={triggerRef} aria-labelledby={`${id}-label`} aria-expanded={isOpen}
        aria-haspopup="dialog" disabled={disabled} aria-invalid={!!error}
        onClick={() => isOpen ? setIsOpen(false) : openClock()}
        className="flex min-h-11 w-full items-center justify-between rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50">
        <span>{value || 'Seleccionar hora'}</span>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6.5V12l3.5 2"/></svg>
      </button>
      {isOpen && !disabled && <div role="dialog" aria-label={`Seleccionar ${label.toLowerCase()}`} aria-modal="false"
        className="relative z-30 mt-2 w-full max-w-[320px] rounded-xl border border-[var(--border)] bg-white p-3 shadow-xl sm:p-4">
        <div className="mb-3 flex items-center justify-center gap-2">
          <button type="button" aria-label="Elegir hora" aria-pressed={stage === 'hour'} onClick={() => setStage('hour')}
            className={`rounded-md px-2 py-1 text-2xl font-semibold tabular-nums ${stage === 'hour' ? 'bg-[#e7edf7] text-[#1a3a6b]' : 'text-slate-600'}`}>{pad(draftHour)}</button>
          <span className="text-xl">:</span>
          <button type="button" aria-label="Elegir minutos" aria-pressed={stage === 'minute'} onClick={() => setStage('minute')}
            className={`rounded-md px-2 py-1 text-2xl font-semibold tabular-nums ${stage === 'minute' ? 'bg-[#e7edf7] text-[#1a3a6b]' : 'text-slate-600'}`}>{pad(draftMinute)}</button>
          <div className="ml-2 flex flex-col rounded-lg border border-[var(--border)] p-0.5" role="group" aria-label="AM o PM">
            {(['AM', 'PM'] as const).map(period => <button key={period} type="button" aria-pressed={meridiem === period}
              onClick={() => setMeridiem(period)} className={`rounded px-2 py-1 text-xs font-semibold ${meridiem === period ? 'bg-[#1a3a6b] text-white' : 'text-slate-600'}`}>{period}</button>)}
          </div>
        </div>
        <p className="mb-2 text-center text-xs text-slate-600">{stage === 'hour' ? 'Selecciona la hora' : 'Selecciona los minutos (cada 5)'}</p>
        <div className="relative mx-auto h-[248px] w-[248px] rounded-full bg-[#f2f5fa]" role="group" aria-label={stage === 'hour' ? 'Horas del reloj' : 'Minutos del reloj'}>
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1a3a6b]" aria-hidden="true"/>
          {options.map((option, i) => {
            const selected = stage === 'hour' ? draftHour === option : draftMinute === option;
            const radians = i * Math.PI / 6 - Math.PI / 2;
            const x = 124 + 98 * Math.cos(radians) - 20;
            const y = 124 + 98 * Math.sin(radians) - 20;
            return <button key={option} type="button" aria-label={stage === 'hour' ? `${option} horas` : `${pad(option)} minutos`}
              aria-pressed={selected} style={{ left: x, top: y }}
              className={`absolute flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a3a6b] ${selected ? 'bg-[#1a3a6b] text-white' : 'text-[#243c5a] hover:bg-[#dfe7f3]'}`}
              onClick={() => { if (stage === 'hour') { setDraftHour(option); setStage('minute'); } else { setDraftMinute(option); } }}>
              {stage === 'hour' ? option : pad(option)}
            </button>;
          })}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" className="min-h-10 rounded-lg px-3 text-sm font-medium text-slate-700" onClick={() => {setIsOpen(false);triggerRef.current?.focus();}}>Cancelar</button>
          <button type="button" className="min-h-10 rounded-lg bg-[#1a3a6b] px-4 text-sm font-semibold text-white" onClick={confirm}>Aceptar</button>
        </div>
      </div>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-[var(--error)]">{error}</p>}
    </div>;
  }
  if (native) {
    return <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-sm font-medium">{label}</label>
      <input
        id={id}
        type="time"
        step={60}
        value={value}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : `${id}-help`}
        onChange={event => onChange(event.target.value)}
        className="w-full min-h-11 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50"
      />
      <p id={`${id}-help`} className="mt-1 text-xs opacity-75">Hora local, formato 24 h. Selecciona el icono del reloj o escribe la hora.</p>
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-[var(--error)]">{error}</p>}
    </div>;
  }
  const available = times ?? Array.from({ length: 1440 }, (_, i) => `${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`);
  const hours = [...new Set(available.map(time => time.slice(0, 2)))];
  const hour = validTime(value) ? value.slice(0, 2) : '';
  const minute = validTime(value) ? value.slice(3) : '';
  const minutes = available.filter(time => time.startsWith(`${hour}:`)).map(time => time.slice(3));
  const selectClass = 'w-full min-h-11 rounded-lg border border-[var(--border)] bg-[var(--input-background,white)] px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:opacity-50';
  return <fieldset disabled={disabled || available.length === 0} aria-describedby={error ? `${id}-error` : `${id}-help`} className="min-w-0">
    <legend className="text-sm font-medium mb-2">{label}</legend>
    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
      <label htmlFor={`${id}-hour`} className="text-xs">Hora<select id={`${id}-hour`} aria-label={`${label}: hora`} className={selectClass} value={hour} aria-invalid={!!error}
        onChange={event => { const h = event.target.value; const old = `${h}:${minute}`; onChange(available.includes(old) ? old : available.find(t => t.startsWith(`${h}:`)) || ''); }}>
        <option value="">HH</option>{hours.map(h => <option key={h} value={h}>{h}</option>)}
      </select></label>
      <span aria-hidden="true" className="pb-2 font-bold text-lg">:</span>
      <label htmlFor={`${id}-minute`} className="text-xs">Minutos<select id={`${id}-minute`} aria-label={`${label}: minutos`} className={selectClass} value={minute} disabled={disabled || !hour} aria-invalid={!!error}
        onChange={event => onChange(event.target.value ? `${hour}:${event.target.value}` : '')}>
        <option value="">MM</option>{minutes.map(m => <option key={m} value={m}>{m}</option>)}
      </select></label>
    </div>
    <p id={`${id}-help`} className="text-xs mt-1 opacity-75">Formato 24 horas{validTime(value) ? ` · ${value} h` : ''}</p>
    {error && <p id={`${id}-error`} role="alert" className="text-xs text-[var(--error)] mt-1">{error}</p>}
  </fieldset>;
}
