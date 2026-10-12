import { createContext, useContext, useState, type ReactNode } from 'react';

export const ADMIN_HELP_KEY = 'emprendedor-show-help';
export function readAdminHelpPreference(): boolean {
  try { return localStorage.getItem(ADMIN_HELP_KEY) !== 'false'; }
  catch { return true; }
}
export function saveAdminHelpPreference(value: boolean): void {
  try { localStorage.setItem(ADMIN_HELP_KEY, String(value)); }
  catch { /* Help remains usable when browser storage is unavailable. */ }
}
const AdminHelpContext = createContext({ showHelp: true, toggleHelp: () => {} });
export function AdminHelpProvider({ children }: { children: ReactNode }) {
  const [showHelp, setShowHelp] = useState(readAdminHelpPreference);
  function toggleHelp() {
    const next = !showHelp;
    saveAdminHelpPreference(next);
    setShowHelp(next);
  }
  return <AdminHelpContext.Provider value={{ showHelp, toggleHelp }}>{children}</AdminHelpContext.Provider>;
}
export const useAdminHelp = () => useContext(AdminHelpContext);
