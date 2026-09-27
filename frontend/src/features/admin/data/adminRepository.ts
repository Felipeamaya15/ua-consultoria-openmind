import { createDefaultAdminConfig } from './mockAdminData';
import type { AdminConfig } from '../types';
export const ADMIN_STORAGE_KEY = 'ua-entrepreneur-demo-v1';
// Single persistence boundary: replace with the Django repository later.
export const adminRepository = {
  load(): AdminConfig {
    const defaults = createDefaultAdminConfig();
    try {
      const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
      if (!raw) return defaults;
      const stored = JSON.parse(raw);
      if (stored?.version !== 1 || !stored.config || typeof stored.config !== 'object') return defaults;
      return {...defaults,...stored.config};
    } catch { return defaults; }
  },
  save(config: AdminConfig) {
    localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify({version:1,config}));
  }
};
