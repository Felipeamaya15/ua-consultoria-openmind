import { useEffect, useRef, useState } from 'react';
import { authService } from '../../auth/services/authService';
import { useStoreIdentity } from '../context/StoreIdentityContext';

function currentToken() { try { return authService.getToken(); } catch { return null; } }

/** Las claves persistentes contienen identidad confirmada, nunca tokens. */
export function useVerifiedLegalScope() {
  const { identity } = useStoreIdentity();
  const [token, setToken] = useState(currentToken);
  const [result, setResult] = useState<{ token: string; userId: string; owner: boolean } | null>(null);
  const [error, setError] = useState('');
  const storeKey = identity ? JSON.stringify([identity.apiBaseUrl.replace(/\/+$/, ''), identity.storeId]) : '';
  const current = useRef('');
  current.current = JSON.stringify([storeKey, currentToken()]);
  useEffect(() => {
    const sync = () => setToken(currentToken());
    const timer = window.setInterval(sync, 500);
    window.addEventListener('storage', sync); window.addEventListener('focus', sync);
    return () => { window.clearInterval(timer); window.removeEventListener('storage', sync); window.removeEventListener('focus', sync); };
  }, []);
  useEffect(() => {
    let active = true; setResult(null); setError('');
    if (token) void authService.getMe().then(body => {
      if (!active || currentToken() !== token) return;
      const user = body?.exito === true ? body.data : null;
      if (!Number.isSafeInteger(user?.id) || user.id < 1) throw new Error('No se pudo confirmar tu sesión.');
      setResult({ token, userId: String(user.id), owner: user.is_store_owner === true });
    }).catch(() => { if (active) setError('No pudimos confirmar tu sesión. Recarga para reintentar.'); });
    return () => { active = false; };
  }, [token, storeKey]);
  const verified = token === currentToken() && (!token || result?.token === token);
  const principal = !token ? 'guest' : result ? `user:${result.userId}` : '';
  const key = identity && verified ? JSON.stringify([identity.apiBaseUrl.replace(/\/+$/, ''), identity.storeId, principal]) : '';
  const stamp = JSON.stringify([storeKey, token]);
  return { key, identity, principal, owner: verified && !!token && result?.owner === true, ready: !!key, error,
    isCurrent: () => current.current === stamp && token === currentToken() };
}
