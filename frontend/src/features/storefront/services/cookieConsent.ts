export interface ConsentScope { apiBaseUrl: string; storeId: string; principal: string; legalVersion: string }
type Choice = 'accepted' | 'essential_only';
export function consentKey(scope: ConsentScope) {
  return `openmind:consent:v1:${encodeURIComponent(JSON.stringify([scope.apiBaseUrl.replace(/\/+$/, ''), scope.storeId, scope.principal, scope.legalVersion]))}`;
}
export function readConsent(storage: Storage, scope: ConsentScope): Choice | null {
  try {
    const data: unknown = JSON.parse(storage.getItem(consentKey(scope)) || 'null');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const row = data as Record<string, unknown>;
    if (row.version !== 1 || row.scope !== consentKey(scope) || (row.choice !== 'accepted' && row.choice !== 'essential_only') || typeof row.at !== 'string' || !Number.isFinite(Date.parse(row.at))) return null;
    return row.choice;
  } catch { return null; }
}
export function saveConsent(storage: Storage, scope: ConsentScope, choice: Choice) {
  storage.setItem(consentKey(scope), JSON.stringify({ version: 1, scope: consentKey(scope), choice, at: new Date().toISOString() }));
}
export function resetConsent(storage: Storage, scope: ConsentScope) { storage.removeItem(consentKey(scope)); }
