import { isRecord } from './resolveVisualConfig';

/** The v1 envelope remains compatible; its key now includes installation and store. */
export const STORE_CONFIG_STORAGE_KEY = 'ua-entrepreneur-demo-v1';
export const STORE_CONFIG_CHANGED_EVENT = 'ua-store-config-changed';
export interface StoreIdentity { apiBaseUrl: string; storeId: string }

export function getStoreConfigKey(identity: StoreIdentity): string {
  return `${STORE_CONFIG_STORAGE_KEY}:store:${encodeURIComponent(identity.apiBaseUrl.replace(/\/+$/, ''))}:${encodeURIComponent(identity.storeId)}`;
}

function browserStorage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

function matchesIdentity(value: unknown, identity: StoreIdentity): boolean {
  return isRecord(value) && value.apiBaseUrl === identity.apiBaseUrl && value.storeId === identity.storeId;
}

function parseConfig(raw: string | null, identity: StoreIdentity): Record<string, unknown> {
  if (!raw) return {};
  try {
    const envelope: unknown = JSON.parse(raw);
    return isRecord(envelope) && envelope.version === 1 && matchesIdentity(envelope.identity, identity) && isRecord(envelope.config) ? envelope.config : {};
  } catch { return {}; }
}

export function readStoredStoreConfig(identity: StoreIdentity | null): Record<string, unknown> {
  if (!identity) return {};
  try {
    const storage = browserStorage();
    if (!storage) return {};
    const scoped = storage.getItem(getStoreConfigKey(identity));
    if (scoped !== null) return parseConfig(scoped, identity);
    // Unscoped legacy data has no provable owner. Only identity-tagged v1 is reusable.
    return parseConfig(storage.getItem(STORE_CONFIG_STORAGE_KEY), identity);
  } catch { return {}; }
}

export function saveStoredStoreConfig(config: object, identity: StoreIdentity): void {
  const storage = browserStorage();
  if (!storage) throw new Error('El almacenamiento local no está disponible.');
  const storageKey = getStoreConfigKey(identity);
  storage.setItem(storageKey, JSON.stringify({ version: 1, identity, config }));
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STORE_CONFIG_CHANGED_EVENT, { detail: { storageKey } }));
  }
}

export function isStoreConfigChange(event: Event, storageKey: string): boolean {
  if (typeof CustomEvent === 'undefined' || !(event instanceof CustomEvent)) return false;
  const detail: unknown = event.detail;
  return isRecord(detail) && detail.storageKey === storageKey;
}
