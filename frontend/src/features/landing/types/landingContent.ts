import type { ContenidoLanding } from './landing.types';

export function normalizeLandingContent(value?: Partial<ContenidoLanding>): ContenidoLanding {
  return {
    ...(value?.apariencia_bloques ? {apariencia_bloques:value.apariencia_bloques} : {}),
    ...(Array.isArray(value?.bloques) ? { bloques: value.bloques } : {}),
    productos_destacados: value?.productos_destacados ?? [],
    categorias: value?.categorias ?? [],
    beneficios: (value?.beneficios ?? []).map(b => ({ titulo: b.titulo, descripcion: b.descripcion || '', icono: b.icono || 'truck' })),
    contacto: { telefono: '', whatsapp: '', correo: '', instagram: '', facebook: '', sitio_web: '', horario: '', ...value?.contacto },
    ubicacion: { direccion: '', comuna: '', ciudad: '', region: '', enlace_maps: '', ...value?.ubicacion },
  };
}
