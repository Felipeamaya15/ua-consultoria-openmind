import { useEffect, useRef, useState } from 'react';
import { commerceRequest, type CommerceOptions } from '../../../landing/services/commerceService';
import './wholesale-quote.css';

export function WholesaleQuote({productId, productName}: {productId: string; productName: string}) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const key = useRef('');
  useEffect(() => {
    const controller = new AbortController();
    setEnabled(false); setOpen(false); setSent(false); setConsent(false); setMessage(''); key.current = '';
    commerceRequest<CommerceOptions>('comercio', 'GET', undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) setEnabled(data.cotizaciones); })
      .catch(() => {});
    return () => controller.abort();
  }, [productId]);
  if (!enabled) return null;
  return <section className="om-wholesale" aria-label="Cotización por mayor">
    <button type="button" className="om-wholesale__toggle" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      Solicitar cotización por mayor <span aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    {open && <form className="om-wholesale__form" onChange={() => {if (!sent) key.current = '';}} onSubmit={async event => {
      event.preventDefault();
      if (busy || sent || !consent) return;
      const form = new FormData(event.currentTarget);
      if (!key.current) key.current = crypto.randomUUID();
      setBusy(true); setMessage('');
      try {
        // El backend también exige consentimiento === true (validación independiente del navegador).
        await commerceRequest('cotizaciones', 'POST', {solicitud_id: key.current, producto: productId,
          nombre: form.get('nombre'), email: form.get('email'), empresa: form.get('empresa'),
          cantidad: Number(form.get('cantidad')), mensaje: form.get('mensaje'), consentimiento: consent});
        setSent(true); setMessage('Cotización guardada. La tienda podrá responderte por correo.');
      } catch (cause) {setMessage(cause instanceof Error ? cause.message : 'No se pudo enviar la cotización.');}
      finally {setBusy(false);}
    }}>
      <fieldset disabled={busy || sent} className="om-wholesale__fields">
        <legend>{productName}</legend>
        <label>Nombre<input name="nombre" required maxLength={100} autoComplete="name" /></label>
        <label>Correo electrónico<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
        <label>Empresa (opcional)<input name="empresa" maxLength={180} autoComplete="organization" /></label>
        <label>Cantidad solicitada<input name="cantidad" type="number" min={1} max={1000000} step={1} defaultValue={1} required /></label>
        <label>Mensaje u observaciones<textarea name="mensaje" maxLength={3000} rows={3} /></label>
        <label className="om-wholesale__consent"><input name="consentimiento" type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} /> <span>Autorizo el uso de mis datos para gestionar esta cotización.</span></label>
      </fieldset>
      <button type="submit" className="om-wholesale__submit" disabled={busy || sent || !consent}>
        {busy ? 'Guardando…' : sent ? 'Cotización enviada' : 'Enviar cotización'}
      </button>
      {!consent && !sent && <p className="om-wholesale__hint">Para enviar la solicitud debes autorizar el uso de tus datos de contacto.</p>}
      {message && <p role="status" className="om-wholesale__message">{message}</p>}
    </form>}
  </section>;
}
