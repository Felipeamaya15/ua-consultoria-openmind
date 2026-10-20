import { useEffect, useState } from 'react';
import { authService } from '../../auth/services/authService';
import { useStoreIdentity } from '../../storefront/context/StoreIdentityContext';
import type { DraftScope } from '../domain/drafts';

function sessionToken() { try { return authService.getToken(); } catch { return null; } }
/** La identidad del usuario procede de /me autenticado, nunca de un ID local. */
export function useMarketingOwner() {
  const { identity } = useStoreIdentity();
  const [token, setToken] = useState(sessionToken);
  const [attempt, setAttempt] = useState(0);
  const [verified, setVerified] = useState<{ token: string | null; userId: string; error: string }>({ token: null, userId: '', error: '' });
  useEffect(() => {
    const sync = () => setToken(sessionToken());
    window.addEventListener('storage', sync); window.addEventListener('focus', sync);
    const timer = window.setInterval(sync, 500);
    return () => { clearInterval(timer); window.removeEventListener('storage', sync); window.removeEventListener('focus', sync); };
  }, []);
  useEffect(() => {
    let active = true;
    setVerified({ token: null, userId: '', error: '' });
    if (!token) return () => { active = false; };
    void authService.getMe().then(body => {
      if (!active || token !== sessionToken()) return;
      const user = body?.exito === true ? body.data : null;
      if (!Number.isSafeInteger(user?.id) || user.id < 1 || user.is_store_owner !== true) throw new Error('La sesión no corresponde a un emprendedor autorizado.');
      setVerified({ token, userId: String(user.id), error: '' });
    }).catch(() => { if (active) setVerified({ token, userId: '', error: 'No pudimos confirmar tu usuario. Reintenta para abrir Marketing de forma segura.' }); });
    return () => { active = false; };
  }, [token, attempt]);
  const current = token && token === sessionToken() && verified.token === token;
  const scope: DraftScope | null = current && identity && verified.userId ? { ...identity, userId: verified.userId } : null;
  return { scope, sessionKey: token, error: !token ? 'Inicia sesión como emprendedor para acceder a Marketing.' : current ? verified.error : '', retry: () => setAttempt(n => n + 1), isCurrent: () => !!token && token === sessionToken() };
}
