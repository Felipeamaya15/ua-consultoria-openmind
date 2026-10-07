import { createContext, useContext, useState, type ReactNode } from 'react';
import type { TemplateId } from '../../storefront/data/mockData';
import type { AdminConfig } from '../types';
import { adminRepository } from '../data/adminRepository';
interface AdminContextValue {
  config: AdminConfig; setConfig: (next: AdminConfig) => boolean;
  previewTemplate: TemplateId | null; setPreviewTemplate: (template: TemplateId | null) => void;
  updateTemplate: (template: TemplateId) => void; storageError: string;
}
const AdminContext = createContext<AdminContextValue | null>(null);
export function AdminProvider({children}: {children:ReactNode}) {
  const [config, setState] = useState(adminRepository.load);
  const [storageError,setStorageError] = useState('');
  const [previewTemplate,setPreviewTemplate] = useState<TemplateId|null>(null);
  function setConfig(next:AdminConfig) {
    try { adminRepository.save(next); setState(next); setStorageError(''); return true; }
    catch { setStorageError('No se pudo guardar. Revisa el espacio o los permisos del navegador; reduce el tamaño de las imágenes e intenta nuevamente.'); return false; }
  }
  function updateTemplate(template:TemplateId) { if (setConfig({...config,template})) setPreviewTemplate(null); }
  return <AdminContext.Provider value={{config,setConfig,previewTemplate,setPreviewTemplate,updateTemplate,storageError}}>{children}</AdminContext.Provider>;
}
export function useAdmin() { const value = useContext(AdminContext); if (!value) throw new Error('AdminProvider requerido'); return value; }
