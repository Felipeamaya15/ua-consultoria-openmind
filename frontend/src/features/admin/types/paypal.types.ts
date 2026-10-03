export interface ConfiguracionPayPal {
  id_tienda: number;
  client_id: string;
  ambiente: 'SANDBOX' | 'LIVE';
  activo: boolean;
  client_secret_enmascarado?: string;
  fecha_actualizacion?: string | null;
  configurado: boolean;
}

export interface ConfiguracionPayPalInput {
  client_id: string;
  client_secret?: string;
  ambiente: 'SANDBOX' | 'LIVE';
  activo: boolean;
}