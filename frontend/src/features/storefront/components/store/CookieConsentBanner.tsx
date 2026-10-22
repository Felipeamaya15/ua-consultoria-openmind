import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStorefrontTemplate } from '../../hooks/useStorefrontTemplate';
import { useStore } from '../../context/StoreContext';
import { useVerifiedLegalScope } from '../../hooks/useVerifiedLegalScope';
import { consentKey, readConsent, saveConsent, resetConsent, type ConsentScope } from '../../services/cookieConsent';
import { getStoreConfigKey } from '../../visual/storage';
import { isActiveEditorPreview } from '../../visual/pages';
import { disableGoogleAnalytics, initGoogleAnalytics } from '../../services/googleAnalyticsService';
import { initMetaPixel, revokeMetaPixelConsent, trackMetaPixelPageView } from '../../services/metaPixelService';
export const COOKIE_CONSENT_EVENT_OPEN = 'openmind_open_cookie_banner';
export const COOKIE_CONSENT_EVENT_RESET = 'openmind_reset_cookie_consent';
export function CookieConsentBanner() {
  const { pathname, search } = useLocation();
  const session = useVerifiedLegalScope();
  const { route } = useStorefrontTemplate();
  const { config, legalPages, legalLoading, legalError, legalVerified, legalScopeKey } = useStore();
  const bannerConfig = legalPages.cookies.banner;
  const isEnabled = bannerConfig?.enabled !== false;
  const page = legalPages.cookies;
  const legalVersion = JSON.stringify([page.version, page.fecha_vigencia ?? page.lastPublished]);
  const ready = session.ready && session.identity && legalVerified && !legalLoading && !legalError && legalScopeKey === getStoreConfigKey(session.identity) && !isActiveEditorPreview();
  const scope = useMemo<ConsentScope | null>(() => ready && session.identity ? { ...session.identity, principal: session.principal, legalVersion } : null, [ready, session.key, legalVersion]);
  const key = scope ? consentKey(scope) : '';
  const [state, setState] = useState({ key: '', visible: false, message: '' });
  useEffect(() => {
    if (!scope) return;
    const check = () => {
      let choice = null;
      try { choice = readConsent(localStorage, scope); } catch { /* mostrar elección */ }
      if (choice === 'accepted') {
        initGoogleAnalytics(config.gaId);
        if (initMetaPixel(config.pixelId)) trackMetaPixelPageView(`${pathname}${search}`);
      } else {
        disableGoogleAnalytics();
        revokeMetaPixelConsent();
      }
      setState({ key, visible: !choice, message: '' });
    };
    const open = () => setState({ key, visible: true, message: '' });
    const reset = () => {
      disableGoogleAnalytics();
      revokeMetaPixelConsent();
      try { resetConsent(localStorage, scope); setState({ key, visible: true, message: '' }); }
      catch { setState({ key, visible: true, message: 'No pudimos guardar el cambio de preferencia en este navegador.' }); }
    };
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) check(); };
    check();
    window.addEventListener(COOKIE_CONSENT_EVENT_OPEN, open); window.addEventListener(COOKIE_CONSENT_EVENT_RESET, reset); window.addEventListener('storage', storage);
    return () => { window.removeEventListener(COOKIE_CONSENT_EVENT_OPEN, open); window.removeEventListener(COOKIE_CONSENT_EVENT_RESET, reset); window.removeEventListener('storage', storage); };
  }, [key, config.gaId, config.pixelId, pathname, search]);
  const choose = (choice: 'accepted' | 'essential_only') => {
    if (!scope || !session.isCurrent()) return;
    let message = '';
    try { saveConsent(localStorage, scope, choice); } catch { message = 'Tu elección se aplica en esta sesión; el navegador no permite recordarla.'; }
    if (choice === 'accepted') {
      initGoogleAnalytics(config.gaId);
      if (initMetaPixel(config.pixelId)) trackMetaPixelPageView(`${pathname}${search}`);
    } else {
      disableGoogleAnalytics();
      revokeMetaPixelConsent();
    }
    setState({ key, visible: false, message });
  };
  const handleAccept = () => choose('accepted');
  const handleDecline = () => choose('essential_only');
  if (!scope || state.key !== key || !isEnabled) return null;
  if (!state.visible) return state.message ? <p role="status">{state.message}</p> : null;
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
      {state.message && <p role="alert">{state.message}</p>}
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
