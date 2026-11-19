import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { consentRequest, requestConsent, CONSENT_TEXT, readOwnConsent, saveOwnConsent, hasConsentSession, type OwnCommercialPreference } from '../services/commercialConsent';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

export default function CommercialPreferences() {
  const {templateNumber, route} = useStorefrontTemplate();
  const homeRoute = typeof route === 'function' ? route() : `/plantilla/${templateNumber}`;
  const location = useLocation();
  const [link, setLink] = useState(() => {
    const values = new URLSearchParams(window.location.hash.slice(1));

    const value = {token: values.get('token') || '', action: values.get('accion') || ''};
    return value;
  });
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>(location.state?.notice || '');
  const [error, setError] = useState('');
  const [state, setState] = useState('');
  const [purpose, setPurpose] = useState('gestionar');
  const [own, setOwn] = useState<OwnCommercialPreference | null>(null);
  const [receive, setReceive] = useState(false), [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true; setChecking(true); setOwn(null);
    if (!hasConsentSession()) { setChecking(false); return; }
    readOwnConsent().then(value => { if (active) { setOwn(value); setReceive(value.recibir); setEmail(value.email); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'No pudimos consultar tu preferencia.'); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [location.pathname]);
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
      const result = await consentRequest('enlace', {token: link.token, accion: action}, action === 'confirmar');
      setState(result.data.estado); setMessage(result.mensaje);
      if (hasConsentSession()) {
        try { const value = await readOwnConsent(); setOwn(value); setReceive(value.recibir); }
        catch { setOwn(null); }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos procesar el enlace.'); }
    finally { setBusy(false); }
  }
  async function savePreference(event: FormEvent) {
    event.preventDefault(); if (busy || checking || !own?.correo_verificado) return;
    setBusy(true); setError(''); setMessage('');
    try { const value = await saveOwnConsent(receive); setOwn(value); setReceive(value.recibir); setMessage('Preferencia guardada. Puedes cambiarla cuando quieras.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar tu preferencia.'); }
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
  const homeButton = (
    <Link
      data-page-action="primary"
      to={homeRoute}
      className="inline-flex items-center justify-center border rounded px-4 py-3 font-semibold no-underline"
      style={{
        backgroundColor: 'var(--primary, #1a3a6b)',
        borderColor: 'var(--primary, #1a3a6b)',
        color: 'var(--on-primary, #ffffff)',
      }}
    >
      Ir al inicio de la tienda
    </Link>
  );
  return <main className="max-w-xl mx-auto w-full p-6 space-y-5" data-page-panel>
    <h1 className="text-2xl font-semibold">Preferencias comerciales</h1>
    <p>Gestiona únicamente la publicidad de esta tienda. Retirarla no afecta los mensajes necesarios de tus pedidos.</p>
    {message && <p role="status" className="border rounded p-3">{message}</p>}
    {error && <p role="alert" className="border rounded p-3 text-red-700">{error}</p>}
    {busy && <p role="status">Procesando…</p>}
    {checking && <p role="status">Consultando tu preferencia…</p>}
    {link.token && <section className="space-y-4">
      {link.action === 'confirmar' ? <><p>{CONSENT_TEXT}</p><div className="flex flex-wrap items-center gap-3"><button data-page-action="primary" className={button} disabled={busy || state === 'autorizado'} onClick={() => void run('confirmar')}>Confirmar autorización comercial</button>{homeButton}</div></> : <>
        <button data-page-action="outline" className={button} disabled={busy} onClick={() => void run('consultar')}>Consultar mi preferencia</button>
        {state && <p>Estado: {{autorizado: 'Autorizado y verificado', pendiente: 'Pendiente de verificación', retirado: 'Autorización retirada'}[state] || state}</p>}
        <div className="flex flex-wrap items-center gap-3"><button data-page-action="primary" className={button} disabled={busy || state === 'retirado'} onClick={() => void run('retirar')}>Retirar autorización comercial</button>{homeButton}</div>
      </>}
    </section>}
    {!checking && own?.correo_verificado ? <form onSubmit={savePreference} className="space-y-4">
      <p className="break-all">Correo verificado de tu cuenta: {own.email}</p>
      <p>Estado actual: {{autorizado:'Autorizado y verificado', retirado:'Autorización retirada', pendiente:'Pendiente de verificación', sin_registro:'Sin autorización registrada'}[own.estado]}</p>
      <label className="flex items-start gap-3"><input type="checkbox" checked={receive} disabled={busy} onChange={event => setReceive(event.target.checked)} /><span>{CONSENT_TEXT}</span></label>
      <div className="flex flex-wrap items-center gap-3"><button data-page-action="primary" className={button} disabled={busy}>Guardar preferencia</button>{homeButton}</div>
    </form> : !checking && <form onSubmit={send} className="space-y-4">
      <h2 className="text-lg font-semibold">Solicitar un enlace nuevo</h2>
      {own && <p>Tu sesión no acredita la verificación del correo. Confirma el enlace enviado a tu cuenta para activar la gestión directa.</p>}
      <label className="block">Correo electrónico<input required type="email" autoComplete="email" readOnly={!!own} maxLength={320} className="block w-full border rounded p-3 mt-1" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="block">Qué quieres hacer<select className="block w-full border rounded p-3 mt-1" value={purpose} onChange={e => setPurpose(e.target.value)}>
        <option value="gestionar">Consultar o retirar mi autorización</option><option value="confirmar">Autorizar publicidad (requiere confirmación)</option>
      </select></label>
      {purpose === 'confirmar' && <p>{CONSENT_TEXT}</p>}
      <div className="flex flex-wrap items-center gap-3"><button data-page-action="outline" className={button} disabled={busy}>Enviar enlace por correo</button>{homeButton}</div>
      <p className="text-sm">Por privacidad, no mostramos si un correo tiene autorización. El enlace llegará a su titular. Puedes reintentar el envío después de cinco minutos.</p>
    </form>}
  </main>;
}
