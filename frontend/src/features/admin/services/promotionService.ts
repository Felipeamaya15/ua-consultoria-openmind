import { API_BASE_URL } from '../../../api';
import type { Promotion } from '../../storefront/data/mockData';
import { requestJson } from '../../../shared/services/apiRequest';

type ApiPromotion = Omit<Promotion, 'id' | 'value' | 'minAmount' | 'maxUses' | 'endsAt'> & {
  id: number;
  value: string | number;
  minAmount?: string | number;
  maxUses?: number | null;
  endsAt?: string | null;
};

function token() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function normalize(row: ApiPromotion): Promotion {
  if (!row || !Number.isSafeInteger(row.id) || row.id <= 0 || typeof row.name !== 'string' || typeof row.code !== 'string'
    || !['percentage', 'fixed', 'free_shipping', 'precio_oferta'].includes(row.type) || typeof row.active !== 'boolean'
    || (typeof row.value !== 'string' && typeof row.value !== 'number') || String(row.value).trim() === '' || !Number.isFinite(Number(row.value)) || Number(row.value) < 0
    || (row.minAmount != null && (String(row.minAmount).trim() === '' || !Number.isFinite(Number(row.minAmount)) || Number(row.minAmount) < 0))) {
    throw new Error('La promoción recibida no es válida. Actualiza la página e intenta nuevamente.');
  }
  return {
    ...row,
    id: String(row.id),
    value: Number(row.value),
    minAmount: row.minAmount === undefined || row.minAmount === null ? undefined : Number(row.minAmount),
    maxUses: row.maxUses === undefined || row.maxUses === null ? undefined : Number(row.maxUses),
    startsAt: row.startsAt || '',
    endsAt: row.endsAt || undefined,
  };
}

async function request(path = '', init: RequestInit = {}): Promise<any> {
  const auth = token();
  if (!auth) throw new Error('Inicia sesión para administrar promociones.');
  return requestJson(`${API_BASE_URL}/api/promociones/${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? { Authorization: `Token ${auth}` } : {}),
      ...init.headers,
    },
  }, 'No se pudo procesar la promoción.');
}

function payload(promotion: Partial<Promotion>) {
  const fields = ['name', 'code', 'type', 'value', 'minAmount', 'maxUses', 'startsAt', 'endsAt', 'active'] as const;
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(promotion, field)) continue;
    const value = promotion[field];
    result[field] = field === 'name' ? String(value ?? '').trim() : field === 'code' ? String(value ?? '').trim().toUpperCase()
      : field === 'startsAt' || field === 'endsAt' ? (value || null) : field === 'maxUses' ? (value ?? null) : value;
  }
  return result;
}

export const promotionService = {
  async list(): Promise<Promotion[]> {
    const rows = await request();
    if (!Array.isArray(rows)) throw new Error('El listado de promociones no es válido.');
    return rows.map(normalize);
  },
  async create(promotion: Partial<Promotion>): Promise<Promotion> {
    return normalize(
      await request('', {
        method: 'POST',
        body: JSON.stringify(payload(promotion)),
      }),
    );
  },
  async update(promotion: Partial<Promotion> & Pick<Promotion, 'id'>): Promise<Promotion> {
    return normalize(
      await request(`${promotion.id}/`, {
        method: 'PATCH',
        body: JSON.stringify(payload(promotion)),
      }),
    );
  },
  async remove(id: string): Promise<void> {
    await request(`${id}/`, { method: 'DELETE' });
  },
};
