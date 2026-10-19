import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';
import { fetchStoreInformation } from '../../storefront/services/storeInformationService';
import { fetchLandingConfig } from '../../landing/services/landingService';
import type { BrandSource, MarketingProduct } from '../domain/types';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function marketingImage(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (/^data:image\/(png|jpe?g|webp|gif|avif);base64,/i.test(value)) return value;
  if (!/^https?:\/\//i.test(value) && !value.startsWith('/')) return null;
  try {
    const url = new URL(value, API_BASE_URL);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
/** Conserva activo/es_activa de variantes, que el adaptador del listado general no expone. */
export function readMarketingProducts(data: unknown): MarketingProduct[] {
  if (!Array.isArray(data)) throw new Error('No pudimos reconocer el catálogo recibido. Intenta actualizarlo.');
  return data.map(item => {
    if (!record(item) || typeof item.id !== 'string' || !/^[a-f\d]{24}$/i.test(item.id)
      || typeof item.nombre !== 'string' || !item.nombre.trim() || typeof item.activo !== 'boolean') {
      throw new Error('El catálogo contiene información que no pudimos reconocer. Revísalo en Productos.');
    }
    return {
      id: item.id, name: item.nombre, category: typeof item.categoria === 'string' ? item.categoria : '', active: item.activo,
      description: typeof item.descripcion === 'string' ? item.descripcion : '',
      images: Array.isArray(item.imagenes) ? item.imagenes.map(marketingImage).filter((v): v is string => v !== null) : [],
      variants: Array.isArray(item.variantes) ? item.variantes.filter(record).map(v => ({
        sku: typeof v.sku === 'string' ? v.sku : '', price: v.precio, offerPrice: v.precio_oferta, stock: v.stock,
        active: v.activo !== false && v.es_activa !== false,
        attributes: Array.isArray(v.atributos_variante) ? v.atributos_variante.filter(record).flatMap(a =>
          typeof a.valor === 'string' && typeof (a.etiqueta || a.clave) === 'string'
            ? [{ label: String(a.etiqueta || a.clave), value: a.valor }] : []) : [],
      })) : [],
    };
  });
}
export async function fetchMarketingProducts(signal?: AbortSignal): Promise<MarketingProduct[]> {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para consultar tus productos.');
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/catalog/productos/admin/listado/`, {
      headers: { Authorization: `Token ${token}` }, cache: 'no-store', signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('No pudimos conectar con tu catálogo. Comprueba la conexión e intenta nuevamente.');
  }
  if (response.status === 401) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
  if (response.status === 403) throw new Error('Solo el propietario activo puede consultar los productos de esta tienda.');
  if (!response.ok) throw new Error('No pudimos cargar tus productos. Comprueba la conexión e intenta nuevamente.');
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new Error('No pudimos reconocer la respuesta del catálogo. Intenta actualizar los datos.'); }
  if (!record(body) || body.exito !== true) throw new Error('No pudimos consultar el catálogo de tu tienda.');
  return readMarketingProducts(body.data);
}
export async function fetchMarketingBrand(signal?: AbortSignal): Promise<BrandSource> {
  const [information, landing] = await Promise.allSettled([
    fetchStoreInformation(signal), fetchLandingConfig({ signal }),
  ]);
  if (information.status === 'rejected') throw new Error('No pudimos cargar el nombre de tu tienda. Intenta actualizar los datos.');
  if (!information.value.nombre.trim()) throw new Error('Completa el nombre de tu tienda en Configuración antes de crear la publicación.');
  return {
    name: information.value.nombre,
    logo: landing.status === 'fulfilled' ? marketingImage(landing.value?.logo) : null,
    warning: landing.status === 'rejected' ? 'No pudimos cargar el logo. La vista previa se mostrará con el nombre de la tienda.' : '',
  };
}
