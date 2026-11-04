/** Public profile identity only. OAuth credentials belong to a separate future contract. */
export const SOCIAL_NETWORKS = ['instagram', 'facebook', 'youtube', 'whatsapp'] as const;
export type SocialNetwork = typeof SOCIAL_NETWORKS[number];
export interface SocialProfile { perfil: string; activo: boolean; mensaje: string }
export type SocialProfiles = Record<SocialNetwork, SocialProfile>;
export type SocialMetadata = Partial<Record<SocialNetwork, { activo: boolean; mensaje?: string }>>;
export const SOCIAL_LABELS: Record<SocialNetwork, string> = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', whatsapp: 'WhatsApp' };

export function profileLink(network: SocialNetwork, input: string, message = ''): { value: string; url: string; error: string } {
  const invalid = (error = 'Ingresa un identificador o enlace de perfil válido; no una publicación.') => ({ value: input, url: '', error });
  let value = input.trim();
  if (value.length > 500) return invalid('El perfil permite hasta 500 caracteres.');
  if (network === 'whatsapp') {
    const digits = value.replace(/\D/g, '');
    if (!/^\+?[0-9 ()-]+$/.test(value) || !/^[1-9][0-9]{7,14}$/.test(digits)) return invalid('Usa entre 8 y 15 dígitos, incluyendo el código de país.');
    if (message.trim().length > 500) return invalid('El mensaje permite hasta 500 caracteres.');
    return { value: '+' + digits, url: `https://wa.me/${digits}${message.trim() ? '?text=' + encodeURIComponent(message.trim()) : ''}`, error: '' };
  }
  const hosts = { instagram: ['instagram.com', 'www.instagram.com'], facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com'], youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com'] }[network];
  if (hosts.some(host => value.toLowerCase().startsWith(host))) value = 'https://' + value;
  if (!value.includes('://')) value = `https://${hosts[0]}/${network === 'youtube' ? '@' : ''}${value.replace(/^@/, '')}`;
  let url: URL;
  try { url = new URL(value); } catch { return invalid(); }
  // URL normalizes explicit default ports; also reject them before normalization.
  if (!['http:', 'https:'].includes(url.protocol) || !hosts.includes(url.hostname) || url.username || url.password || /:\d+(?:\/|$)/.test(value) || url.hash) return invalid('Usa un enlace de perfil de la red indicada.');
  const path = url.pathname.replace(/^\/+|\/+$/g, '');
  let valid = false;
  if (network === 'instagram') valid = /^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(path) && !path.includes('..') && !['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct'].includes(path.toLowerCase());
  if (network === 'facebook') {
    if (path === 'profile.php') {
      const id = url.searchParams.getAll('id');
      if (id.length !== 1 || !/^\d+$/.test(id[0]) || [...url.searchParams.keys()].some(key => key !== 'id')) return invalid();
      const canonical = `https://facebook.com/profile.php?id=${id[0]}`;
      return { value: canonical, url: canonical, error: '' };
    }
    valid = (/^[A-Za-z0-9.]{1,100}$/.test(path) && !['watch', 'reel', 'reels', 'stories', 'groups', 'events', 'sharer.php', 'login', 'plugins'].includes(path.toLowerCase())) || /^people\/[A-Za-z0-9_-]+\/\d+$/.test(path);
  }
  if (network === 'youtube') {
    let decoded: string;
    try { decoded = decodeURIComponent(path); } catch { return invalid(); }
    valid = /^@[\p{L}\p{N}_.-]{3,30}$/u.test(decoded) || /^channel\/UC[A-Za-z0-9_-]{22}$/.test(path) || /^(?:c|user)\/[A-Za-z0-9_-]{1,100}$/.test(path);
  }
  if (!valid) return invalid();
  const canonical = `https://${hosts[0]}/${path}`;
  return { value: canonical, url: canonical, error: '' };
}

export function publicSocialLinks(contact: Partial<Record<SocialNetwork, string>> & { redes_sociales?: SocialMetadata }) {
  return SOCIAL_NETWORKS.flatMap(network => {
    const profile = contact[network] || '';
    const metadata = contact.redes_sociales?.[network];
    if (!profile || metadata?.activo === false) return [];
    const result = profileLink(network, profile, metadata?.mensaje);
    // Legacy valid HTTP(S) links remain visible even if they use an older profile format.
    const legacy = !metadata ? network === 'whatsapp' && /^\+?[0-9 ()-]{5,40}$/.test(profile) ? `https://wa.me/${profile.replace(/\D/g, '')}` : network !== 'whatsapp' && /^https?:\/\//i.test(profile) ? profile : '' : '';
    const href = result.url || legacy;
    return href ? [{ label: SOCIAL_LABELS[network], icon: network === 'whatsapp' ? 'chat' : network, text: profile, href }] : [];
  });
}
