import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useStorefrontTemplate } from '../../hooks/useStorefrontTemplate';
import { useStore } from '../../context/StoreContext';
import { authService } from '../../../auth/services/authService';
import { useStorefrontIdentity } from './AccountNavigation';
import { isActiveEditorPreview } from '../../visual/pages';

export const COOKIE_CONSENT_EVENT_OPEN = 'openmind_open_cookie_banner';
export const COOKIE_CONSENT_EVENT_RESET = 'openmind_reset_cookie_consent';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const { route } = useStorefrontTemplate();
  const { legalPages } = useStore();
  const { user, loading: identityLoading } = useStorefrontIdentity();

  const bannerConfig = legalPages?.cookies?.banner;
  const isEnabled = bannerConfig?.enabled !== false;

  const getStorageKey = useCallback(() => {
    if (user && (user.id || user.email || user.username)) {
      const id = user.id ?? user.email ?? user.username;
      return `openmind_cookie_consent_user_${id}`;
    }
    const token = authService.getToken();
    if (token) {
      return `openmind_cookie_consent_token_${token.slice(-10)}`;
    }
    return 'openmind_cookie_consent_guest';
  }, [user]);

  const checkConsent = useCallback(() => {
    if (isActiveEditorPreview()) {
      setVisible(false);
      return;
    }
    if (!isEnabled) {
      setVisible(false);
      return;
    }

    try {
      const key = getStorageKey();
      const consent = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      if (!consent) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    } catch {
      setVisible(true);
    }
  }, [getStorageKey, isEnabled]);

  useEffect(() => {
    if (!identityLoading) {
      checkConsent();
    }
  }, [identityLoading, checkConsent]);

  useEffect(() => {
    const handleOpen = () => setVisible(true);
    const handleReset = () => {
      try {
        if (typeof localStorage !== 'undefined') {
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('openmind_cookie_consent')) {
              keysToRemove.push(k);
            }
          }
          keysToRemove.forEach(k => localStorage.removeItem(k));
        }
      } catch (e) {
        console.warn('Error al restablecer cookies:', e);
      }
      setVisible(true);
    };

    window.addEventListener(COOKIE_CONSENT_EVENT_OPEN, handleOpen);
    window.addEventListener(COOKIE_CONSENT_EVENT_RESET, handleReset);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_EVENT_OPEN, handleOpen);
      window.removeEventListener(COOKIE_CONSENT_EVENT_RESET, handleReset);
    };
  }, []);

  const handleAccept = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        const key = getStorageKey();
        localStorage.setItem(key, 'accepted');
        localStorage.setItem(`${key}_date`, new Date().toISOString());
        // Compatibilidad general
        localStorage.setItem('openmind_cookie_consent', 'accepted');
      }
    } catch (e) {
      console.warn('No se pudo guardar la preferencia de cookies:', e);
    }
    setVisible(false);
  };

  const handleDecline = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        const key = getStorageKey();
        localStorage.setItem(key, 'essential_only');
        localStorage.setItem(`${key}_date`, new Date().toISOString());
        localStorage.setItem('openmind_cookie_consent', 'essential_only');
      }
    } catch (e) {
      console.warn('No se pudo guardar la preferencia de cookies:', e);
    }
    setVisible(false);
  };

  if (!visible || !isEnabled) {
    return null;
  }

  const cookieUrl = route ? route('legal/cookies') : '/legal/cookies';
  const title = bannerConfig?.title || 'Aviso de Cookies';
  const message =
    bannerConfig?.message ||
    'Utilizamos cookies propias y de terceros para garantizar el funcionamiento seguro de la tienda, recordar tus preferencias y analizar la navegación.';
  const acceptText = bannerConfig?.acceptText || 'Aceptar cookies';
  const declineText = bannerConfig?.declineText || 'Solo necesarias';

  return (
    <aside
      role="dialog"
      aria-live="polite"
      aria-label={title}
      className="fixed bottom-0 inset-x-0 z-[9999] p-3 sm:p-4 md:p-6 pointer-events-none"
    >
      <div className="max-w-4xl mx-auto bg-white/95 text-neutral-900 backdrop-blur-md border border-neutral-200/90 rounded-2xl shadow-[0_12px_36px_-6px_rgba(0,0,0,0.14),0_2px_8px_-2px_rgba(0,0,0,0.06)] p-4 sm:p-5 pointer-events-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all">
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-neutral-100 border border-neutral-200/70 flex items-center justify-center text-neutral-700 shrink-0 mt-0.5 select-none" aria-hidden="true">
            <svg
              className="w-5 h-5 text-neutral-700"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
              <path d="M8.5 8.5v.01" />
              <path d="M7 14v.01" />
              <path d="M11 16v.01" />
              <path d="M15 12v.01" />
              <path d="M16 16v.01" />
            </svg>
          </div>
          <div className="space-y-1 text-xs sm:text-sm text-neutral-600 leading-relaxed">
            <p className="font-semibold text-neutral-900 tracking-tight">{title}</p>
            <p>
              {message}{' '}
              <Link
                to={cookieUrl}
                className="text-neutral-900 font-medium underline underline-offset-4 hover:text-neutral-600 transition-colors"
              >
                Política de Cookies
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0 justify-end pt-1 md:pt-0">
          <button
            type="button"
            onClick={handleDecline}
            className="flex-1 md:flex-initial px-3.5 py-2 text-xs sm:text-sm font-medium text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200/80 rounded-xl border border-neutral-200/80 transition-colors"
          >
            {declineText}
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="flex-1 md:flex-initial px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl shadow-sm transition-colors"
          >
            {acceptText}
          </button>
        </div>
      </div>
    </aside>
  );
}
