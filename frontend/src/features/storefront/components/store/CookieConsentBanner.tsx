import { AdminModal } from '../../../admin/components/ui/AdminModal';
import { fonts, visualConfigToCssVariables } from '../../visual/cssVariables';
import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStorefrontTemplate } from '../../hooks/useStorefrontTemplate';
import { useStore } from '../../context/StoreContext';
import { useVerifiedLegalScope } from '../../hooks/useVerifiedLegalScope';
import { consentKey, readConsent, saveConsent, resetConsent, type ConsentScope } from '../../services/cookieConsent';
import { getStoreConfigKey } from '../../visual/storage';
import { contrastRatio, institutionalTextColor } from '../../visual/contrast';
import { isActiveEditorPreview, isActiveTemplateThumbnailPreview } from '../../visual/pages';
import { disableGoogleAnalytics, initGoogleAnalytics } from '../../services/googleAnalyticsService';
import { initMetaPixel, revokeMetaPixelConsent, trackMetaPixelPageView } from '../../services/metaPixelService';
const sessionChoices=new Map<string,'accepted'|'essential_only'>();
export const COOKIE_CONSENT_EVENT_OPEN = 'openmind_open_cookie_banner';
export const COOKIE_CONSENT_EVENT_RESET = 'openmind_reset_cookie_consent';
export function CookieConsentBanner() {
  const { pathname, search } = useLocation();
  const session = useVerifiedLegalScope();
  const { route } = useStorefrontTemplate();
  const { config, visualConfig, legalPages, legalLoading, legalError, legalVerified, legalScopeKey } = useStore();
  const bannerConfig = legalPages.cookies.banner;
  const isEnabled = bannerConfig?.enabled !== false || !!config.gaId || !!config.pixelId;
  const page = legalPages.cookies;
  const legalVersion = JSON.stringify([page.version, page.fecha_vigencia ?? page.lastPublished]);
  const ready = session.ready && session.identity && legalVerified && !legalLoading && !legalError && legalScopeKey === getStoreConfigKey(session.identity) && !isActiveEditorPreview() && !isActiveTemplateThumbnailPreview();
  const scope = useMemo<ConsentScope | null>(() => ready && session.identity ? { ...session.identity, principal: session.principal, legalVersion } : null, [ready, session.key, legalVersion]);
  const key = scope ? consentKey(scope) : '';
  const [state, setState] = useState({ key: '', visible: false, message: '' });
  const [configuring,setConfiguring]=useState(false);
  const [optional,setOptional]=useState(false);
  useEffect(() => {
    setConfiguring(false);
    if (!scope) {disableGoogleAnalytics();revokeMetaPixelConsent();return;}
    const check = () => {
      let choice = null;
      try { choice = readConsent(localStorage, scope); } catch {  }
      choice ||= sessionChoices.get(key)||null;
      if (choice === 'accepted') {
        initGoogleAnalytics(config.gaId);
        if (initMetaPixel(config.pixelId)) trackMetaPixelPageView(`${pathname}${search}`);
      } else {
        disableGoogleAnalytics();
        revokeMetaPixelConsent();
      }
      setState({ key, visible: !choice, message: '' });
    };
    const open = () => {let choice=sessionChoices.get(key)||null;try{choice=readConsent(localStorage,scope)||choice;}catch{}setOptional(choice==='accepted');setState({key,visible:!choice,message:''});setConfiguring(true);};
    const reset = () => {
      disableGoogleAnalytics();
      revokeMetaPixelConsent();
      sessionChoices.delete(key);
      try { resetConsent(localStorage, scope); setState({ key, visible: true, message: '' }); }
      catch { setState({ key, visible: true, message: 'No pudimos guardar el cambio de preferencia en este navegador.' }); }
    };
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) check(); };
    const invalidate=()=>{if(!session.isCurrent()){disableGoogleAnalytics();revokeMetaPixelConsent();}};
    check();
    window.addEventListener('openmind-cart-session-changed',invalidate);
    window.addEventListener(COOKIE_CONSENT_EVENT_OPEN, open); window.addEventListener(COOKIE_CONSENT_EVENT_RESET, reset); window.addEventListener('storage', storage);
    return () => { window.removeEventListener('openmind-cart-session-changed',invalidate);disableGoogleAnalytics();revokeMetaPixelConsent();window.removeEventListener(COOKIE_CONSENT_EVENT_OPEN, open); window.removeEventListener(COOKIE_CONSENT_EVENT_RESET, reset); window.removeEventListener('storage', storage); };
  }, [key, config.gaId, config.pixelId, pathname, search]);
  const choose = (choice: 'accepted' | 'essential_only') => {
    if (!scope || !session.isCurrent()) return;
    let message = '';
    sessionChoices.set(key,choice);setConfiguring(false);
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
  if (!state.visible && !configuring) return state.message ? <p role="status">{state.message}</p> : null;
  const cookieUrl = route ? route('legal/cookies') : '/legal/cookies';
  const title = bannerConfig?.title || 'Aviso de Cookies';
  const message =
    bannerConfig?.message ||
    'Utilizamos cookies propias y de terceros para garantizar el funcionamiento seguro de la tienda, recordar tus preferencias y analizar la navegación.';
  const acceptText = bannerConfig?.acceptText || 'Aceptar cookies';
  const declineText = bannerConfig?.declineText || 'Rechazar las no esenciales';


  const colors = visualConfig.global.colors;
  const surface = `color-mix(in srgb, ${colors.primary} 8%, ${colors.background})`;
  const mutedSurface = `color-mix(in srgb, ${colors.primary} 16%, ${colors.background})`;
  const borderColor = `color-mix(in srgb, ${colors.primary} 28%, ${colors.background})`;

  const configuredBackground = colors.button || colors.primary;
  const configuredText = colors.buttonText;
  const validPair = (contrastRatio(configuredText || '', configuredBackground || '') ?? 0) >= 4.5;
  const actionBackground = validPair ? configuredBackground
    : /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(colors.primary || '') ? colors.primary : '#19345d';
  const actionText = validPair ? configuredText
    : (contrastRatio(configuredText || '', actionBackground) ?? 0) >= 4.5
      ? configuredText : institutionalTextColor(actionBackground);

  return (
    <div data-cookie-consent-root style={{...visualConfigToCssVariables(visualConfig),fontFamily:fonts[visualConfig.global.typography.body]}}>
    {!configuring&&<aside
      role="dialog"
      aria-live="polite"
      aria-label={title}
      className="fixed bottom-0 inset-x-0 z-[9999] p-3 sm:p-4 md:p-6 pointer-events-none"
    >
      {state.message && <p role="alert">{state.message}</p>}
      <div className="max-w-4xl mx-auto backdrop-blur-md border rounded-2xl shadow-[0_12px_36px_-6px_rgba(0,0,0,0.14),0_2px_8px_-2px_rgba(0,0,0,0.06)] p-4 sm:p-5 pointer-events-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all"
        style={{ backgroundColor: surface, color: colors.text, borderColor }}>
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 select-none" style={{ backgroundColor: mutedSurface, borderColor, color: colors.text }} aria-hidden="true">
            <svg
              className="w-5 h-5"
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
          <div className="space-y-1 text-xs sm:text-sm leading-relaxed">
            <p className="font-semibold tracking-tight">{title}</p>
            <p>
              {message}{' '}
              <Link
                to={cookieUrl}
                className="font-medium underline underline-offset-4 hover:opacity-75 transition-opacity"
              >
                Política de Cookies
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto md:max-w-sm shrink-0 justify-end pt-1 md:pt-0">
          <button
            type="button"
            onClick={handleDecline}
            className="flex-1 md:flex-initial min-h-11 px-3.5 py-2 text-xs sm:text-sm font-medium hover:brightness-95 rounded-xl border transition-[filter]"
            style={{ backgroundColor: mutedSurface, color: colors.text, borderColor }}
          >
            {declineText}
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="flex-1 md:flex-initial min-h-11 px-4 py-2 text-xs sm:text-sm font-semibold hover:brightness-95 rounded-xl shadow-sm transition-[filter]"
            style={{ backgroundColor: actionBackground, color: actionText }}
          >
            {acceptText}
          </button>
          <button type="button" className="min-h-11 px-3.5 py-2 text-xs sm:text-sm font-medium border rounded-xl w-full md:w-auto" style={{color:colors.text,borderColor}} onClick={()=>{setOptional(false);setConfiguring(true);}}>Configurar preferencias</button>
        </div>
      </div>
    </aside>}
    <AdminModal open={configuring} onClose={()=>setConfiguring(false)} title="Preferencias de cookies" className="feedback-dialog cookie-preferences-modal" size="md">
      <p className="mb-4">Las necesarias mantienen la sesión y el carrito. Las opcionales permiten estadísticas y marketing mediante Google Analytics y Meta Pixel.</p>
      <label className="flex items-center gap-3 mb-4"><input type="checkbox" checked disabled />Cookies necesarias (siempre activas)</label>
      <label className="flex items-center gap-3 mb-5"><input type="checkbox" checked={optional} onChange={event=>setOptional(event.target.checked)} />Permitir estadísticas y marketing</label>
      <div className="feedback-actions"><button type="button" data-modal-autofocus className="border rounded-lg px-4 py-2" onClick={()=>setConfiguring(false)}>Cancelar</button><button type="button" className="border rounded-lg px-4 py-2" onClick={()=>choose(optional?'accepted':'essential_only')}>Guardar preferencias</button></div>
    </AdminModal>
    </div>
  );
}
