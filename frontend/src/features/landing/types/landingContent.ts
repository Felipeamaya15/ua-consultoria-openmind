import { benefitIcon } from './benefitIcons';
import { profileLink, publicSocialLinks } from './socialProfiles';
import type { ContactoLanding, ContenidoLanding } from './landing.types';

export function normalizeLandingContent(value?: Partial<ContenidoLanding>): ContenidoLanding {
  return {
    ...(Array.isArray(value?.orden_apartados) ? {orden_apartados:value.orden_apartados} : {}),
    ...(value?.apariencia_bloques ? {apariencia_bloques:value.apariencia_bloques} : {}),
    ...(Array.isArray(value?.bloques) ? { bloques: value.bloques } : {}),
    productos_destacados: value?.productos_destacados ?? [],
    categorias: value?.categorias ?? [],
    beneficios: (value?.beneficios ?? []).map(b => ({ titulo: b.titulo, descripcion: b.descripcion || '', icono: benefitIcon(b.icono) })),
    contacto: { telefono: '', whatsapp: '', correo: '', instagram: '', facebook: '', sitio_web: '', horario: '', ...value?.contacto },
    ubicacion: { direccion: '', comuna: '', ciudad: '', region: '', enlace_maps: '', ...value?.ubicacion },
  };
}

/** Solo normaliza campos editados; los valores históricos no bloquean otros cambios. */
export function normalizeContactFields(value: ContactoLanding, previous: ContactoLanding) {
  const contact = { ...value };
  if (value.telefono !== previous.telefono) {
    const phone = value.telefono.trim();
    const result = phone ? profileLink('whatsapp', phone) : null;
    if (result?.error) return { contact, error: 'Revisa el teléfono del negocio: incluye el código de país y entre 8 y 15 dígitos.' };
    contact.telefono = result?.value || '';
  }
  if (value.correo !== previous.correo) {
    contact.correo = value.correo.trim();
    if (contact.correo && !/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(contact.correo)) return { contact, error: 'Ingresa un correo público válido.' };
  }
  if (value.sitio_web !== previous.sitio_web) {
    const raw = value.sitio_web.trim();
    if (raw) {
      try {
        const url = new URL(raw.includes('://') ? raw : 'https://' + raw);
        if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) throw new Error();
        contact.sitio_web = url.href;
      } catch { return { contact, error: 'Usa una dirección HTTPS válida para el sitio web externo, o deja el campo vacío.' }; }
    } else contact.sitio_web = '';
  }
  return { contact, error: '' };
}

export function contactChannels(c: ContactoLanding) {
  const phone = c.telefono.trim();
  const email = c.correo.trim();
  let website = '';
  try { const url = new URL(c.sitio_web.trim()); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) website = url.href; } catch { /* Campo opcional o histórico no válido. */ }
  return [
    { label: 'Teléfono del negocio', icon: 'phone', text: phone, href: /^\+?[0-9 ()-]{5,40}$/.test(phone) ? `tel:${phone.replace(/[^+0-9]/g, '')}` : '' },
    ...publicSocialLinks(c),
    { label: 'Correo', icon: 'mail', text: email, href: /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email) ? `mailto:${email}` : '' },
    { label: 'Sitio web externo', icon: 'globe', text: c.sitio_web.trim(), href: website },
  ].filter(item => item.text.trim() && item.href);
}
