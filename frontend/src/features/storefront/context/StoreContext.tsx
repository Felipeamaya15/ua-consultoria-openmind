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
  type StoreConfig,
  type Product,
} from '../data/mockData';

import { fetchPublicProducts } from '../services/catalogService';
import { fetchLandingConfig } from '../../landing/services/landingService';
import type { LandingConfig } from '../../landing/types/landing.types';
import { isRecord, resolveVisualConfig, resolveStoreVisualConfig } from '../visual/resolveVisualConfig';
import { useStoreIdentity } from './StoreIdentityContext';
import { readPublishedLegalPages } from '../data/legalPublication';
import { templateFromPath } from '../visual/templates';
import { findImageSetting, captureOriginalImage, isLegacyEditableImage, readThemeImages, restoreOriginalImage, type OriginalImageStyle } from '../visual/imageSettings';
import { getStoreConfigKey, readStoredStoreConfig, isStoreConfigChange, STORE_CONFIG_CHANGED_EVENT } from '../visual/storage';
import { legalService } from '../services/legalService';
import { type LegalType, type LegalPage } from '../data/legalContent';

function readBusinessConfig(saved: Record<string, unknown>): StoreConfig {
  try {
    return {
      ...defaultStoreConfig,
      name: typeof saved.name === 'string' ? saved.name : defaultStoreConfig.name,
      description: typeof saved.description === 'string' ? saved.description : defaultStoreConfig.description,
      logo: typeof saved.logo === 'string' ? saved.logo : defaultStoreConfig.logo,
    };
  } catch {
    return defaultStoreConfig;
  }
}

const StoreContext = createContext({
  config: defaultStoreConfig,
  visualConfig: resolveVisualConfig(),
  landing: null as LandingConfig | null,
  landingLoading: true,
  landingError: '',
  landingProducts: [] as Product[],
  landingCatalogError: '',
  legalPages: readPublishedLegalPages(undefined),
  legalLoading: true,
  legalError: '',
  refreshLegal: async () => {},
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
  const localLegalPages = useMemo(() => readPublishedLegalPages(savedConfig), [savedConfig]);
  const activeTemplate = templateFromPath(pathname) ?? savedConfig.template;
  const visualConfig = useMemo(() => {
    return resolveStoreVisualConfig(savedConfig, activeTemplate);
  }, [activeTemplate, savedConfig]);
  const [landing, setLanding] = useState<LandingConfig | null>(null);
  const [landingLoading, setLandingLoading] = useState(true);
  const [landingError, setLandingError] = useState('');
  const [landingProducts, setLandingProducts] = useState<Product[]>([]);
  const [landingCatalogError, setLandingCatalogError] = useState('');
  const [backendLegalPages, setBackendLegalPages] = useState<Record<LegalType, LegalPage> | null>(null);
  const [legalLoading, setLegalLoading] = useState(true);
  const [legalError, setLegalError] = useState('');

  const legalPages = useMemo(() => {
    if (!backendLegalPages) return localLegalPages;
    return { ...localLegalPages, ...backendLegalPages };
  }, [localLegalPages, backendLegalPages]);

  const refreshLegal = async () => {
    try {
      const data = await legalService.fetchPublicLegalPages();
      setBackendLegalPages(data);
      setLegalError('');
    } catch (error) {
      setLegalError(error instanceof Error ? error.message : 'No se pudieron cargar las páginas legales.');
    } finally {
      setLegalLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchPublicProducts().then(products => { if (active) setLandingProducts(products); })
      .catch(error => { if (active) setLandingCatalogError(error instanceof Error ? error.message : 'No se pudo cargar el catálogo de landing.'); });
    fetchLandingConfig().then(data => { if (active) setLanding(data); })
      .catch(error => { if (active) setLandingError(error instanceof Error ? error.message : 'No se pudo cargar la configuración de landing.'); })
      .finally(() => { if (active) setLandingLoading(false); });
    legalService.fetchPublicLegalPages()
      .then(data => { if (active) { setBackendLegalPages(data); setLegalError(''); } })
      .catch(error => { if (active) setLegalError(error instanceof Error ? error.message : 'No se pudieron cargar las páginas legales.'); })
      .finally(() => { if (active) setLegalLoading(false); });
    return () => { active = false; };
  }, [storageRevision]);

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
      value={{
        config: {
          ...readBusinessConfig(savedConfig),
          primaryColor: visualConfig.global.colors.primary,
          secondaryColor: visualConfig.global.colors.secondary,
          accentColor: visualConfig.global.colors.accent,
          ...(landing ? { logo: landing.logo || '' } : {}),
        },
        visualConfig,
        landing,
        landingLoading,
        landingError,
        landingProducts,
        landingCatalogError,
        legalPages,
        legalLoading,
        legalError,
        refreshLegal,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export const useStore = () =>
  useContext(StoreContext);
