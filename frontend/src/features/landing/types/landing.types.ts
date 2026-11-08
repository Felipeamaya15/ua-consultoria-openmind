export interface BeneficioLanding {
  titulo: string;
  descripcion: string;
  icono: 'truck' | 'lock' | 'return' | 'chat';
}
export interface ContactoLanding {
  telefono: string; whatsapp: string; correo: string; instagram: string;
  facebook: string; sitio_web: string; horario: string;
  youtube?: string;
  redes_sociales?: import('./socialProfiles').SocialMetadata;
}
export interface UbicacionLanding {
  direccion: string; comuna: string; ciudad: string; region: string; enlace_maps: string;
}
export type TipoBloqueLanding = 'historia' | 'imagen_texto' | 'texto' | 'galeria' | 'cita' | 'personalizada';
export interface ImagenBloqueLanding { id: string; src: string; alt: string }
export interface BloqueLanding {
  id: string; tipo: TipoBloqueLanding; visible: boolean;
  titulo: string; subtitulo: string; texto: string; imagenes: ImagenBloqueLanding[];
  nombre_interno?: string;
  componentes?: import('./sectionElements').SectionElement[];
  actividad?: import('./sectionElements').SectionActivity | null;
}
export interface ContenidoLanding {
  /** Stable references to existing sections and unique commerce slots; no copied content. */
  orden_apartados?: string[];
  /** Absent keeps legacy template content; an explicit empty list hides it. */
  bloques?: BloqueLanding[];
  apariencia_bloques?: Partial<Record<'editorial' | 'minimal' | 'visual' | 'catalog', import('../../storefront/visual/blockAppearance').BlockStyles>>;
  productos_destacados: string[];
  categorias: string[];
  beneficios: BeneficioLanding[];
  contacto: ContactoLanding;
  ubicacion: UbicacionLanding;
}

export interface LandingConfig {
  id: number;
  tienda: number;
  titulo: string;
  descripcion: string;
  texto_boton: string;
  imagen_principal: string | null;
  logo: string | null;
  secciones: Record<string, boolean>;
  contenido?: Partial<ContenidoLanding>;
}

export type LandingInput = Pick<LandingConfig, 'titulo' | 'descripcion' | 'texto_boton' | 'secciones' | 'contenido'> & {
  imagen_principal: string | null;
  logo?: string | null;
};
