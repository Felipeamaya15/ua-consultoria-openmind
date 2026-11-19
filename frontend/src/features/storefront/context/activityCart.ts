import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { API_BASE_URL } from '../../../api';
import { requestJson } from '../../../shared/services/apiRequest';
import { useStoreIdentity } from './StoreIdentityContext';
import { useCartSession, currentCartToken } from './cartSession';
import { guestCartKey } from '../services/guestCartStorage';
import { isActiveEditorPreview } from '../visual/pages';
import { validActivityId, canSelectPaidQuote, type PaidQuote } from '../../landing/services/paidActivityService';
import { trackMetaPixelEvent } from '../services/metaPixelService';

// Preview deliberately limited to local development; no payment or seat hold.
export function activityCartPreviewEnabled() {
  return typeof window !== 'undefined' && !isActiveEditorPreview(); // El servidor autoriza el modo de compra.
}
export interface ActivityCartItem {
  sectionId: string; title: string; quantity: number; price: number; version: string; start: string; zone: string;
}
const EMPTY: ActivityCartItem[] = [];
const cache = new Map<string, ActivityCartItem[]>();
const event = 'openmind-activity-cart-preview';
function validItem(x:unknown):x is ActivityCartItem {
  if (!x || typeof x!=='object') return false;
  const a=x as ActivityCartItem;
  if (typeof a.sectionId!=='string'||!validActivityId(a.sectionId)||typeof a.title!=='string'||typeof a.version!=='string'|| !/^[a-f0-9]{64}$/.test(a.version)||
    !Number.isSafeInteger(a.quantity)||a.quantity<1||a.quantity>10000||!Number.isSafeInteger(a.price)||a.price<1||a.price>999999999999||
    typeof a.start!=='string'||!Number.isFinite(Date.parse(a.start))||typeof a.zone!=='string')return false;
  try {new Intl.DateTimeFormat('es-CL',{timeZone:a.zone}).format();}catch{return false;}
  return true;
}
function read(key:string|null):ActivityCartItem[] {
  if(!key)return EMPTY;
  if(!cache.has(key)){
    let rows:ActivityCartItem[]=[];
    try{const raw:unknown=JSON.parse(sessionStorage.getItem(key)||'[]');if(Array.isArray(raw))rows=raw.filter(validItem).filter((item,i,all)=>all.findIndex(x=>x.sectionId===item.sectionId)===i);}catch{/* no storage */}
    cache.set(key,rows);
  }
  return cache.get(key)||EMPTY;
}
function write(key:string,rows:ActivityCartItem[]) {
  cache.set(key,rows);
  try{sessionStorage.setItem(key,JSON.stringify(rows));}catch{/* memory only */}
  window.dispatchEvent(new Event(event));
}
function subscribe(fn:()=>void){window.addEventListener(event,fn);return()=>window.removeEventListener(event,fn);}

// Solo para selecciones. No reserva cupos ni inicia pagos.
const SYNC_BASE = `${API_BASE_URL}/api/landing/carrito-actividades/`;
const syncLoaded = new Set<string>();
const syncFailed = new Set<string>();
const syncLoading = new Map<string, Promise<void>>();
const syncQueues = new Map<string, Promise<void>>();

function serverCall(
  token: string,
  url: string,
  method: 'GET' | 'PUT' | 'DELETE',
  data?: { cantidad: number; version: string },
): Promise<unknown> {
  return requestJson(url, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
}

function serial(
  key: string,
  action: () => Promise<void>,
): Promise<void> {
  const previous = syncQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(action);
  syncQueues.set(key, current.catch(() => {}));
  return current;
}

function loadSavedActivities(
  key: string,
  token: string,
  force = false,
): Promise<void> {
  const pending = syncLoading.get(key);
  if (pending) return pending;
  if (!force && syncLoaded.has(key)) return Promise.resolve();

  const task = serverCall(token, SYNC_BASE, 'GET')
    .then(data => {
      if (
        !data || typeof data !== 'object' ||
        !('items' in data) ||
        !Array.isArray(data.items)
      ) {
        throw new Error('Respuesta inválida del carrito.');
      }

      if (currentCartToken() !== token) return;

      const rows: ActivityCartItem[] =
        data.items.filter(validItem).slice(0, 20);

      syncLoaded.add(key);
      syncFailed.delete(key);
      write(key, rows);
    })
    .catch(error => {
      if (currentCartToken() === token) {
        syncFailed.add(key);
        window.dispatchEvent(new Event(event));
      }
      throw error;
    })
    .finally(() => {
      syncLoading.delete(key);
    });

  syncLoading.set(key, task);
  return task;
}

export function useActivityCart(){
  const {identity} = useStoreIdentity();
  const base = guestCartKey(identity);
  const {token, scope} = useCartSession();

  const key = activityCartPreviewEnabled() && base && scope
    ? `${base}:activity-v2:${scope}`
    : null;

  const snapshot = useCallback(
    () => token && key && !syncLoaded.has(key)
      ? EMPTY
      : read(key),
    [key, token],
  );

  const items = useSyncExternalStore(
    subscribe, snapshot, () => EMPTY,
  );

  useEffect(() => {
    if (!key || !token) return;

    void loadSavedActivities(key, token).catch(() => {
      console.warn('No se pudo recuperar el carrito de actividades.');
    });

    // Al volver desde otro dispositivo, se refresca el carrito.
    const refresh = () => {
      if (currentCartToken() !== token) return;

      void serial(
        key,
        () => loadSavedActivities(key, token, true),
      ).catch(() => {
        console.warn('No se pudo actualizar el carrito de actividades.');
      });
    };

    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [key, token]);

  const put = useCallback(async (
    sectionId: string,
    quote: PaidQuote,
    quantity: number,
    version: string,
  ): Promise<void> => {
    if (
      currentCartToken() !== token ||
      !key ||
      !validActivityId(sectionId) ||
      !canSelectPaidQuote(quote, quantity, version)
    ) {
      throw new Error(
        'Revisa disponibilidad y condiciones antes de agregar.'
      );
    }

    const item: ActivityCartItem = {
      sectionId,
      title: quote.titulo,
      quantity,
      price: quote.precio,
      version,
      start: quote.inicio,
      zone: quote.zona_horaria,
    };

    if (token) {
      await serial(key, async () => {
        await loadSavedActivities(key, token);
        if (currentCartToken() !== token) {
          throw new Error('La sesión cambió. Inicia nuevamente.');
        }

        const saved = await serverCall(
          token,
          `${SYNC_BASE}${encodeURIComponent(sectionId)}/`,
          'PUT',
          {cantidad: quantity, version},
        );

        if (!validItem(saved)) {
          throw new Error('El servidor devolvió una selección inválida.');
        }

        if (currentCartToken() === token) {
          write(key, [
            ...read(key).filter(x => x.sectionId !== sectionId),
            saved,
          ]);
        }
      });
    } else {
      write(key, [
        ...read(key).filter(x => x.sectionId !== sectionId),
        item,
      ]);
    }

    if (currentCartToken() !== token) return;
    trackMetaPixelEvent('AddToCart', {
      content_ids: [`activity:${sectionId}`],
      content_type: 'product',
      content_category: 'activity',
      contents: [{
        id: `activity:${sectionId}`,
        quantity,
        item_price: quote.precio
      }],
      value: quote.precio * quantity,
      currency: 'CLP',
    });
  }, [key, token]);

  const remove = useCallback((id: string) => {
    if (!key || currentCartToken() !== token) return;

    if (!token) {
      write(key, read(key).filter(x => x.sectionId !== id));
      return;
    }

    void serial(key, async () => {
      await loadSavedActivities(key, token);
      if (currentCartToken() !== token) return;

      await serverCall(
        token,
        `${SYNC_BASE}${encodeURIComponent(id)}/`,
        'DELETE',
      );

      if (currentCartToken() === token) {
        write(key, read(key).filter(x => x.sectionId !== id));
      }
    }).catch(() => {
      console.warn('No se pudo eliminar la actividad del servidor.');
    });
  }, [key, token]);

  const reduce = useCallback((id: string) => {
    if (!key || currentCartToken() !== token) return;

    const changeLocal = () => {
      write(key, read(key).flatMap(row =>
        row.sectionId !== id
          ? [row]
          : row.quantity > 1
            ? [{...row, quantity: row.quantity - 1}]
            : [],
      ));
    };

    if (!token) {
      changeLocal();
      return;
    }

    void serial(key, async () => {
      await loadSavedActivities(key, token);
      if (currentCartToken() !== token) return;

      const row = read(key).find(x => x.sectionId === id);
      if (!row) return;

      if (row.quantity <= 1) {
        await serverCall(
          token,
          `${SYNC_BASE}${encodeURIComponent(id)}/`,
          'DELETE',
        );
      } else {
        const saved = await serverCall(
          token,
          `${SYNC_BASE}${encodeURIComponent(id)}/`,
          'PUT',
          {
            cantidad: row.quantity - 1,
            version: row.version,
          },
        );
        if (!validItem(saved)) {
          throw new Error('Respuesta inválida del servidor.');
        }
      }

      if (currentCartToken() === token) changeLocal();
    }).catch(() => {
      console.warn('No se pudo actualizar la cantidad de participantes.');
    });
  }, [key, token]);

  const clear = useCallback(async (): Promise<void> => {
    if (!key || currentCartToken() !== token) return;

    if (!token) {
      write(key, []);
      return;
    }

    await serial(key, async () => {
      await loadSavedActivities(key, token);
      if (currentCartToken() !== token) return;

      await serverCall(token, SYNC_BASE, 'DELETE');

      if (currentCartToken() === token) {
        write(key, []);
      }
    });
  }, [key, token]);

  return {
    items, put, remove, reduce, clear,
    ready: !!key && (
      !token || syncLoaded.has(key)
    ),
  };
}
