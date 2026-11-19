import { useEffect, useState, useSyncExternalStore } from 'react';


export function currentCartToken(): string | null {
  try { return localStorage.getItem('token') || sessionStorage.getItem('token'); }
  catch { return null; }
}
const event = 'openmind-cart-session-changed';
function subscribe(fn: () => void) {
  window.addEventListener(event, fn);
  window.addEventListener('storage', fn);
  window.addEventListener('focus', fn);

  const timer = window.setInterval(fn, 700);
  return () => { window.removeEventListener(event, fn); window.removeEventListener('storage', fn); window.removeEventListener('focus', fn); window.clearInterval(timer); };
}
export function useCartToken() { return useSyncExternalStore(subscribe, currentCartToken, () => null); }
const scopes = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
function scopeFor(token: string): Promise<string> {
  const saved = scopes.get(token);
  if (saved) return Promise.resolve(saved);
  const prior = pending.get(token);
  if (prior) return prior;


  const work = (async () => {
    let scope: string;
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      scope = 'account-session-' + Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
    } catch {
      scope = 'volatile-' + Math.random().toString(36).slice(2) + '-' + Date.now();
    }
    scopes.set(token, scope);
    return scope;
  })();
  pending.set(token, work);
  return work;
}
export function useCartSession() {
  const token = useCartToken();
  const [resolved, setResolved] = useState<{token:string; scope:string} | null>(null);
  useEffect(() => {
    if (!token) return;
    let live = true;
    scopeFor(token).then(scope => { if (live && currentCartToken() === token) setResolved({token,scope}); });
    return () => { live = false; };
  }, [token]);
  const scope = !token ? 'guest-v2' : scopes.get(token) || (resolved?.token === token ? resolved.scope : null);
  return {token, scope};
}
