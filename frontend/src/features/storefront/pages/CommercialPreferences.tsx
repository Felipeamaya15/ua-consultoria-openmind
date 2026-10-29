import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { consentRequest, requestConsent, CONSENT_TEXT } from '../services/commercialConsent';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

export default function CommercialPreferences() {
  const {templateNumber} = useStorefrontTemplate();
  const location = useLocation();
  const [link, setLink] = useState(() => {
    const values = new URLSearchParams(window.location.hash.slice(1));
    // Bearer tokens never reach the server's URL/access log, referrer or storage.
    const value = {token: values.get('token') || '', action: values.get('accion') || ''};
    return value;
  });
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>(location.state?.notice || '');
  const [error, setError] = useState('');
  const [state, setState] = useState('');
  const [purpose, setPurpose] = useState('gestionar');
  useEffect(() => {
    const values = new URLSearchParams(location.hash.slice(1));
    if (values.has('token')) {
      setLink({token: values.get('token') || '', action: values.get('accion') || ''});
      setState(''); setError(''); setMessage('');
    }
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [location.hash]);
  async function run(action: string) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await consentRequest('enlace', {token: link.token, accion: action});
      setState(result.data.estado); setMessage(result.mensaje);
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos procesar el enlace.'); }
    finally { setBusy(false); }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { const result = await requestConsent(email, templateNumber, purpose); setMessage(result.mensaje); }
    catch (e) { setError(e instanceof Error ? e.message : 'No pudimos enviar el enlace.'); }
    finally { setBusy(false); }
  }
  const button = 'border rounded px-4 py-3 disabled:opacity-50';
  return <main className="max-w-xl mx-auto w-full p-6 space-y-5" data-page-panel>
    <h1 className="text-2xl font-semibold">Preferencias comerciales</h1>
    <p>Gestiona únicamente la publicidad de esta tienda. Retirarla no afecta los mensajes necesarios de tus pedidos.</p>
    {message && <p role="status" className="border rounded p-3">{message}</p>}
    {error && <p role="alert" className="border rounded p-3 text-red-700">{error}</p>}
    {busy && <p role="status">Procesando…</p>}
    {link.token && <section className="space-y-4">
      {link.action === 'confirmar' ? <><p>{CONSENT_TEXT}</p><button data-page-action="primary" className={button} disabled={busy || state === 'autorizado'} onClick={() => void run('confirmar')}>Confirmar autorización comercial</button></> : <>
        <button data-page-action="outline" className={button} disabled={busy} onClick={() => void run('consultar')}>Consultar mi preferencia</button>
        {state && <p>Estado: {{autorizado: 'Autorizado y verificado', pendiente: 'Pendiente de verificación', retirado: 'Autorización retirada'}[state] || state}</p>}
        <button data-page-action="primary" className={button} disabled={busy || state === 'retirado'} onClick={() => void run('retirar')}>Retirar autorización comercial</button>
      </>}
    </section>}
    <form onSubmit={send} className="space-y-4">
      <h2 className="text-lg font-semibold">Solicitar un enlace nuevo</h2>
      <label className="block">Correo electrónico<input required type="email" autoComplete="email" maxLength={320} className="block w-full border rounded p-3 mt-1" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="block">Qué quieres hacer<select className="block w-full border rounded p-3 mt-1" value={purpose} onChange={e => setPurpose(e.target.value)}>
        <option value="gestionar">Consultar o retirar mi autorización</option><option value="confirmar">Autorizar publicidad (requiere confirmación)</option>
      </select></label>
      {purpose === 'confirmar' && <p>{CONSENT_TEXT}</p>}
      <button data-page-action="outline" className={button} disabled={busy}>Enviar enlace por correo</button>
      <p className="text-sm">Por privacidad, no mostramos si un correo tiene autorización. El enlace llegará a su titular. Puedes reintentar el envío después de cinco minutos.</p>
    </form>
  </main>;
}
