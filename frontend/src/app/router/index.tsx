import { lazyPage } from '../LazyPage';
const CustomerOrders = lazyPage(() => import('../../features/storefront/pages/CustomerOrders'));
import { RequireCustomer } from '../../features/storefront/components/store/AccountNavigation';
const Profile = lazyPage(() => import('../../features/storefront/pages/Profile'));
const CommercialPreferences = lazyPage(() => import('../../features/storefront/pages/CommercialPreferences'));

import { adminRoute } from '../../features/admin/routes';
import { RequireAdmin } from '../../features/admin/auth/RequireAdmin';
import {
  createBrowserRouter,
  Navigate,
  useLocation,
} from 'react-router-dom';

import { EditorialLayout } from '../../features/storefront/components/store/EditorialLayout';
import { MinimalLayout } from '../../features/storefront/components/store/minimal/MinimalLayout';
import { VisualLayout } from '../../features/storefront/components/store/visual/VisualLayout';
import { CatalogLayout } from '../../features/storefront/components/store/catalog/CatalogLayout';
import { templateFromPath } from '../../features/storefront/visual/templates';

const EditorialHome = lazyPage(() => import('../../features/storefront/pages/EditorialHome'));
const MinimalHome = lazyPage(() => import('../../features/storefront/pages/MinimalHome'));
const VisualHome = lazyPage(() => import('../../features/storefront/pages/VisualHome'));
const VisualStory = lazyPage(() => import('../../features/storefront/pages/VisualStory'));
const CatalogHome = lazyPage(() => import('../../features/storefront/pages/CatalogHome'));

const Catalog = lazyPage(() => import('../../features/storefront/pages/Catalog'));
const ProductDetail = lazyPage(() => import('../../features/storefront/pages/ProductDetail'));
const Cart = lazyPage(() => import('../../features/storefront/pages/Cart'));
const Checkout = lazyPage(() => import('../../features/storefront/pages/Checkout'));
const OrderConfirmation = lazyPage(() => import('../../features/storefront/pages/OrderConfirmation'));
const Tracking = lazyPage(() => import('../../features/storefront/pages/Tracking'));
const Login = lazyPage(() => import('../../features/storefront/pages/Login'));
const Legal = lazyPage(() => import('../../features/storefront/pages/Legal'));

import { PendingPage } from '../../features/storefront/pages/PreviewPages';

import { StoreProvider, useStore } from '../../features/storefront/context/StoreContext';
import { CartProvider } from '../../features/storefront/context/CartContext';
import { OrderProvider } from '../../features/storefront/context/OrderContext';
import { CookieConsentBanner } from '../../features/storefront/components/store/CookieConsentBanner';
import { StoreSeoMetadata } from '../../features/storefront/components/store/StoreSeoMetadata';

function StorefrontProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StoreProvider>
      <StoreSeoMetadata />
      <CartProvider>
        <OrderProvider>
          {children}
          <CookieConsentBanner />
        </OrderProvider>
      </CartProvider>
    </StoreProvider>
  );
}

export function ActiveStorefrontLayout() {
  const { pathname } = useLocation();
  const { activeTemplate } = useStore();
  if (
    /^\/(?:admin|emprendedor)\/preview\/plantilla\//.test(pathname) &&
    !templateFromPath(pathname)
  ) {
    return <Navigate to="/" replace />;
  }
  switch (activeTemplate) {
    case 'minimal':
      return <MinimalLayout />;
    case 'visual':
      return <VisualLayout />;
    case 'catalog':
      return <CatalogLayout />;
    case 'editorial':
    default:
      return <EditorialLayout />;
  }
}

export function ActiveStorefrontHome() {
  const { activeTemplate } = useStore();
  switch (activeTemplate) {
    case 'minimal':
      return <MinimalHome />;
    case 'visual':
      return <VisualHome />;
    case 'catalog':
      return <CatalogHome />;
    case 'editorial':
    default:
      return <EditorialHome />;
  }
}

const sharedChildren = [
  { path: 'mis-pedidos', element: <RequireCustomer><CustomerOrders /></RequireCustomer> },
  { path: 'mis-pedidos/:id', element: <RequireCustomer><CustomerOrders /></RequireCustomer> },
  { path: 'perfil', element: <RequireCustomer><Profile /></RequireCustomer> },
  { path: 'preferencias-comerciales', element: <CommercialPreferences /> },
  {
    path: 'catalogo',
    element: <Catalog />,
  },
  {
    path: 'producto/:id',
    element: <ProductDetail />,
  },
  {
    path: 'carrito',
    element: <Cart />,
  },
  {
    path: 'compra',
    element: <Checkout />,
  },
  {
    path: 'pedido-confirmado',
    element: <OrderConfirmation />,
  },
  {
    path: 'seguimiento',
    element: <Tracking />,
  },
  {
    path: 'ingresar',
    element: <Login />,
  },
  {
    path: 'legal/:type',
    element: <Legal />,
  },
  {
    path: 'nuestra-historia',
    element: <VisualStory />,
  },
  {
    path: '*',
    element: <PendingPage title="Página no encontrada" />,
  },
];

const storefrontChildren = [
  {
    index: true,
    element: <ActiveStorefrontHome />,
  },
  ...sharedChildren,
];

export const router = createBrowserRouter([
  adminRoute,
  { path: '/landing', element: <Navigate to="/" replace /> },

  {
    path: '/plantilla',
    element: <Navigate to="/" replace />,
  },
  {
    path: '/plantilla/:id',
    element: <Navigate to="/" replace />,
  },
  {
    path: '/plantilla/:id/*',
    element: <Navigate to="/" replace />,
  },

  {
    path: '/admin/preview/plantilla/:templateId',
    element: <RequireAdmin />,
    children: [
      {
        element: (
          <StorefrontProviders>
            <ActiveStorefrontLayout />
          </StorefrontProviders>
        ),
        children: storefrontChildren,
      },
    ],
  },

  {
    path: '/emprendedor/preview/plantilla/:templateId',
    element: <RequireAdmin />,
    children: [
      {
        element: (
          <StorefrontProviders>
            <ActiveStorefrontLayout />
          </StorefrontProviders>
        ),
        children: storefrontChildren,
      },
    ],
  },

  {
    path: '/',
    element: (
      <StorefrontProviders>
        <ActiveStorefrontLayout />
      </StorefrontProviders>
    ),
    children: storefrontChildren,
  },
]);
