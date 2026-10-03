export interface TransbankConfig {
  configurado: boolean;
  id_tienda: number;
  codigo_comercio: string;
  ambiente: 'INTEGRACION' | 'PRODUCCION';
  activo: boolean;
  api_key_enmascarada?: string;
  fecha_actualizacion?: string;
}

export interface GuardarTransbankDTO {
  codigo_comercio: string;
  api_key: string;
  ambiente: 'INTEGRACION' | 'PRODUCCION';
  activo: boolean;
}

export interface ApiResponse<T> {
  exito: boolean;
  mensaje: string;
  data: T;
  error?: {
    codigo: string;
    detalles: Record<string, string[]> | null;
  };
}