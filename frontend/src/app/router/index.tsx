import { lazyPage } from '../LazyPage';
const CustomerOrders = lazyPage(() => import('../../features/storefront/pages/CustomerOrders'));
import { RequireCustomer } from '../../features/storefront/components/store/AccountNavigation';
const Profile = lazyPage(() => import('../../features/storefront/pages/Profile'));

import { adminRoute } from '../../features/admin/routes';
import {
  createBrowserRouter,
  Navigate,
} from 'react-router-dom';

import { EditorialLayout } from '../../features/storefront/components/store/EditorialLayout';
import { MinimalLayout } from '../../features/storefront/components/store/minimal/MinimalLayout';
import { VisualLayout } from '../../features/storefront/components/store/visual/VisualLayout';
import { CatalogLayout } from '../../features/storefront/components/store/catalog/CatalogLayout';

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

import { StoreProvider } from '../../features/storefront/context/StoreContext';
import { CartProvider } from '../../features/storefront/context/CartContext';
import { OrderProvider } from '../../features/storefront/context/OrderContext';
import { CookieConsentBanner } from '../../features/storefront/components/store/CookieConsentBanner';

function StorefrontProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StoreProvider>
      <CartProvider>
        <OrderProvider>
          {children}
          <CookieConsentBanner />
        </OrderProvider>
      </CartProvider>
    </StoreProvider>
  );
}

const sharedChildren = [
  { path: 'mis-pedidos', element: <RequireCustomer><CustomerOrders /></RequireCustomer> },
  { path: 'mis-pedidos/:id', element: <RequireCustomer><CustomerOrders /></RequireCustomer> },
  { path: 'perfil', element: <RequireCustomer><Profile /></RequireCustomer> },
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
    path: '*',
    element: <PendingPage title="Página no encontrada" />,
  },
];

export const router = createBrowserRouter([
  adminRoute,
  { path: "/landing", element: <Navigate to="/" replace /> },
  /*
   * ==========================================================
   * INICIO
   * ==========================================================
   */
  {
    path: '/',
    element: <Navigate to="/plantilla/1" replace />,
  },

  /*
   * ==========================================================
   * PLANTILLA 1 — EDITORIAL
   * ==========================================================
   */
  {
    path: '/plantilla/1',
    element: (
      <StorefrontProviders>
        <EditorialLayout />
      </StorefrontProviders>
    ),
    children: [
      {
        index: true,
        element: <EditorialHome />,
      },
      ...sharedChildren,
    ],
  },

  /*
   * ==========================================================
   * PLANTILLA 2 — MINIMAL
   * ==========================================================
   */
  {
    path: '/plantilla/2',
    element: (
      <StorefrontProviders>
        <MinimalLayout />
      </StorefrontProviders>
    ),
    children: [
      {
        index: true,
        element: <MinimalHome />,
      },
      ...sharedChildren,
    ],
  },

  /*
   * ==========================================================
   * PLANTILLA 3 — VISUAL / VELTA
   * ==========================================================
   */
  {
    path: '/plantilla/3',
    element: (
      <StorefrontProviders>
        <VisualLayout />
      </StorefrontProviders>
    ),
    children: [
      {
        index: true,
        element: <VisualHome />,
      },
      {
        path: 'nuestra-historia',
        element: <VisualStory />,
      },
      ...sharedChildren,
    ],
  },

  /*
   * ==========================================================
   * PLANTILLA 4 — CATALOG
   * ==========================================================
   */
  {
    path: '/plantilla/4',
    element: (
      <StorefrontProviders>
        <CatalogLayout />
      </StorefrontProviders>
    ),
    children: [
      {
        index: true,
        element: <CatalogHome />,
      },
      ...sharedChildren,
    ],
  },


  /*
   * ==========================================================
   * FALLBACK
   * ==========================================================
   */
  {
    path: '*',
    element: <Navigate to="/plantilla/1" replace />,
  },
]);
