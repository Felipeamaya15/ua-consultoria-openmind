import {
  createContext,
  useContext,
  useEffect,
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

const ADMIN_STORAGE_KEY = 'ua-entrepreneur-demo-v1';

function readBusinessConfig(): StoreConfig {
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return defaultStoreConfig;

    const parsed = JSON.parse(raw);
    const saved = parsed?.config;
    if (!saved || typeof saved !== 'object') return defaultStoreConfig;

    return {
      ...defaultStoreConfig,
      name: saved.name || defaultStoreConfig.name,
      description: saved.description || defaultStoreConfig.description,
      logo: saved.logo || defaultStoreConfig.logo,
    };
  } catch {
    return defaultStoreConfig;
  }
}

const StoreContext = createContext({
  config: readBusinessConfig(),
  landing: null as LandingConfig | null,
  landingLoading: true,
  landingError: '',
  landingProducts: [] as Product[],
  landingCatalogError: '',
});

const templateByNumber: Record<string, TemplateId> = {
  '1': 'editorial',
  '2': 'minimal',
  '3': 'visual',
  '4': 'catalog',
};

type StoredImageSetting = {
  src?: string;
  scale?: number;
  x?: number;
  y?: number;
  radius?: number;
};

type StoredTheme = {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  images?: Record<string, StoredImageSetting>;
};

function readTheme(template: TemplateId): StoredTheme | null {
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed?.config?.themeEditor?.[template] ?? null;
  } catch {
    return null;
  }
}

function applyImageCustomizations(theme: StoredTheme | null) {
  if (!theme?.images) return;

  const images = Array.from(
    document.querySelectorAll<HTMLImageElement>('img'),
  );

  images.forEach((img, index) => {
    if (img.hasAttribute('data-landing-image') || img.closest('[data-landing-content]')) return;
    const key = `image-${index}`;
    const setting = theme.images?.[key];

    if (!setting) return;

    if (setting.src && img.src !== setting.src) {
      img.src = setting.src;
    }

    img.style.objectPosition =
      `${setting.x ?? 50}% ${setting.y ?? 50}%`;

    img.style.transform =
      `scale(${(setting.scale ?? 100) / 100})`;

    img.style.transformOrigin = 'center';
    img.style.borderRadius =
      `${setting.radius ?? 0}px`;
  });
}

function applyTheme(theme: StoredTheme | null) {
  if (!theme) return;

  const root = document.documentElement;

  if (theme.primaryColor) {
    root.style.setProperty(
      '--primary',
      theme.primaryColor,
    );
    root.style.setProperty(
      '--ring',
      theme.primaryColor,
    );
  }

  if (theme.secondaryColor) {
    root.style.setProperty(
      '--secondary',
      theme.secondaryColor,
    );
  }

  if (theme.accentColor) {
    root.style.setProperty(
      '--accent',
      theme.accentColor,
    );
  }

  applyImageCustomizations(theme);
}

export function StoreProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const [landing, setLanding] = useState<LandingConfig | null>(null);
  const [landingLoading, setLandingLoading] = useState(true);
  const [landingError, setLandingError] = useState('');
  const [landingProducts, setLandingProducts] = useState<Product[]>([]);
  const [landingCatalogError, setLandingCatalogError] = useState('');
  useEffect(() => {
    let active = true;
    fetchPublicProducts().then(products => { if (active) setLandingProducts(products); })
      .catch(error => { if (active) setLandingCatalogError(error instanceof Error ? error.message : 'No se pudo cargar el catálogo de landing.'); });
    fetchLandingConfig().then(data => { if (active) setLanding(data); })
      .catch(error => { if (active) setLandingError(error instanceof Error ? error.message : 'No se pudo cargar la configuración de landing.'); })
      .finally(() => { if (active) setLandingLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const match = pathname.match(
      /^\/plantilla\/([1-4])(?:\/|$)/,
    );

    if (!match) return;

    const template = templateByNumber[match[1]];
    const theme = readTheme(template);

    applyTheme(theme);

    const observer = new MutationObserver(() => {
      applyImageCustomizations(theme);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return (
    <StoreContext.Provider
      value={{ config: { ...readBusinessConfig(), ...(landing ? { logo: landing.logo || '' } : {}) }, landing, landingLoading, landingError, landingProducts, landingCatalogError }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export const useStore = () =>
  useContext(StoreContext);
