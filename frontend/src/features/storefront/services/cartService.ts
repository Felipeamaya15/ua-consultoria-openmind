const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export interface CartItemDTO {
  id_item_carrito: number;
  id_producto: number;
  nombre_producto?: string;
  nombre?: string;
  precio_unitario?: string | number;
  precio?: number;
  cantidad: number;
  sku?: string | null;
  imagen?: string;
  stock_disponible?: number;
  atributos?: Record<string, string>;
}

export interface CartDTO {
  id_carrito?: number;
  items: CartItemDTO[];
  subtotal?: number;
  total?: number;
}

const getAuthHeaders = () => {
  const token =
    localStorage.getItem('token') ||
    sessionStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? {Authorization: `Token ${token}`} : {}),
  };
};

export const cartService = {
  async obtenerCarrito(): Promise<any> {
    const res = await fetch(`${API_BASE}/api/catalog/carrito/items/`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    const json = await res.json();
    if (!res.ok || !json.exito) {
      throw new Error(json.mensaje || 'Error al obtener el carrito');
    }
    return json.data;
  },

  async agregarItem(idProducto: number, cantidad: number = 1, sku?: string): Promise<CartItemDTO> {
    const res = await fetch(`${API_BASE}/api/catalog/carrito/items/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        id_producto: idProducto,
        cantidad,
        sku: sku || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.exito) {
      throw new Error(json.mensaje || 'Error al agregar el ítem al carrito');
    }
    return json.data;
  },

  async modificarCantidad(idItemCarrito: number, nuevaCantidad: number): Promise<CartItemDTO> {
    const res = await fetch(`${API_BASE}/api/catalog/carrito/items/${idItemCarrito}/`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        cantidad: nuevaCantidad,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.exito) {
      throw new Error(json.mensaje || 'Error al modificar la cantidad');
    }
    return json.data;
  },

  async eliminarItem(idItemCarrito: number): Promise<void> {
    const res = await fetch(`${API_BASE}/api/catalog/carrito/items/${idItemCarrito}/`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.mensaje || 'Error al eliminar el producto del carrito');
    }
  },
};
