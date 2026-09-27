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

export interface CarrierConnection {
  enabled: boolean;
  accountId: string;
  apiKey: string;
  status: 'not_configured' | 'credentials_saved';
}

export interface ThemeImageSetting {
  src: string;
  scale: number;
  x: number;
  y: number;
  radius: number;
}

export interface ThemeTemplateCustomization {
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
    pickup: {
      enabled: boolean;
      address: string;
      schedule: string;
    };
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
