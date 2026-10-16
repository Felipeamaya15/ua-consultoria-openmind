import { API_BASE_URL } from '../../../api';
import type { Promotion } from '../../storefront/data/mockData';

type ApiPromotion = Omit<Promotion, 'id' | 'value' | 'minAmount'> & {
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
  return {
    ...row,
    id: String(row.id),
    value: Number(row.value),
    minAmount: row.minAmount === undefined || row.minAmount === null ? undefined : Number(row.minAmount),
    maxUses: row.maxUses === undefined || row.maxUses === null ? undefined : Number(row.maxUses),
    endsAt: row.endsAt || undefined,
  };
}

async function request(path = '', init: RequestInit = {}): Promise<any> {
  const auth = token();
  const response = await fetch(`${API_BASE_URL}/api/promociones/${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? { Authorization: `Token ${auth}` } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.exito === false) {
    const details = body.error?.detalles;
    const first =
      details && typeof details === 'object'
        ? Object.values(details)
            .flat()
            .find((value) => typeof value === 'string')
        : null;
    throw new Error(first || body.mensaje || 'No se pudo procesar la promoción.');
  }
  return body.data;
}

function payload(promotion: Partial<Promotion>) {
  return {
    name: promotion.name?.trim(),
    code: promotion.code?.trim().toUpperCase(),
    type: promotion.type,
    value: promotion.type === 'free_shipping' ? 0 : (promotion.value ?? 0),
    minAmount: promotion.minAmount ?? 0,
    maxUses: promotion.maxUses ?? null,
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt || null,
    active: promotion.active ?? true,
  };
}

export const promotionService = {
  async list(): Promise<Promotion[]> {
    return (await request()).map(normalize);
  },
  async create(promotion: Partial<Promotion>): Promise<Promotion> {
    return normalize(
      await request('', {
        method: 'POST',
        body: JSON.stringify(payload(promotion)),
      }),
    );
  },
  async update(promotion: Promotion): Promise<Promotion> {
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