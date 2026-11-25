import { API_BASE_URL } from '../../../api';
import { requestJson } from '../../../shared/services/apiRequest';
import { LANDING_CONFIG_CHANGED } from '../../landing/services/landingService';
import { SOCIAL_NETWORKS, type SocialNetwork, type SocialProfile, type SocialProfiles } from '../../landing/types/socialProfiles';

const endpoint = `${API_BASE_URL}/api/landing/redes-sociales/`;
function headers() {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) throw new Error('Inicia sesión como propietario para administrar las redes sociales.');
  return { Authorization: `Token ${token}`, 'Content-Type': 'application/json' };
}
function profiles(data: unknown): SocialProfiles {
  if (!data || typeof data !== 'object' || SOCIAL_NETWORKS.some(network => {
    const value = (data as SocialProfiles)[network];
    return !value || typeof value.perfil !== 'string' || typeof value.activo !== 'boolean' || typeof value.mensaje !== 'string';
  })) throw new Error('No pudimos confirmar los perfiles. Recarga para comprobar si se guardaron.');
  return data as SocialProfiles;
}
export async function fetchSocialProfiles(signal?: AbortSignal): Promise<SocialProfiles> {
  return profiles(await requestJson(endpoint, { headers: headers(), cache: 'no-store', signal }));
}
export async function saveSocialProfile(network: SocialNetwork, value: SocialProfile | null, signal?: AbortSignal): Promise<SocialProfiles> {
  const saved = profiles(await requestJson(endpoint, { method: 'PATCH', headers: headers(), body: JSON.stringify({ [network]: value }), signal }));
  window.dispatchEvent(new Event(LANDING_CONFIG_CHANGED));
  return saved;
}
