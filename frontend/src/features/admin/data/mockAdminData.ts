import {
  defaultStoreConfig,
  mockProducts,
  type Promotion,
  type TemplateId,
} from '../../storefront/data/mockData';
import { mockOrders } from '../../storefront/data/demoOrders';
import {
  defaultLegalPages,
  LEGAL_META,
  LEGAL_TEMPLATES,
  LEGAL_ORDER,
} from '../../storefront/data/legalContent';
import { createDefaultEmailTemplates } from './emailTemplates';
import type {
  AdminConfig,
  ThemeTemplateCustomization,
} from '../types';

export {
  formatPrice,
  mockProducts,
} from '../../storefront/data/mockData';

export type {
  Product,
  ProductVariant,
  Order,
  Promotion,
  TemplateId,
} from '../../storefront/data/mockData';

export * from './emailTemplates';

export type {
  LegalType as LegalPageType,
} from '../../storefront/data/legalContent';

export const legalPageTemplates = Object.fromEntries(
  LEGAL_ORDER.map((type) => [
    type,
    {
      title: LEGAL_META[type].label,
      description: LEGAL_META[type].description,
      content: LEGAL_TEMPLATES[type],
    },
  ]),
) as Record<
  typeof LEGAL_ORDER[number],
  {
    title: string;
    description: string;
    content: string;
  }
>;

export const createDefaultLegalPages = () =>
  structuredClone(defaultLegalPages);

export const mockPromotions: Promotion[] = [
  {
    id: 'promo1',
    name: 'Descuento Verano',
    code: 'VERANO20',
    type: 'percentage',
    value: 20,
    minAmount: 20000,
    maxUses: 100,
    usedCount: 34,
    startsAt: '2025-06-01',
    endsAt: '2025-08-30',
    active: true,
  },
  {
    id: 'promo2',
    name: 'Envío Gratis',
    code: 'ENVIOGRATIS',
    type: 'free_shipping',
    value: 0,
    minAmount: 50000,
    usedCount: 0,
    startsAt: '2025-06-01',
    active: true,
  },
  {
    id: 'promo3',
    name: 'Descuento Nuevo Cliente',
    code: 'NUEVO5000',
    type: 'fixed',
    value: 5000,
    usedCount: 0,
    startsAt: '2025-06-01',
    endsAt: '2025-07-30',
    active: false,
  },
];

function defaultTheme(): ThemeTemplateCustomization {
  return {
    primaryColor: defaultStoreConfig.primaryColor,
    secondaryColor: defaultStoreConfig.secondaryColor,
    accentColor: defaultStoreConfig.accentColor,
    paletteName: 'Original',
    images: {},
  };
}

const templateThemeDefaults: Record<
  TemplateId,
  ThemeTemplateCustomization
> = {
  editorial: defaultTheme(),
  minimal: defaultTheme(),
  visual: defaultTheme(),
  catalog: defaultTheme(),
};

export const createDefaultAdminConfig = (): AdminConfig =>
  structuredClone({
    ...defaultStoreConfig,

    products: mockProducts,
    orders: mockOrders,
    promotions: mockPromotions,

    emailTemplates: createDefaultEmailTemplates(),
    legalPages: defaultLegalPages,

    authenticationConfiguration: {
      emailPassword: true,
      google: true,
      guestCheckout: true,
      googleClientId: '',
    },

    shippingConfiguration: {
      chilexpress: {
        enabled: false,
        accountId: '',
        apiKey: '',
        status: 'not_configured',
      },
      starken: {
        enabled: false,
        accountId: '',
        apiKey: '',
        status: 'not_configured',
      },
      pickup: {
        enabled: true,
        address: '',
        schedule: '',
      },
    },

    paymentConfiguration: Object.fromEntries(
      [
        'transbank',
        'mercadopago',
        'paypal',
        'linkify',
        'transfer',
      ].map((id) => [
        id,
        {
          enabled: !['paypal', 'linkify'].includes(id),
          fields: {},
        },
      ]),
    ),

    landing: {
      title: 'Bienvenido a Mi Tienda',
      description: 'Descubre nuestros productos...',
      cta: 'Ver tienda',
      heroImage: '',
      sections: {
        'Productos destacados': true,
        'Categorías': true,
        'Beneficios': true,
        'Información de contacto': true,
        'Mapa / ubicación': false,
      },
    },

    themeEditor: templateThemeDefaults,
  });
