import type { UbicacionLanding } from './landing.types';

/** Solo destinos de Google Maps HTTPS; nunca URLs de redirección arbitrarias. */
export function safeMapsLink(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
    const host = url.hostname.toLowerCase();
    const short = host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps/'));
    const mapsHost = host === 'maps.google.com' || host === 'maps.google.cl';
    const google = ['google.com', 'www.google.com', 'google.cl', 'www.google.cl'].includes(host) && /^\/maps(?:\/|$)/.test(url.pathname);
    return (short && url.pathname.length > 1) || mapsHost || google ? url.href : '';
  } catch { return ''; }
}

export function mapLocation(value: UbicacionLanding) {
  const locality = [...new Set([value.comuna.trim(), value.ciudad.trim()].filter(Boolean))].join(' / ');
  const address = [value.direccion.trim(), locality, value.region.trim()].filter(Boolean).join(', ');
  const preciseEnough = !!(value.direccion.trim() && locality) || !!(locality && value.region.trim());
  const query = encodeURIComponent(address);
  return {
    address,
    href: safeMapsLink(value.enlace_maps) || (preciseEnough ? `https://www.google.com/maps/search/?api=1&query=${query}` : ''),
    embed: preciseEnough ? `https://maps.google.com/maps?q=${query}&output=embed` : '',
  };
}
