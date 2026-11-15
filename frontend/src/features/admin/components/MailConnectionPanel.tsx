import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminCard, Alert, Button } from './ui';
import { mailConnectionService, MAIL_AUTHORIZATION_TEXT, type MailConnection } from '../services/mailConnectionService';
import { Link } from 'react-router-dom';

export function MailConnectionPanel({businessEmail = '', businessSaved = true, summary = false}: {businessEmail?: string; businessSaved?: boolean; summary?: boolean} = {}) {
  const [data, setData] = useState<MailConnection | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const lock = useRef(false), alive = useRef(true), key = useRef<string>();
  const [authorized, setAuthorized] = useState(false);
  const email = businessEmail || data?.correo_negocio || '';
  useEffect(() => { setAuthorized(false); }, [businessEmail, data?.correo_negocio]);
  const refresh = useCallback(async () => {
    try { const value = await mailConnectionService.status(); if (alive.current) { setData(value); setError(''); } }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No se pudo consultar la conexión.'); }
  }, []);
  useEffect(() => {
    alive.current = true; void refresh();
    const focus = () => { if (!lock.current) void refresh(); };
    window.addEventListener('focus', focus);
    return () => { alive.current = false; window.removeEventListener('focus', focus); };
  }, [refresh]);
  async function action(type: 'connect' | 'disconnect' | 'test') {
    if (lock.current) return;
    if (type === 'disconnect' && !window.confirm('¿Desconectar esta cuenta de correo de la tienda?')) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (type === 'connect') {
        if (!authorized || !businessSaved || !email || email.trim().toLowerCase() !== data?.correo_negocio?.trim().toLowerCase()) {
          throw new Error('Guarda el correo del negocio y marca la autorización antes de conectar Gmail.');
        }
        const url = await mailConnectionService.connect(email, authorized);
        window.open(url, '_blank', 'noopener,noreferrer');
        setAuthorized(false);
        if (alive.current) setNotice('Completa la autorización en Google y pulsa Actualizar conexión al volver.');
      } else if (type === 'disconnect') {
        setAuthorized(false);
        await mailConnectionService.disconnect();
        if (alive.current) setNotice('Cuenta desconectada de la tienda.');
        await refresh();
      } else {
        key.current ??= crypto.randomUUID();
        const result = await mailConnectionService.test(key.current);
        if (alive.current) setNotice(result.estado === 'aceptada'
          ? 'Prueba aceptada por el proveedor. Esto no acredita entrega al buzón.'
          : 'No se confirmó el envío de prueba. Actualiza la conexión y revisa el proveedor.');
        if (['aceptada','fallida'].includes(result.estado)) key.current = undefined;
        await refresh();
      }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  if (summary) return <AdminCard className="space-y-2">
    <h3 className="font-semibold">Correo para campañas</h3>
    {!data ? <p role="status">Consultando conexión de correo…</p> : <>
      <p className="break-all">{data.conectado ? data.correo : 'No hay una cuenta de Gmail conectada.'}</p>
      <p>Estado: {data.autorizacion_vigente && data.estado === 'conectado' ? 'Cuenta autorizada' : data.estado === 'reconectar' ? 'Necesita reconexión y autorización' : 'Sin conexión autorizada'}</p>
      {data.modo === 'mailpit' && <p className="text-sm">Pruebas locales con Mailpit.</p>}
    </>}
    {error && <Alert variant="error">{error}</Alert>}
    <Link to="/emprendedor/landing#informacion-negocio" className="text-sm underline">{data?.autorizacion_vigente ? 'Gestionar correo en Página principal → Negocio' : 'Conectar en Página principal → Negocio'}</Link>
  </AdminCard>;
  return <AdminCard className="space-y-3">
    <h2 className="font-semibold">Correo del emprendimiento</h2>
    {!data ? <p role="status">Consultando conexión de correo…</p> : <>
      <p className="break-all">{data.conectado ? data.correo : 'No hay una cuenta de Gmail conectada.'}</p>
      <p className="text-sm">Estado: {data.estado === 'reconectar' ? 'Necesita reconexión' : data.conectado ? 'Cuenta autorizada' : 'Sin conexión'} · {data.modo === 'mailpit' ? 'Buzón local de pruebas' : 'Gmail'}</p>
      <p className="text-sm">{data.aviso}</p>
      <p className="text-sm">Correo del negocio: {email || 'Completa el campo Correo del negocio.'}. Guardar una dirección no autoriza su uso ni conecta Gmail. En Google debes elegir esa misma cuenta.</p>
      {data.autorizacion_vigente && <p className="text-sm">Uso autorizado el {data.autorizacion_fecha ? new Date(data.autorizacion_fecha).toLocaleDateString('es-CL') : 'día registrado'}.</p>}
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 shrink-0" checked={authorized} disabled={busy || !businessSaved} onChange={event => setAuthorized(event.target.checked)} /><span>{MAIL_AUTHORIZATION_TEXT}</span></label>
      {!businessSaved && <p className="text-sm">Guarda primero los cambios del negocio antes de conectar o cambiar la cuenta.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || !data.oauth_configurado || !authorized || !businessSaved || !email || email.trim().toLowerCase() !== data.correo_negocio?.trim().toLowerCase()} onClick={() => void action('connect')}>{data.conectado ? 'Reconectar Gmail' : 'Conectar Gmail'}</Button>
        {data.conectado && <Button type="button" variant="outline" disabled={busy} onClick={() => void action('disconnect')}>Desconectar cuenta</Button>}
        <Button type="button" variant="outline" disabled={busy || !data.envio_habilitado} onClick={() => void action('test')}>{busy ? 'Procesando…' : 'Enviar prueba controlada'}</Button>
      </div>
      <p className="text-xs">La prueba usa la cuenta conectada o el correo del propietario. En modo local todos los mensajes se capturan en Mailpit. Las respuestas a consultas y las campañas usan esta conexión; los eventos de pedidos mantienen sus plantillas y transporte.</p>
      {!data.oauth_configurado && <p className="text-sm">La configuración de Google OAuth o del cifrado está pendiente en el servidor.</p>}
    </>}
    <Button type="button" variant="ghost" disabled={busy} onClick={() => void refresh()}>Actualizar conexión</Button>
    {notice && <p role="status">{notice}</p>}{error && <Alert variant="error">{error}</Alert>}
  </AdminCard>;
}
