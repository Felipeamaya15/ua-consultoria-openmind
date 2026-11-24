import { useEffect, useState } from 'react';
import { commerceRequest, invoiceErrors, type CommerceOptions, type InvoiceRequest } from '../../../landing/services/commerceService';

export function InvoiceFields({value, onChange}: {value: InvoiceRequest | undefined; onChange: (value: InvoiceRequest | undefined) => void}) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    commerceRequest<CommerceOptions>('comercio', 'GET', undefined, controller.signal).then(data => setEnabled(data.factura)).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!enabled) return null;
  const errors = value ? invoiceErrors(value) : {};
  const labels: Record<keyof InvoiceRequest, string> = {rut: 'RUT (con dígito verificador)', razon_social: 'Razón social', giro: 'Giro', direccion: 'Dirección tributaria', comuna: 'Comuna', email: 'Correo para la factura'};
  return <fieldset className="my-4 border rounded p-4 space-y-3">
    <legend>Documento tributario</legend>
    <label className="flex gap-2"><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked ? {rut: '', razon_social: '', giro: '', direccion: '', comuna: '', email: ''} : undefined)} /> Solicitar factura</label>
    {value && <>
      <p className="text-sm">La tienda revisará estos datos y emitirá el documento mediante su sistema autorizado. Esta solicitud no constituye una factura.</p>
      {(Object.keys(labels) as (keyof InvoiceRequest)[]).map(key => <label key={key} className="block">{labels[key]}<input required type={key === 'email' ? 'email' : 'text'} maxLength={key === 'rut' ? 14 : key === 'comuna' ? 100 : key === 'email' ? 254 : key === 'direccion' ? 240 : 180} value={value[key]} onChange={e => onChange({...value, [key]: e.target.value})} aria-invalid={!!errors[key]} className={`block w-full border rounded p-2 ${errors[key] ? 'border-red-600' : ''}`} />{errors[key] && <span className="text-sm text-red-700">{errors[key]}</span>}</label>)}
    </>}
  </fieldset>;
}
