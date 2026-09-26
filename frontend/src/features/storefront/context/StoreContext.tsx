import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  defaultStoreConfig,
  type TemplateId,
  type StoreConfig,
} from '../data/mockData';

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
      value={{ config: readBusinessConfig() }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export const useStore = () =>
  useContext(StoreContext);
