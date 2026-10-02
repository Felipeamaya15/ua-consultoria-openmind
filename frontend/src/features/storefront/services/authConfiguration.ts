const ADMIN_STORAGE_KEY = 'ua-entrepreneur-demo-v1';

export type PublicAuthMode = 'guest' | 'login' | 'google';

export interface PublicAuthSettings {
  emailPassword: boolean;
  google: boolean;
  guestCheckout: boolean;
  requiresAuth: 'none' | 'optional' | 'required';
}

export const defaultAuthSettings: PublicAuthSettings = {
  emailPassword: true,
  google: true,
  guestCheckout: true,
  requiresAuth: 'optional',
};

export function readPublicAuthSettings(): PublicAuthSettings {
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return defaultAuthSettings;

    const config = JSON.parse(raw)?.config;
    const authConfig = config?.authenticationConfiguration;

    return {
      emailPassword:
        authConfig?.emailPassword ??
        defaultAuthSettings.emailPassword,
      google: authConfig?.google ?? defaultAuthSettings.google,
      guestCheckout:
        authConfig?.guestCheckout ??
        defaultAuthSettings.guestCheckout,
      requiresAuth:
        config?.requiresAuth ?? defaultAuthSettings.requiresAuth,
    };
  } catch {
    return defaultAuthSettings;
  }
}

export function getAvailablePublicAuthModes(
  settings: PublicAuthSettings,
): PublicAuthMode[] {
  const modes: PublicAuthMode[] = [];

  if (settings.guestCheckout && settings.requiresAuth !== 'required') {
    modes.push('guest');
  }

  if (settings.emailPassword) {
    modes.push('login');
  }

  if (settings.google) {
    modes.push('google');
  }

  return modes;
}
