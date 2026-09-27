const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface ApiResponse<T> {
  exito: boolean;
  mensaje: string;
  data: T;
}

export interface AtributoGeneral {
  clave: string;
  etiqueta: string | null;
  valor: string;
}


export interface AtributoVariante {
  clave: string;
  etiqueta: string | null;
  valores: string[];
}

export interface ProductoAtributos {
  atributos_generales: AtributoGeneral[];
  atributos_variante: AtributoVariante[];
}


export async function fetchProductoAtributos(
  slug: string,
  signal?: AbortSignal,
): Promise<ProductoAtributos | null> {
  const response = await fetch(
    `${API_URL}/api/catalog/productos/${encodeURIComponent(slug)}/atributos/`,
    { signal },
  );

  if (response.status === 404) return null;

  let body: ApiResponse<ProductoAtributos> | null = null;
  try {
    body = await response.json();
  } catch {

  }
  if (!response.ok || !body?.exito) {
    throw new Error(body?.mensaje || 'No se pudieron obtener los atributos del producto');
  }
  return body.data;
}