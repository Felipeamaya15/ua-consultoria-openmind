import { readStoredStoreConfig, type StoreIdentity } from '../visual/storage';
import { isRecord } from '../visual/resolveVisualConfig';

export interface CheckoutAuthSettings {
  emailPassword: boolean;
  google: boolean;
  guestCheckout: boolean;
  requiresAuth: 'none' | 'optional' | 'required';
}

export function readCheckoutAuthSettings(identity: StoreIdentity | null): CheckoutAuthSettings {
  const config = readStoredStoreConfig(identity);
  const auth = isRecord(config.authenticationConfiguration) ? config.authenticationConfiguration : {};
  return {
    emailPassword: typeof auth.emailPassword === 'boolean' ? auth.emailPassword : true,
    google: typeof auth.google === 'boolean' ? auth.google : true,
    guestCheckout: typeof auth.guestCheckout === 'boolean' ? auth.guestCheckout : true,
    requiresAuth: config.requiresAuth === 'none' || config.requiresAuth === 'required' ? config.requiresAuth : 'optional',
  };
}
