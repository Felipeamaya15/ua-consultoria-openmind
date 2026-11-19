import { useEffect, useState } from 'react';
import { Button } from '../../admin/components/ui';
import { ErrorState, LoadingState } from '../../../shared/components/states';
import { SOCIAL_LABELS, SOCIAL_NETWORKS, profileLink, type SocialProfiles } from '../../landing/types/socialProfiles';
import { fetchSocialProfiles } from '../services/socialProfilesService';


export function SocialStatus({ active, isCurrent }: { active: boolean; isCurrent: () => boolean }) {
  const [profiles, setProfiles] = useState<SocialProfiles | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController(); setLoading(true); setError(''); setProfiles(null);
    fetchSocialProfiles(controller.signal).then(result => { if (!controller.signal.aborted && isCurrent()) setProfiles(result); }).catch(() => { if (!controller.signal.aborted && isCurrent()) setError('No pudimos consultar los perfiles registrados.'); }).finally(() => { if (!controller.signal.aborted && isCurrent()) setLoading(false); });
    return () => controller.abort();
  }, [active, attempt]);
  return <div className="media-library">
    {loading && <LoadingState>Consultando perfiles registrados…</LoadingState>}
    {error && <ErrorState onRetry={() => setAttempt(value => value + 1)}>{error}</ErrorState>}
    {profiles && <ul>{SOCIAL_NETWORKS.map(network => {
      const profile = profiles[network], link = profile.perfil ? profileLink(network, profile.perfil, profile.mensaje) : null;
      return <li key={network}><strong>{SOCIAL_LABELS[network]}</strong>: {profile.activo && link?.url ? <>Perfil activo · <a href={link.url} target="_blank" rel="noopener noreferrer">Revisar perfil ↗</a></> : profile.perfil ? 'Perfil desactivado o pendiente de corregir' : 'Sin perfil configurado'}</li>;
    })}</ul>}
    <p className="media-help">Un perfil registrado no autoriza publicaciones automáticas. Las acciones disponibles en Difusión son manuales y no confirman una publicación externa.</p>
    <Button type="button" variant="outline" disabled={loading} onClick={() => setAttempt(value => value + 1)}>Actualizar estados de redes</Button>
  </div>;
}
