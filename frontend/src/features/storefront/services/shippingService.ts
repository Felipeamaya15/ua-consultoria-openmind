const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export interface EventoSeguimiento {
  fecha_hora: string;
  estado: string;
  descripcion: string;
  ubicacion: string;
}

export interface DetalleSeguimiento {
  numero_seguimiento: string;
  proveedor: string;
  estado_actual: string;
  descripcion_estado: string;
  fecha_estimada_entrega: string;
  historial: EventoSeguimiento[];
}

export interface OpcionCotizacion {
  proveedor: string;
  servicio: string;
  costo: number;
  dias_habiles_entrega: number;
  es_cobertura_valida: boolean;
  es_gratis: boolean;
}

export interface ResultadoCotizacion {
  destino: {
    comuna: string;
    region: string;
  };
  total_items: number;
  total_carrito: number;
  opcion_recomendada: OpcionCotizacion | null;
  opciones: OpcionCotizacion[];
}

export const shippingService = {
  async getTracking(numeroSeguimiento: string): Promise<DetalleSeguimiento> {
    const cleanTracking = numeroSeguimiento.trim();
    const response = await fetch(`${API_BASE}/api/logistica/seguimiento/${encodeURIComponent(cleanTracking)}/`);
    const data = await response.json();
    if (!response.ok || !data.exito) {
      throw new Error(data.mensaje || 'No se encontró información de seguimiento para este código.');
    }
    return data.data;
  },

  async quote(params: {
    region: string;
    comuna: string;
    total_carrito: number;
    total_items: number;
    peso_kg?: number;
    proveedor?: string;
  }): Promise<ResultadoCotizacion> {
    const response = await fetch(`${API_BASE}/api/logistica/cotizar/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...params,
        total_carrito: params.total_carrito.toFixed(2),
        proveedor: params.proveedor || 'chilexpress',
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.exito) {
      throw new Error(data.mensaje || 'Error al cotizar envío.');
    }
    return data.data;
  },
};
