import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from '../../admin/components/ui';
import { instagramService, type InstagramConnection } from '../services/instagramService';

function callbackError() {
  if (typeof window === 'undefined') return '';
  const query = new URLSearchParams(window.location.search);
  if (query.get('instagram') !== 'error') return '';
  const messages: Record<string, string> = {
    permisos_instagram_excesivos: 'La configuración de Meta concede permisos adicionales. Conserva solo instagram_basic, instagram_manage_messages e instagram_content_publish.',
    permisos_instagram_incompletos: 'Faltan permisos obligatorios de Unified Login o publicación. Revisa la configuración de Meta y vuelve a autorizar.',
    comparte_una_cuenta_instagram: 'Comparte una sola cuenta profesional de Instagram durante la autorización.',
    instagram_rechazo_solicitud: 'Meta rechazó la conexión. Revisa el App ID, App Secret, configuración SUAT, rol y callback registrado.',
  };
  return messages[query.get('motivo') || ''] || 'No se completó la conexión de Instagram. Vuelve a autorizar desde este botón.';
}

export function InstagramConnectionPanel({isCurrent}: {isCurrent: () => boolean}) {
  const [data, setData] = useState<InstagramConnection | null>(null), [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(callbackError), [notice, setNotice] = useState('');
  const alive = useRef(true), lock = useRef(false);
  useEffect(() => {alive.current = true; void reload(); return () => {alive.current = false;};}, []);
  async function reload() {
    try {const next = await instagramService.status(); if (alive.current && isCurrent()) {setData(next); setError(callbackError());}}
    catch (cause) {if (alive.current) setError(cause instanceof Error ? cause.message : 'No se pudo consultar Instagram.');}
  }
  async function action(kind: 'connect' | 'refresh' | 'disconnect') {
    if (lock.current || !isCurrent()) return;
    if (kind === 'disconnect' && !window.confirm('¿Desconectar Instagram de esta tienda? Las publicaciones anteriores se conservan.')) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (kind === 'connect' || kind === 'refresh') {const url = await instagramService.connect(authorized, kind === 'refresh'); if (isCurrent()) window.location.assign(url);}
      else {
        const next = await instagramService.disconnect();
        if (alive.current && isCurrent()) {setData(next); setAuthorized(false); setNotice('Acceso eliminado de OpenMind. Para revocar también en Meta, elimina la app de Aplicaciones conectadas del portafolio empresarial.');}
      }
    } catch (cause) {if (alive.current) setError(cause instanceof Error ? cause.message : 'No se completó la conexión de Instagram.');}
    finally {lock.current = false; if (alive.current) setBusy(false);}
  }
  return <section aria-label="Conexión oficial de Instagram" className="instagram-connection space-y-3 border-t border-[var(--border)] pt-4 mt-4">
    <h4 className="font-semibold">Conectar cuenta profesional</h4>
    <p className="text-sm">Conecta mediante Unified Login. Comparte una sola cuenta profesional de Instagram de tu portafolio empresarial para publicar desde Marketing. Meta exige el permiso de mensajes para este acceso; OpenMind no lee ni envía mensajes.</p>
    {!data ? <p role="status">Consultando conexión de Instagram…</p> : <>
      <p className="text-sm">{data.usuario ? `@${data.usuario}` : 'Sin cuenta autorizada'} · {data.conectado ? 'Conectada' : data.estado === 'vencida' ? 'Autorización vencida' : data.estado === 'reconectar' ? 'Requiere reconexión' : 'Desconectada'}</p>
      {data.vence_en && <p className="text-xs">Vencimiento: {new Date(data.vence_en).toLocaleString('es-CL', {timeZone: 'America/Santiago'})}</p>}
      {data.sin_vencimiento_programado && <p className="text-xs">Token SUAT sin vencimiento programado. Meta o el portafolio pueden revocar el acceso.</p>}
      {!data.oauth_configurado && <p role="status" className="text-sm">La conexión estará disponible al configurar las credenciales de Instagram en el servidor.</p>}
      {!data.publicacion_externa_permitida && <p className="text-sm">La publicación externa está deshabilitada. La difusión manual sigue disponible.</p>}
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={authorized} disabled={busy} onChange={event => setAuthorized(event.target.checked)} /><span>Autorizo conectar mi cuenta profesional y preparar publicaciones que confirmaré antes de enviarlas a Instagram.</span></label>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || !authorized || !data.oauth_configurado} onClick={() => void action('connect')}>{data.conectado ? 'Volver a autorizar Instagram' : 'Conectar Instagram'}</Button>
        <Button type="button" variant="outline" disabled={busy || !authorized || !data.oauth_configurado || !data.usuario} onClick={() => void action('refresh')}>Renovar autorización</Button>
        {(data.usuario || data.conectado) && <Button type="button" variant="ghost" disabled={busy} onClick={() => void action('disconnect')}>Desconectar Instagram</Button>}
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void reload()}>Actualizar conexión de Instagram</Button></div>
      {data.usuario && <p className="text-xs">Renovar abre una nueva autorización de Meta. OpenMind solo necesita acceso al perfil de Instagram y publicación de contenido.</p>}
    </>}
    {notice && <p role="status" className="text-sm">{notice}</p>}{error && <Alert variant="error">{error}</Alert>}
  </section>;
}
