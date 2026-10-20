import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { TemplateId } from '../../storefront/data/mockData';
import type { AdminConfig } from '../types';
import { adminRepository } from '../data/adminRepository';
import { useStoreIdentity } from '../../storefront/context/StoreIdentityContext';
import { humanizeAdminError } from '../utils/humanizeError';
import { getStoreConfigKey, isStoreConfigChange, STORE_CONFIG_CHANGED_EVENT, type StoreIdentity } from '../../storefront/visual/storage';
import { fetchStoreInformation, STORE_INFORMATION_CHANGED, type StoreInformation } from '../../storefront/services/storeInformationService';
interface AdminContextValue {
  config: AdminConfig; setConfig: (next: AdminConfig) => boolean;
  previewTemplate: TemplateId | null; setPreviewTemplate: (template: TemplateId | null) => void;
  updateTemplate: (template: TemplateId) => void; storageError: string;
}
const AdminContext = createContext<AdminContextValue | null>(null);
function ScopedAdminProvider({children, identity}: {children:ReactNode; identity: StoreIdentity}) {
  const [config, setState] = useState(() => adminRepository.load(identity));
  const [business, setBusiness] = useState<StoreInformation | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => { void fetchStoreInformation(controller.signal).then(value => { if (!controller.signal.aborted) setBusiness(value); }).catch(() => {}); };
    refresh();
    window.addEventListener(STORE_INFORMATION_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    return () => { controller.abort(); window.removeEventListener(STORE_INFORMATION_CHANGED, refresh); window.removeEventListener('focus', refresh); };
  }, [identity]);
  const [storageError,setStorageError] = useState('');
  const [previewTemplate,setPreviewTemplate] = useState<TemplateId|null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = getStoreConfigKey(identity);
    const refresh = () => setState(adminRepository.load(identity));
    const onStorage = (event: StorageEvent) => { if (event.key === key || event.key === null) refresh(); };
    const onChange = (event: Event) => { if (isStoreConfigChange(event, key)) refresh(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(STORE_CONFIG_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(STORE_CONFIG_CHANGED_EVENT, onChange);
    };
  }, [identity]);
  function setConfig(next:AdminConfig) {
    try { adminRepository.save(next, identity); setState(adminRepository.load(identity)); setStorageError(''); return true; }
    catch { setStorageError('No se pudo guardar. Revisa el espacio o los permisos del navegador; reduce el tamaño de las imágenes e intenta nuevamente.'); return false; }
  }
  function updateTemplate(template:TemplateId) { if (setConfig({...config,template})) setPreviewTemplate(null); }
  return <AdminContext.Provider value={{config: business ? {...config, name: business.nombre, description: business.descripcion || ''} : config,setConfig,previewTemplate,setPreviewTemplate,updateTemplate,storageError}}>{children}</AdminContext.Provider>;
}
export function AdminProvider({children}: {children:ReactNode}) {
  const { identity, loading, error, retry } = useStoreIdentity();
  if (loading) return <p role="status">Confirmando tienda...</p>;
  if (!identity) return <div className="admin-identity-error"><h1>No pudimos abrir tu tienda</h1><p role="alert">{humanizeAdminError(error, 'No pudimos cargar tu tienda. Intenta nuevamente en unos momentos.')}</p><button type="button" onClick={retry}>Intentar nuevamente</button></div>;
  return <ScopedAdminProvider key={getStoreConfigKey(identity)} identity={identity}>{children}</ScopedAdminProvider>;
}
export function useAdmin() { const value = useContext(AdminContext); if (!value) throw new Error('AdminProvider requerido'); return value; }
