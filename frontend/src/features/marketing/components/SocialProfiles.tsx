import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AdminCard, Alert, Button, Icon, Input, Textarea, Toggle } from '../../admin/components/ui';
import { ErrorState, LoadingState } from '../../../shared/components/states';
import { SOCIAL_LABELS, SOCIAL_NETWORKS, profileLink, type SocialNetwork, type SocialProfile, type SocialProfiles as Profiles } from '../../landing/types/socialProfiles';
import { fetchSocialProfiles, saveSocialProfile } from '../services/socialProfilesService';

const message = (error: unknown) => error instanceof Error ? error.message : 'No pudimos completar la operación. Intenta nuevamente.';
type CardProps = {
  network: SocialNetwork; initial: SocialProfile; isCurrent: () => boolean;
  onDirty: (network: SocialNetwork, dirty: boolean) => void;
};

function SocialProfileCard({ network, initial, isCurrent, onDirty }: CardProps) {
  const [saved, setSaved] = useState(initial), [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false), [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [submitted, setSubmitted] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => { onDirty(network, dirty); }, [network, dirty, onDirty]);
  const label = SOCIAL_LABELS[network];
  const preview = profileLink(network, draft.perfil, draft.mensaje);
  const invalid = (submitted || !!draft.perfil.trim()) ? preview.error : '';
  const edit = (next: Partial<SocialProfile>) => { setDraft(old => ({ ...old, ...next })); setError(''); setNotice(''); setConfirmDelete(false); };
  async function persist(remove = false) {
    if (request.current) return;
    setSubmitted(true); setError(''); setNotice('');
    if (!remove && preview.error) return;
    if (!isCurrent()) { setError('Tu sesión cambió. Vuelve a abrir Marketing.'); return; }
    const controller = new AbortController(); request.current = controller; setBusy(true);
    try {
      const result = await saveSocialProfile(network, remove ? null : draft, controller.signal);
      if (controller.signal.aborted || !isCurrent()) return;
      setSaved(result[network]); setDraft(result[network]); setConfirmDelete(false); setSubmitted(false);
      setNotice(remove ? 'Configuración eliminada.' : 'Cambios guardados.');
    } catch (cause) {
      if (!controller.signal.aborted && isCurrent()) setError(message(cause));
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function submit(event: FormEvent) { event.preventDefault(); void persist(); }
  return <AdminCard className="social-profile-card">
    <form onSubmit={submit} noValidate aria-label={`Configurar ${label}`}>
      <div className="social-profile-heading"><span className="social-profile-icon"><Icon name={network === 'whatsapp' ? 'chat' : network} className="w-6 h-6" /></span><h3>{label}</h3><span className="social-profile-state">{saved.perfil ? saved.activo ? 'Activa' : 'Desactivada' : 'Sin configurar'}</span></div>
      <fieldset disabled={busy} className="social-profile-fields">
        <Input label={network === 'whatsapp' ? 'Número de WhatsApp' : `Enlace o identificador de ${label}`} type={network === 'whatsapp' ? 'tel' : 'text'} value={draft.perfil} maxLength={500} autoComplete="off"
          placeholder={network === 'whatsapp' ? '+56 9 1234 5678' : network === 'youtube' ? '@mi-canal' : '@mi.tienda'}
          hint={network === 'whatsapp' ? 'Incluye el código de país. Entre 8 y 15 dígitos.' : network === 'youtube' ? 'Un @identificador o enlace de canal de YouTube.' : `Un identificador o enlace de perfil de ${label}.`}
          persistentHint error={invalid} onChange={event => edit({ perfil: event.target.value, ...(!saved.perfil && !draft.perfil ? { activo: true } : {}) })} />
        {network === 'whatsapp' && <Textarea label="Mensaje predeterminado (opcional)" value={draft.mensaje} maxLength={500} rows={3} onChange={event => edit({ mensaje: event.target.value })} hint="Hasta 500 caracteres. El comprador podrá editarlo antes de enviar." persistentHint />}
        <Toggle label={`Mostrar ${label} en la tienda`} checked={draft.activo} disabled={!draft.perfil.trim()} onChange={activo => edit({ activo })} />
        <div className="social-profile-preview"><span>Vista previa del enlace público</span>{preview.url ? <a href={preview.url} target="_blank" rel="noopener noreferrer">{preview.url}</a> : <p>Ingresa un perfil válido para ver el enlace.</p>}{preview.url && !draft.activo && <p>La red está desactivada y no se mostrará en la tienda.</p>}</div>
        <div className="social-profile-actions"><Button type="submit" disabled={!dirty || busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button>
          {saved.perfil && <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>Eliminar configuración</Button>}
          {dirty && <Button type="button" variant="ghost" onClick={() => { setDraft(saved); setError(''); setNotice(''); setSubmitted(false); setConfirmDelete(false); }}>Descartar cambios</Button>}
        </div>
        {confirmDelete && <div className="social-profile-delete"><p>¿Eliminar el enlace de {label} de tu tienda? Tu cuenta externa se conserva.</p><Button type="button" variant="outline" onClick={() => void persist(true)}>Confirmar eliminación</Button><Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button></div>}
      </fieldset>
      {dirty && <p className="social-profile-pending">Cambios sin guardar</p>}
      {error && <Alert variant="error">{error}</Alert>}
      <p role="status" className="social-profile-notice">{notice}</p>
    </form>
  </AdminCard>;
}

export function SocialProfiles({ active, isCurrent, onDirty }: { active: boolean; isCurrent: () => boolean; onDirty: (dirty: boolean) => void }) {
  const [profiles, setProfiles] = useState<Profiles | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [dirty, setDirty] = useState<Partial<Record<SocialNetwork, boolean>>>({});
  const cardDirty = useCallback((network: SocialNetwork, value: boolean) => setDirty(old => old[network] === value ? old : { ...old, [network]: value }), []);
  useEffect(() => { onDirty(Object.values(dirty).some(Boolean)); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  useEffect(() => {
    if (!active || profiles) return;
    const controller = new AbortController();
    setError('');
    fetchSocialProfiles(controller.signal).then(data => { if (!controller.signal.aborted && isCurrent()) setProfiles(data); }).catch(cause => { if (!controller.signal.aborted && isCurrent()) setError(message(cause)); });
    return () => controller.abort();
  }, [active, profiles, retry, isCurrent]);
  return <div className="social-profiles">
    <header><h2>Redes sociales de tu tienda</h2><p>Registra tus perfiles para que tus clientes puedan encontrarte.</p><p>Estos enlaces se muestran cuando Información de contacto está visible en la tienda. Registrar un enlace no conecta una cuenta ni autoriza publicaciones automáticas.</p></header>
    {!profiles && !error && <LoadingState>Cargando perfiles sociales…</LoadingState>}
    {error && <ErrorState onRetry={() => setRetry(old => old + 1)}>{error}</ErrorState>}
    {profiles && <div className="social-profiles-grid">{SOCIAL_NETWORKS.map(network => <SocialProfileCard key={network} network={network} initial={profiles[network]} isCurrent={isCurrent} onDirty={cardDirty} />)}</div>}
  </div>;
}
