export interface BeneficioLanding {
  titulo: string;
  descripcion: string;
  icono: 'truck' | 'lock' | 'return' | 'chat';
}
export interface ContactoLanding {
  telefono: string; whatsapp: string; correo: string; instagram: string;
  facebook: string; sitio_web: string; horario: string;
}
export interface UbicacionLanding {
  direccion: string; comuna: string; ciudad: string; region: string; enlace_maps: string;
}
export interface ContenidoLanding {
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
