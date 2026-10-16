import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  defaultStoreConfig,
  type TemplateId,
  type Product,
} from '../data/mockData';

import { fetchPublicProducts } from '../services/catalogService';
import { LANDING_CONFIG_CHANGED, fetchLandingConfig } from '../../landing/services/landingService';
import { fetchStoreInformation, STORE_INFORMATION_CHANGED, type StoreInformation } from '../services/storeInformationService';
import type { LandingConfig } from '../../landing/types/landing.types';
import { isRecord, resolveVisualConfig, resolveStoreVisualConfig } from '../visual/resolveVisualConfig';
import { useStoreIdentity } from './StoreIdentityContext';
import { readPublishedLegalPages } from '../data/legalPublication';
import { templateFromPath } from '../visual/templates';
import { findImageSetting, captureOriginalImage, isLegacyEditableImage, readThemeImages, restoreOriginalImage, type OriginalImageStyle } from '../visual/imageSettings';
import { getStoreConfigKey, readStoredStoreConfig, isStoreConfigChange, STORE_CONFIG_CHANGED_EVENT } from '../visual/storage';

const StoreContext = createContext({
  config: { ...defaultStoreConfig, name: '', description: '', logo: '' },
  visualConfig: resolveVisualConfig(),
  landing: null as LandingConfig | null,
  landingLoading: true,
  landingError: '',
  landingProducts: [] as Product[],
  landingCatalogError: '',
  legalPages: readPublishedLegalPages(undefined),
});

function readTheme(saved: Record<string, unknown>, template: TemplateId): Record<string, unknown> | null {
  try {
    const theme = isRecord(saved.themeEditor) ? saved.themeEditor[template] : null;
    return isRecord(theme) ? theme : null;
  } catch {
    return null;
  }
}

function applyImageCustomizations(theme: Record<string, unknown> | null, originals: Map<HTMLImageElement, OriginalImageStyle>) {
  const settings = readThemeImages(theme?.images);

  const images = Array.from(
    document.querySelectorAll<HTMLImageElement>('img'),
  );

  images.forEach((img, index) => {
    if (!isLegacyEditableImage(img)) return;
    const setting = findImageSetting(settings, img, index);

    if (!setting) return;
    if (!originals.has(img)) originals.set(img, captureOriginalImage(img));

    if (setting.src && img.src !== setting.src) {
      img.src = setting.src;
    }

    img.style.objectPosition =
      `${setting.x ?? 50}% ${setting.y ?? 50}%`;

    img.style.transform =
      `scale(${(setting.scale ?? 100) / 100})`;

    img.style.transformOrigin = 'center';
    img.style.objectFit = setting.fit ?? originals.get(img)?.fit ?? '';
    img.style.borderRadius =
      `${setting.radius ?? 0}px`;
  });
}

export function StoreProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const { identity } = useStoreIdentity();
  const storageKey = identity ? getStoreConfigKey(identity) : null;
  const [storageRevision, setStorageRevision] = useState(0);
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    const refresh = () => setStorageRevision(value => value + 1);
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) refresh(); };
    const onChange = (event: Event) => { if (isStoreConfigChange(event, storageKey)) refresh(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(STORE_CONFIG_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(STORE_CONFIG_CHANGED_EVENT, onChange);
    };
  }, [storageKey]);
  const savedConfig = useMemo(() => readStoredStoreConfig(identity), [identity, storageRevision]);
  const legalPages = useMemo(() => readPublishedLegalPages(savedConfig), [savedConfig]);
  const activeTemplate = templateFromPath(pathname) ?? savedConfig.template;
  const visualConfig = useMemo(() => {
    return resolveStoreVisualConfig(savedConfig, activeTemplate);
  }, [activeTemplate, savedConfig]);
  // Async results are usable only for their confirmed installation and store.
  const [businessResult, setBusiness] = useState<{ key: string; value: StoreInformation } | null>(null);
  const business = businessResult?.key === storageKey ? businessResult.value : null;
  useEffect(() => {
    if (!storageKey) return;
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      void fetchStoreInformation(request.signal).then(value => {
        if (!request.signal.aborted) setBusiness({ key: storageKey, value });
      }).catch(() => { /* Keep only the last confirmed value for this same store. */ });
    };
    refresh();
    window.addEventListener(STORE_INFORMATION_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      controller?.abort();
      window.removeEventListener(STORE_INFORMATION_CHANGED, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [storageKey]);
  const [landingResult, setLanding] = useState<{ key: string; value: LandingConfig | null; error: string; loading: boolean } | null>(null);
  const [catalogResult, setCatalog] = useState<{ key: string; products: Product[]; error: string } | null>(null);
  const currentLanding = landingResult?.key === storageKey ? landingResult : null;
  const landing = currentLanding?.value ?? null;
  const landingLoading = currentLanding?.loading ?? true;
  const landingError = currentLanding?.error ?? '';
  const landingProducts = catalogResult?.key === storageKey ? catalogResult.products : [];
  const landingCatalogError = catalogResult?.key === storageKey ? catalogResult.error : '';
  useEffect(() => {
    if (!identity || !storageKey) return;
    const catalogController = new AbortController();
    let landingController: AbortController | undefined;
    void fetchPublicProducts({ signal: catalogController.signal }).then(products => {
      if (!catalogController.signal.aborted) setCatalog({ key: storageKey, products, error: '' });
    }).catch(error => {
      if (!catalogController.signal.aborted) setCatalog({ key: storageKey, products: [], error: error instanceof Error ? error.message : 'No se pudo cargar el catálogo de landing.' });
    });
    const refresh = () => {
      landingController?.abort();
      const request = new AbortController();
      landingController = request;
      setLanding(previous => ({ key: storageKey, value: previous?.key === storageKey ? previous.value : null, error: '', loading: true }));
      void fetchLandingConfig({ signal: request.signal }).then(data => {
        if (data && String(data.tienda) !== identity.storeId) throw new Error('La configuración de inicio no corresponde a esta tienda.');
        if (!request.signal.aborted) setLanding({ key: storageKey, value: data, error: '', loading: false });
      }).catch(error => {
        if (!request.signal.aborted) setLanding(previous => ({ key: storageKey, value: previous?.key === storageKey ? previous.value : null, error: error instanceof Error ? error.message : 'No se pudo cargar la configuración de landing.', loading: false }));
      });
    };
    refresh();
    window.addEventListener(LANDING_CONFIG_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      catalogController.abort(); landingController?.abort();
      window.removeEventListener(LANDING_CONFIG_CHANGED, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [identity, storageKey]);

  useEffect(() => {
    const template = templateFromPath(pathname);
    if (!template || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const theme = readTheme(savedConfig, template);

    const originals = new Map<HTMLImageElement, OriginalImageStyle>();
    applyImageCustomizations(theme, originals);

    const observer = new MutationObserver(() => {
      applyImageCustomizations(theme, originals);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      for (const [img, original] of originals) {
        restoreOriginalImage(img, original);
      }
    };
  }, [pathname, savedConfig]);

  return (
    <StoreContext.Provider
      value={{ config: { ...defaultStoreConfig, name: business?.nombre ?? '', description: business?.descripcion ?? '', logo: landing?.logo || '', primaryColor: visualConfig.global.colors.primary, secondaryColor: visualConfig.global.colors.secondary, accentColor: visualConfig.global.colors.accent }, visualConfig, landing, landingLoading, landingError, landingProducts, landingCatalogError, legalPages }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export const useStore = () =>
  useContext(StoreContext);
