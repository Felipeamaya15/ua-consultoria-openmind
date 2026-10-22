import type {
  Product,
  Order,
  Promotion,
  StoreConfig,
  TemplateId,
} from '../../storefront/data/mockData';
import type {
  LegalType,
  LegalPage,
} from '../../storefront/data/legalContent';
import type { EmailTemplates } from '../data/emailTemplates';
import type { VisualConfigOverrides } from '../../storefront/visual/types';
import type { ThemeImageSetting } from '../../storefront/visual/imageSettings';
export type { ThemeImageSetting } from '../../storefront/visual/imageSettings';

export interface ShippingRate {
  region: string;
  comuna: string;
  monto: number;
  plazo_dias: number | null;
}

export interface CarrierConnection {
  enabled: boolean;
  accountId: string;
  apiKey: string;
  status: 'not_configured' | 'credentials_saved';
  tarifas?: ShippingRate[];
}

export interface ThemeTemplateCustomization {
  blockStyles?: import('../../storefront/visual/blockAppearance').BlockStyles;
  visualConfig?: VisualConfigOverrides;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  paletteName: string;
  images: Record<string, ThemeImageSetting>;
}

export type ThemeEditorConfiguration = Record<
  TemplateId,
  ThemeTemplateCustomization
>;

export interface AdminConfig extends StoreConfig {
  products: Product[];
  orders: Order[];
  promotions: Promotion[];
  emailTemplates: EmailTemplates;
  legalPages: Record<LegalType, LegalPage>;

  authenticationConfiguration: {
    emailPassword: boolean;
    google: boolean;
    guestCheckout: boolean;
    googleClientId: string;
  };

  shippingConfiguration: {
    chilexpress: CarrierConnection;
    starken: CarrierConnection;
    pickup: import('../services/pickupConfiguration').PickupConfiguration;
  };

  paymentConfiguration: Record<
    string,
    {
      enabled: boolean;
      fields: Record<string, string>;
    }
  >;

  landing: {
    title: string;
    description: string;
    cta: string;
    heroImage: string;
    sections: Record<string, boolean>;
  };

  themeEditor: ThemeEditorConfiguration;
}
